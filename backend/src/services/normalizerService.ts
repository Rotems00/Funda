import { Fundamentals } from '../engine/ratingEngine';

/**
 * Normalizer Service
 * Converts raw Polygon.io data into the shapes the rating engine
 * and price-stat display expect
 */

export interface QuarterlyFinancial {
  cik?: string;
  fiscalPeriod?: string;
  fiscalYear?: string;
  endDate?: string;
  revenue?: number;
  grossProfit?: number;
  netIncome?: number;
  eps?: number;
  operatingIncome?: number;
  nonOperatingIncome?: number;
  operatingCashFlow?: number;
  dilutedShares?: number;
  cash?: number;
  capitalExpenditure?: number;
  buybacks?: number;
  dividendsPaid?: number;
  currentAssets?: number;
  currentLiabilities?: number;
  inventory?: number;
  accountsPayable?: number;
  totalLiabilities?: number;
  longTermDebt?: number;
  intangibleAssets?: number;
  totalEquity?: number;
  totalAssets?: number;
}

interface PriceBar {
  date: Date;
  high?: number;
  close?: number;
}

interface PriceStats {
  price: number;
  ytdChange: number;
  fromATH: number;
}

export interface AnnualDataPoint {
  year: string;
  revenue: number;
  grossProfit: number;
  revenueYoY: number | null;
  netIncome: number;
  eps: number;
  netMargin: number;
  operatingCashFlow: number;
  freeCashFlow: number | null; // null when SEC EDGAR has no CapEx data for this company
  cash: number | null; // null when SEC EDGAR has no data for this company
  buybacks: number | null; // share repurchase spend; null when SEC EDGAR has no data
  debt: number | null;
  debtToEquity: number | null;
  currentRatio: number | null;
}

export interface QuarterlyDataPoint {
  label: string; // e.g. "Q1 2026"
  revenue: number;
  grossProfit: number;
  revenueYoY: number | null;
  netIncome: number;
  eps: number;
  netMargin: number;
  operatingCashFlow: number;
  freeCashFlow: number | null;
  cash: number | null;
  buybacks: number | null;
  debt: number | null;
  debtToEquity: number | null;
  currentRatio: number | null;
}

export interface DisplayRatios {
  peRatio: number | null;
  pegRatio: number | null;
  forwardPE?: number | null; // price / next-FY consensus EPS (set in the route from FMP estimates)
  debtToEquity: number;
  netMargin: number;
  roic: number;
}

// Internal placeholder for peRatio/pegRatio math in the rating engine when a
// company has no positive TTM earnings (P/E is undefined in that case) -
// never surface this value directly, use buildRatios() for display
const NO_EARNINGS_PE_SENTINEL = 999;

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

/**
 * Polygon's financials endpoint matches by ticker text, not company identity -
 * a ticker that was reused over time (e.g. "NU" belonged to Northeast Utilities
 * before Nu Holdings took it over in 2021) can return filings from the wrong,
 * unrelated legal entity. Keep only quarters whose CIK matches the company
 * currently holding the ticker.
 */
export function filterByCik(quarters: QuarterlyFinancial[], cik: string | undefined): QuarterlyFinancial[] {
  if (!cik) return quarters;
  return quarters.filter(q => q.cik === cik);
}

function sumField(quarters: QuarterlyFinancial[], field: keyof QuarterlyFinancial, startIdx: number, count = 4): number {
  return quarters
    .slice(startIdx, startIdx + count)
    .reduce((sum, q) => sum + (Number(q[field]) || 0), 0);
}

function pctChange(current: number, prior: number): number {
  if (!prior) return 0;
  return ((current - prior) / Math.abs(prior)) * 100;
}

/**
 * Balance-sheet snapshot fields aren't always tagged on every filing (e.g. a
 * preliminary recent quarter may be missing long_term_debt even though the
 * prior quarter has it), so walk back to the most recent quarter that
 * actually has the field instead of blindly trusting quarters[0]
 */
function mostRecentValue(quarters: QuarterlyFinancial[], field: keyof QuarterlyFinancial, lookback = 4, startIdx = 0): number {
  for (const q of quarters.slice(startIdx, startIdx + lookback)) {
    if (typeof q[field] === 'number') return q[field] as number;
  }
  return 0;
}

/**
 * Build the Fundamentals object the rating engine needs from a list of
 * quarterly financials, ordered most-recent-first (as Polygon returns them)
 */
export function buildFundamentals(quarters: QuarterlyFinancial[], currentPrice: number, sharesOutstanding?: number): Fundamentals {
  const latest = {
    totalEquity: mostRecentValue(quarters, 'totalEquity'),
    longTermDebt: mostRecentValue(quarters, 'longTermDebt'),
    currentAssets: mostRecentValue(quarters, 'currentAssets'),
    currentLiabilities: mostRecentValue(quarters, 'currentLiabilities'),
    totalAssets: mostRecentValue(quarters, 'totalAssets'),
    intangibleAssets: mostRecentValue(quarters, 'intangibleAssets'),
    dilutedShares: mostRecentValue(quarters, 'dilutedShares'),
    cash: mostRecentValue(quarters, 'cash')
  };
  const hasEdgarCash = quarters.slice(0, 4).some(q => typeof q.cash === 'number');
  const hasEdgarBuybacks = quarters.slice(0, 4).some(q => typeof q.buybacks === 'number');
  // Year-ago snapshot, for trend comparisons (is the moat strengthening or eroding?)
  const yearAgo = {
    totalEquity: mostRecentValue(quarters, 'totalEquity', 4, 4),
    longTermDebt: mostRecentValue(quarters, 'longTermDebt', 4, 4),
    dilutedShares: mostRecentValue(quarters, 'dilutedShares', 4, 4)
  };

  const ttmRevenue = sumField(quarters, 'revenue', 0);
  const priorTtmRevenue = sumField(quarters, 'revenue', 4);
  const twoYearsAgoTtmRevenue = sumField(quarters, 'revenue', 8);

  const ttmNetIncome = sumField(quarters, 'netIncome', 0);
  const priorTtmNetIncome = sumField(quarters, 'netIncome', 4);

  // Split-safe EPS: summing reported per-quarter EPS breaks across a stock split
  // (pre- and post-split quarters use different share bases - a 5:1 split mixes
  // e.g. ~1.84 and ~0.37 figures into nonsense, which is exactly what zeroed out
  // ServiceNow's P/E). Net income is split-invariant, so derive EPS from TTM net
  // income over the current, split-adjusted share count (from ticker details),
  // falling back to reported EPS only when that share count is unavailable.
  const currentShares = sharesOutstanding || latest.dilutedShares || 0;
  const ttmEps = currentShares > 0 ? ttmNetIncome / currentShares : sumField(quarters, 'eps', 0);
  const priorTtmEps = currentShares > 0 ? priorTtmNetIncome / currentShares : sumField(quarters, 'eps', 4);

  const ttmOperatingIncome = sumField(quarters, 'operatingIncome', 0);
  const priorTtmOperatingIncome = sumField(quarters, 'operatingIncome', 4);
  const ttmNonOperatingIncome = sumField(quarters, 'nonOperatingIncome', 0);

  const revenueYoY = pctChange(ttmRevenue, priorTtmRevenue);
  const epsYoY = pctChange(ttmEps, priorTtmEps);
  const priorRevenueYoY = pctChange(priorTtmRevenue, twoYearsAgoTtmRevenue);

  // Polygon's free-tier financials endpoint only gives a few years of quarterly
  // history (no dedicated 5y annual series), so this CAGR covers whatever span
  // of TTM windows is actually available rather than a true 5-year figure
  const ttmWindows: number[] = [];
  for (let i = 0; i + 4 <= quarters.length; i += 4) {
    ttmWindows.push(sumField(quarters, 'revenue', i));
  }
  const yearsSpan = ttmWindows.length - 1;
  const revenueCagr5Y = yearsSpan > 0 && ttmWindows[ttmWindows.length - 1] > 0
    ? (Math.pow(ttmWindows[0] / ttmWindows[ttmWindows.length - 1], 1 / yearsSpan) - 1) * 100
    : revenueYoY;

  const netMargin = ttmRevenue > 0 ? (ttmNetIncome / ttmRevenue) * 100 : 0;
  const roe = (latest.totalEquity || 0) > 0 ? (ttmNetIncome / (latest.totalEquity as number)) * 100 : 0;

  // ROIC proxy: net income over (long-term debt + equity), standing in for
  // NOPAT/(debt+equity) since Polygon doesn't break out a tax-adjusted
  // operating income figure
  const investedCapital = (latest.totalEquity || 0) + (latest.longTermDebt || 0);
  const roic = investedCapital > 0 ? (ttmNetIncome / investedCapital) * 100 : 0;

  const priorInvestedCapital = (yearAgo.totalEquity || 0) + (yearAgo.longTermDebt || 0);
  const priorRoic = priorInvestedCapital > 0 ? (priorTtmNetIncome / priorInvestedCapital) * 100 : roic;
  const roicYoY = roic - priorRoic;

  const operatingMargin = ttmRevenue > 0 ? (ttmOperatingIncome / ttmRevenue) * 100 : 0;
  const priorOperatingMargin = priorTtmRevenue > 0 ? (priorTtmOperatingIncome / priorTtmRevenue) * 100 : operatingMargin;
  const operatingMarginYoY = operatingMargin - priorOperatingMargin;

  // Ignore implausibly large swings (>50%/yr): those signal a stock split or
  // structural change in the reported share base, not organic dilution/buybacks
  const rawShareCountYoY = pctChange(latest.dilutedShares || 0, yearAgo.dilutedShares || 0);
  const shareCountYoY = Math.abs(rawShareCountYoY) > 50 ? 0 : rawShareCountYoY;

  const intangibleAssetRatio = (latest.totalAssets || 0) > 0
    ? (latest.intangibleAssets || 0) / (latest.totalAssets as number)
    : 0;

  const peRatio = ttmEps > 0 ? currentPrice / ttmEps : NO_EARNINGS_PE_SENTINEL;

  // Blend trailing EPS growth with the longer CAGR rather than leaning on
  // either alone, so a single noisy quarter (e.g. a one-off charge) doesn't
  // dominate the growth figure PEG is normalized against
  const positiveGrowthRates = [epsYoY, revenueCagr5Y, revenueYoY].filter(g => g > 0);
  const growthForPeg = positiveGrowthRates.length > 0
    ? positiveGrowthRates.reduce((a, b) => a + b, 0) / positiveGrowthRates.length
    : 0.1;
  const pegRatio = peRatio / growthForPeg;

  // Net of cash when SEC EDGAR has data for this company - a net cash
  // position (more cash than debt) naturally yields a negative ratio, which
  // the rating engine treats as the safest case
  const debtToEquity = (latest.totalEquity || 0) > 0
    ? ((latest.longTermDebt || 0) - (hasEdgarCash ? (latest.cash || 0) : 0)) / (latest.totalEquity as number)
    : ((latest.longTermDebt || 0) > 0 ? 5 : 0);

  // Earnings quality: does operating cash flow confirm the reported profit?
  const ttmOperatingCashFlow = sumField(quarters, 'operatingCashFlow', 0);
  const ocfToNetIncome = ttmNetIncome > 0
    ? ttmOperatingCashFlow / ttmNetIncome
    : (ttmOperatingCashFlow > 0 ? 1.5 : 0.3);

  // Real buyback yield from SEC EDGAR (TTM buybacks / approximate market cap);
  // null (not 0) when EDGAR has no data, so the rating engine knows to fall
  // back to the diluted-share-count proxy instead of reading "no buybacks"
  const ttmBuybacks = sumField(quarters, 'buybacks', 0);
  const approxMarketCap = currentPrice * currentShares;
  const buybackYield = hasEdgarBuybacks && approxMarketCap > 0
    ? (ttmBuybacks / approxMarketCap) * 100
    : null;

  const currentRatio = (latest.currentLiabilities || 0) > 0
    ? (latest.currentAssets as number) / (latest.currentLiabilities as number)
    : 2;

  // Interest coverage proxy: operating income over non-operating losses (a stand-in
  // for interest expense, which Polygon doesn't expose as its own line item)
  const interestCoverage = ttmNonOperatingIncome < 0
    ? ttmOperatingIncome / Math.abs(ttmNonOperatingIncome)
    : 10;

  const trajectoryDelta = revenueYoY - priorRevenueYoY;
  const trajectory: Fundamentals['trajectory'] =
    trajectoryDelta > 3 ? 'accelerating' : trajectoryDelta < -3 ? 'cooling' : 'steady';

  return {
    revenue: ttmRevenue,
    revenueYoY,
    revenueCagr5Y,
    eps: ttmEps,
    epsYoY,
    netMargin,
    roe,
    roic,
    roicYoY,
    operatingMarginYoY,
    shareCountYoY,
    buybackYield,
    ocfToNetIncome,
    intangibleAssetRatio,
    peRatio,
    pegRatio,
    debtToEquity,
    currentRatio,
    interestCoverage,
    trajectory
  };
}

/**
 * Build a year-over-year revenue/earnings series for charting.
 * Only complete fiscal years (4 quarters present) are included, since a
 * partial current year would show a misleadingly low revenue bar
 *
 * Quarters must be ordered most-recent-first (as Polygon returns them).
 * Polygon occasionally mixes in old comparative-period filings (e.g. a
 * lone restated "2011" year alongside the real recent history), so this
 * only keeps the most recent `maxYears` contiguous years
 */
export function buildAnnualSeries(quarters: QuarterlyFinancial[], maxYears = 5): AnnualDataPoint[] {
  const byYear = new Map<string, QuarterlyFinancial[]>();
  for (const q of quarters) {
    if (!q.fiscalYear) continue;
    const group = byYear.get(q.fiscalYear) || [];
    group.push(q);
    byYear.set(q.fiscalYear, group);
  }

  const years = [...byYear.entries()]
    .filter(([, qs]) => qs.length === 4)
    .map(([year, qs]) => {
      const revenue = qs.reduce((sum, q) => sum + (q.revenue || 0), 0);
      const grossProfit = qs.reduce((sum, q) => sum + (q.grossProfit || 0), 0);
      const netIncome = qs.reduce((sum, q) => sum + (q.netIncome || 0), 0);
      const eps = qs.reduce((sum, q) => sum + (q.eps || 0), 0);
      const operatingCashFlow = qs.reduce((sum, q) => sum + (q.operatingCashFlow || 0), 0);
      const netMargin = revenue > 0 ? round1((netIncome / revenue) * 100) : 0;

      // SEC EDGAR coverage check + true FCF (only meaningful if every quarter
      // in the year actually has CapEx data, otherwise it'd understate the year)
      const hasFullYearCapex = qs.every(q => typeof q.capitalExpenditure === 'number');
      const capitalExpenditure = qs.reduce((sum, q) => sum + (q.capitalExpenditure || 0), 0);
      const freeCashFlow = hasFullYearCapex ? operatingCashFlow - capitalExpenditure : null;

      // Debt/liquidity are balance-sheet snapshots, not income-statement
      // flows - use the fiscal year-end quarter (qs[0], most recent in the
      // group), falling back to an earlier quarter in the same year if it's
      // missing the field
      const equity = mostRecentValue(qs, 'totalEquity', 4);
      const longTermDebt = mostRecentValue(qs, 'longTermDebt', 4);
      const currentAssets = mostRecentValue(qs, 'currentAssets', 4);
      const currentLiabilities = mostRecentValue(qs, 'currentLiabilities', 4);
      const hasCash = qs.some(q => typeof q.cash === 'number');
      const cash = hasCash ? mostRecentValue(qs, 'cash', 4) : null;

      // Buybacks are a flow: sum the year's quarters, but only when at least one
      // quarter actually has data (else null, so "no data" isn't shown as $0)
      const hasBuybacks = qs.some(q => typeof q.buybacks === 'number');
      const buybacks = hasBuybacks ? qs.reduce((sum, q) => sum + (q.buybacks || 0), 0) : null;

      return {
        year,
        revenue: round1(revenue),
        grossProfit: round1(grossProfit),
        netIncome: round1(netIncome),
        eps: round1(eps),
        netMargin,
        operatingCashFlow: round1(operatingCashFlow),
        freeCashFlow: freeCashFlow !== null ? round1(freeCashFlow) : null,
        cash: cash !== null ? round1(cash) : null,
        buybacks: buybacks !== null ? round1(buybacks) : null,
        debt: round1(longTermDebt),
        debtToEquity: equity > 0 ? round1(longTermDebt / equity) : null,
        currentRatio: currentLiabilities > 0 ? round1(currentAssets / currentLiabilities) : null
      };
    })
    .sort((a, b) => a.year.localeCompare(b.year)); // oldest first, for left-to-right charting

  if (years.length === 0) return [];

  // Drop genuinely old stray filings (e.g. a lone restated "2011" alongside
  // 2022-2025), identified by a large gap from the most recent year. A single
  // missing year within the recent window (e.g. Polygon dropping one quarter
  // so a fiscal year never reaches 4 complete quarters) should NOT discard
  // everything older than it - it just means that one year has no bar
  const mostRecentYear = parseInt(years[years.length - 1].year, 10);
  const recent = years.filter(y => mostRecentYear - parseInt(y.year, 10) <= maxYears + 2);

  // Only compute YoY between actually consecutive calendar years - a gap
  // (the missing year case above) means there's nothing meaningful to compare
  const withYoY = recent.map((y, i) => {
    const prior = recent[i - 1];
    const isConsecutive = i > 0 && parseInt(y.year, 10) - parseInt(prior.year, 10) === 1;
    return {
      ...y,
      revenueYoY: isConsecutive && prior.revenue > 0
        ? round1(((y.revenue - prior.revenue) / prior.revenue) * 100)
        : null
    };
  });

  return withYoY.slice(-maxYears);
}

/**
 * Build a quarter-by-quarter series for charting, oldest first.
 * revenueYoY compares each quarter to the same quarter a year earlier
 * (index + 4 in the original most-recent-first order)
 */
export function buildQuarterlySeries(quarters: QuarterlyFinancial[]): QuarterlyDataPoint[] {
  const oldestFirst = [...quarters].reverse();

  // Balance-sheet fields aren't tagged on every quarter's filing - carry
  // forward the last known value (never look ahead) so a gap doesn't read
  // as "zero debt" when it just means "unchanged since last reported"
  let lastEquity: number | undefined;
  let lastLongTermDebt: number | undefined;
  let lastCurrentAssets: number | undefined;
  let lastCurrentLiabilities: number | undefined;
  let lastCash: number | undefined;

  return oldestFirst.map((q, i, arr) => {
    const yearAgo = arr[i - 4];

    lastEquity = q.totalEquity ?? lastEquity;
    lastLongTermDebt = q.longTermDebt ?? lastLongTermDebt;
    lastCurrentAssets = q.currentAssets ?? lastCurrentAssets;
    lastCurrentLiabilities = q.currentLiabilities ?? lastCurrentLiabilities;
    lastCash = q.cash ?? lastCash;

    const freeCashFlow = typeof q.capitalExpenditure === 'number'
      ? (q.operatingCashFlow || 0) - q.capitalExpenditure
      : null;

    return {
      label: `${q.fiscalPeriod || ''} ${q.fiscalYear || ''}`.trim(),
      revenue: round1(q.revenue || 0),
      grossProfit: round1(q.grossProfit || 0),
      revenueYoY: yearAgo?.revenue
        ? round1((((q.revenue || 0) - yearAgo.revenue) / yearAgo.revenue) * 100)
        : null,
      netIncome: round1(q.netIncome || 0),
      eps: round1(q.eps || 0),
      netMargin: q.revenue ? round1(((q.netIncome || 0) / q.revenue) * 100) : 0,
      operatingCashFlow: round1(q.operatingCashFlow || 0),
      freeCashFlow: freeCashFlow !== null ? round1(freeCashFlow) : null,
      cash: lastCash !== undefined ? round1(lastCash) : null,
      buybacks: typeof q.buybacks === 'number' ? round1(q.buybacks) : null,
      debt: round1(lastLongTermDebt || 0),
      debtToEquity: lastEquity && lastEquity > 0 ? round1((lastLongTermDebt || 0) / lastEquity) : null,
      currentRatio: lastCurrentLiabilities && lastCurrentLiabilities > 0 ? round1((lastCurrentAssets || 0) / lastCurrentLiabilities) : null
    };
  });
}

/**
 * Build price display stats (current price, YTD change, distance from ATH)
 * from daily bars (covering YTD) and weekly bars (covering a longer ATH lookback)
 */
export function buildPriceStats(dailyPrices: PriceBar[], weeklyPrices: PriceBar[]): PriceStats {
  const currentPrice = dailyPrices[0]?.close || 0;
  const oldestInRange = dailyPrices[dailyPrices.length - 1];
  const ytdChange = oldestInRange?.close ? ((currentPrice - oldestInRange.close) / oldestInRange.close) * 100 : 0;

  const highs = [...dailyPrices, ...weeklyPrices]
    .map(bar => bar.high || 0)
    .filter(high => high > 0);
  const ath = highs.length ? Math.max(...highs, currentPrice) : currentPrice;
  const fromATH = ath > 0 ? ((currentPrice - ath) / ath) * 100 : 0;

  return { price: round1(currentPrice), ytdChange: round1(ytdChange), fromATH: round1(fromATH) };
}

/**
 * Build the ratios object for API display, rounded to 1 decimal place.
 * P/E and PEG are null (not a fake number) when TTM earnings aren't positive,
 * since a price/earnings ratio is undefined without positive earnings
 */
export function buildRatios(fundamentals: Fundamentals): DisplayRatios {
  const hasPositiveEarnings = fundamentals.eps > 0;

  return {
    peRatio: hasPositiveEarnings ? round1(fundamentals.peRatio) : null,
    pegRatio: hasPositiveEarnings ? round1(fundamentals.pegRatio) : null,
    debtToEquity: round1(fundamentals.debtToEquity),
    netMargin: round1(fundamentals.netMargin),
    roic: round1(fundamentals.roic)
  };
}

export default {
  buildFundamentals,
  buildPriceStats,
  buildRatios,
  buildAnnualSeries,
  buildQuarterlySeries,
  filterByCik
};
