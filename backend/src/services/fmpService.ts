import axios from 'axios';
import { QuarterlyFinancial } from './normalizerService';

/**
 * Financial Modeling Prep (FMP) service - the primary fundamentals, price,
 * search and analyst-estimate source. FMP returns split-adjusted, standardized
 * statements with complete recent quarters (and covers foreign filers Polygon
 * misses), so it replaces Polygon as the base feed. SEC EDGAR remains a
 * fill-only cross-check for any field FMP happens to leave blank.
 */

const FMP_API_KEY = process.env.FMP_API_KEY;
const BASE = 'https://financialmodelingprep.com/stable';

const round1 = (n: number) => Math.round(n * 10) / 10;

async function fmpGet(path: string, params: Record<string, string | number> = {}): Promise<any> {
  const search = new URLSearchParams({ ...params, apikey: FMP_API_KEY || '' } as Record<string, string>);
  const response = await axios.get(`${BASE}/${path}?${search.toString()}`, { timeout: 15_000 });
  return response.data;
}

export interface CompanyInfo {
  ticker: string;
  name: string;
  cik: string;
  exchange?: string;
  market_cap?: number;
  sharesOutstanding?: number;
  sector?: string;
  industry?: string;
  isEtf?: boolean; // true for ETFs or funds (not a common stock)
  description?: string; // business summary, for the AI business review
  ceo?: string;
  website?: string;
}

/**
 * Company profile (mirrors the old Polygon getCompanyInfo shape)
 */
export async function getCompanyInfo(ticker: string): Promise<CompanyInfo | null> {
  try {
    const data = await fmpGet('profile', { symbol: ticker });
    const p = Array.isArray(data) ? data[0] : null;
    if (!p) return null;
    return {
      ticker: p.symbol,
      name: p.companyName,
      cik: p.cik,
      exchange: p.exchange,
      market_cap: p.marketCap,
      // current shares from market cap / price (FMP profile has no shares field);
      // buildFundamentals falls back to the latest reported diluted shares anyway
      sharesOutstanding: p.marketCap && p.price ? p.marketCap / p.price : undefined,
      sector: p.sector,
      industry: p.industry,
      isEtf: !!(p.isEtf || p.isFund),
      description: p.description,
      ceo: p.ceo,
      website: p.website
    };
  } catch (error) {
    console.error(`FMP company info error for ${ticker}:`, error);
    throw error;
  }
}

function abs(v: number | null | undefined): number | undefined {
  return typeof v === 'number' ? Math.abs(v) : undefined;
}

/**
 * Quarterly financials, merging FMP's income / balance-sheet / cash-flow
 * statements (matched by period end-date) into the QuarterlyFinancial shape the
 * rating engine consumes. Most-recent-first, like Polygon returned.
 */
export async function getQuarterlyFinancials(ticker: string, limit = 20): Promise<QuarterlyFinancial[]> {
  try {
    const [income, balance, cashflow] = await Promise.all([
      fmpGet('income-statement', { symbol: ticker, period: 'quarter', limit }),
      fmpGet('balance-sheet-statement', { symbol: ticker, period: 'quarter', limit }),
      fmpGet('cash-flow-statement', { symbol: ticker, period: 'quarter', limit })
    ]);
    if (!Array.isArray(income)) return [];

    const balByDate = new Map<string, any>((Array.isArray(balance) ? balance : []).map((b: any) => [b.date, b]));
    const cfByDate = new Map<string, any>((Array.isArray(cashflow) ? cashflow : []).map((c: any) => [c.date, c]));

    return income.map((i: any) => {
      const b = balByDate.get(i.date) || {};
      const c = cfByDate.get(i.date) || {};
      return {
        cik: i.cik,
        fiscalPeriod: i.period, // "Q1".."Q4"
        fiscalYear: i.fiscalYear != null ? String(i.fiscalYear) : undefined,
        endDate: i.date,
        revenue: i.revenue,
        grossProfit: i.grossProfit,
        netIncome: i.netIncome,
        eps: i.epsDiluted,
        operatingIncome: i.operatingIncome,
        nonOperatingIncome: i.totalOtherIncomeExpensesNet,
        operatingCashFlow: c.operatingCashFlow ?? c.netCashProvidedByOperatingActivities,
        dilutedShares: i.weightedAverageShsOutDil,
        cash: b.cashAndCashEquivalents,
        // FMP reports these cash outflows as negatives; the rating engine expects
        // positive magnitudes (matching the EDGAR convention)
        capitalExpenditure: abs(c.capitalExpenditure),
        buybacks: abs(c.commonStockRepurchased),
        dividendsPaid: abs(c.commonDividendsPaid ?? c.netDividendsPaid),
        currentAssets: b.totalCurrentAssets,
        currentLiabilities: b.totalCurrentLiabilities,
        inventory: b.inventory,
        accountsPayable: b.accountPayables,
        totalLiabilities: b.totalLiabilities,
        longTermDebt: b.longTermDebt,
        intangibleAssets: b.intangibleAssets,
        totalEquity: b.totalStockholdersEquity,
        totalAssets: b.totalAssets
      };
    });
  } catch (error) {
    console.error(`FMP financials error for ${ticker}:`, error);
    throw error;
  }
}

/**
 * Price stats (current price, YTD change, distance from ~5y high) from FMP's
 * daily close history.
 */
export async function getPriceStats(ticker: string): Promise<{ price: number; ytdChange: number; fromATH: number } | null> {
  try {
    const hist = await fmpGet('historical-price-eod/light', { symbol: ticker });
    if (!Array.isArray(hist) || hist.length === 0) return null;

    // newest-first
    const price = hist[0].price;
    if (!price) return null;

    const yearStart = `${new Date().getFullYear()}-01-01`;
    const thisYear = hist.filter((h: any) => h.date >= yearStart);
    const yearOpen = thisYear.length ? thisYear[thisYear.length - 1].price : price;
    const ytdChange = yearOpen ? ((price - yearOpen) / yearOpen) * 100 : 0;

    const high = Math.max(...hist.map((h: any) => h.price as number));
    const fromATH = high > 0 ? ((price - high) / high) * 100 : 0;

    return { price: round1(price), ytdChange: round1(ytdChange), fromATH: round1(fromATH) };
  } catch (error) {
    console.error(`FMP price error for ${ticker}:`, error);
    throw error;
  }
}

/**
 * Ticker search/autocomplete, restricted to US-listed USD equities
 */
export async function searchTickers(query: string, limit = 25): Promise<Array<{ ticker: string; name: string; sector?: string }>> {
  try {
    const data = await fmpGet('search-symbol', { query, limit });
    if (!Array.isArray(data)) return [];
    const usExchanges = new Set(['NASDAQ', 'NYSE', 'AMEX']);
    return data
      .filter((r: any) => usExchanges.has(r.exchange) && r.currency === 'USD')
      .map((r: any) => ({ ticker: r.symbol, name: r.name }));
  } catch (error) {
    console.warn(`FMP search error for ${query}:`, error);
    return [];
  }
}

export interface EarningsTranscript {
  date: string;       // call date, e.g. "2026-04-30"
  fiscalYear: number;
  quarter: number;
  content: string;    // full transcript text
}

/**
 * Latest available earnings-call transcript for a ticker. We first read the
 * lightweight dates list to find the most recent call, then fetch that one
 * transcript. Returns null when transcripts aren't available for the symbol.
 */
export async function getLatestTranscript(ticker: string): Promise<EarningsTranscript | null> {
  try {
    const dates = await fmpGet('earning-call-transcript-dates', { symbol: ticker });
    if (!Array.isArray(dates) || dates.length === 0) return null;
    // The list is newest-first, but sort defensively by (year, quarter)
    const latest = [...dates].sort((a, b) =>
      (b.fiscalYear - a.fiscalYear) || (b.quarter - a.quarter)
    )[0];
    if (!latest?.fiscalYear || !latest?.quarter) return null;

    const data = await fmpGet('earning-call-transcript', {
      symbol: ticker,
      year: latest.fiscalYear,
      quarter: latest.quarter
    });
    const t = Array.isArray(data) ? data[0] : null;
    if (!t?.content) return null;

    return {
      date: t.date || latest.date,
      fiscalYear: t.year || latest.fiscalYear,
      quarter: t.period ?? latest.quarter,
      content: t.content
    };
  } catch (error) {
    console.warn(`FMP transcript error for ${ticker}:`, error);
    return null;
  }
}

export interface ScreenerHit {
  ticker: string;
  name: string;
  sector?: string;
  marketCap?: number;
}

/**
 * Stock screener over the live market - the candidate source for portfolio
 * suggestions. FMP has no growth filter, so we screen by market cap / sector /
 * stock-only here and let Funda's own `growing` pillar judge growth downstream.
 * Multiple sectors fan out into parallel calls and are merged. Restricted to
 * US-listed common stocks (no ETFs/funds, no preferred/unit tickers).
 */
export async function screenStocks(params: {
  marketCapMoreThan?: number;
  marketCapLowerThan?: number;
  sectors?: string[];   // empty => no sector filter (whole market)
  priceMoreThan?: number;
  limitPerCall?: number;
}): Promise<ScreenerHit[]> {
  const sectors = params.sectors && params.sectors.length ? params.sectors : [undefined];
  const limit = params.limitPerCall ?? 100;
  const usExchanges = new Set(['NASDAQ', 'NYSE', 'AMEX']);

  const calls = sectors.map(async (sector): Promise<any[]> => {
    const q: Record<string, string | number> = {
      isEtf: 'false',
      isFund: 'false',
      isActivelyTrading: 'true',
      limit
    };
    if (params.marketCapMoreThan) q.marketCapMoreThan = Math.round(params.marketCapMoreThan);
    if (params.marketCapLowerThan) q.marketCapLowerThan = Math.round(params.marketCapLowerThan);
    if (params.priceMoreThan) q.priceMoreThan = params.priceMoreThan;
    if (sector) q.sector = sector;
    try {
      const data = await fmpGet('company-screener', q);
      return Array.isArray(data) ? data : [];
    } catch (error) {
      console.warn('FMP screener call failed:', error);
      return [];
    }
  });

  const merged = (await Promise.all(calls)).flat();
  const seen = new Set<string>();
  const out: ScreenerHit[] = [];
  for (const r of merged) {
    const sym = String(r.symbol || '').toUpperCase();
    if (!sym || seen.has(sym)) continue;
    if (r.exchangeShortName && !usExchanges.has(r.exchangeShortName)) continue;
    if (!/^[A-Z]{1,5}$/.test(sym)) continue; // skip preferreds/units/odd suffixes
    seen.add(sym);
    out.push({ ticker: sym, name: r.companyName || sym, sector: r.sector, marketCap: r.marketCap });
  }
  return out;
}

/**
 * Forward EPS = consensus estimate for the next (nearest future) fiscal year,
 * used to compute a forward P/E. Null when no estimate is available.
 */
export async function getForwardEps(ticker: string): Promise<number | null> {
  try {
    const data = await fmpGet('analyst-estimates', { symbol: ticker, period: 'annual', limit: 6 });
    if (!Array.isArray(data) || data.length === 0) return null;
    const today = new Date().toISOString().slice(0, 10);
    const future = data
      .filter((e: any) => e.date > today && typeof e.epsAvg === 'number' && e.epsAvg > 0)
      .sort((a: any, b: any) => a.date.localeCompare(b.date));
    return future.length ? future[0].epsAvg : null;
  } catch (error) {
    console.warn(`FMP estimates error for ${ticker}:`, error);
    return null;
  }
}

export interface AnalystTarget {
  company: string;       // e.g. "Cantor Fitzgerald"
  analyst?: string;      // e.g. "Matthew VanVliet"
  priceTarget: number;
  date: string;          // YYYY-MM-DD the target was published
  url?: string;
}

export interface AnalystTargets {
  consensus: number | null;
  high: number | null;
  low: number | null;
  median: number | null;
  analystCount: number;
  rating?: string; // Buy / Hold / Sell consensus (bonus, from grades)
  targets: AnalystTarget[]; // recent individual analyst targets, newest per firm
}

/**
 * Wall Street analyst price targets (consensus/high/low) plus the recent
 * analyst count and an overall buy/hold/sell consensus. Null when unavailable.
 */
export async function getAnalystTargets(ticker: string): Promise<AnalystTargets | null> {
  try {
    const [consensusRes, summaryRes, gradesRes, newsRes] = await Promise.all([
      fmpGet('price-target-consensus', { symbol: ticker }),
      fmpGet('price-target-summary', { symbol: ticker }),
      fmpGet('grades-consensus', { symbol: ticker }),
      fmpGet('price-target-news', { symbol: ticker, page: 0, limit: 40 })
    ]);

    const c = Array.isArray(consensusRes) ? consensusRes[0] : null;
    const s = Array.isArray(summaryRes) ? summaryRes[0] : null;
    const g = Array.isArray(gradesRes) ? gradesRes[0] : null;

    if (!c && !s) return null;

    // Individual analyst targets, newest first; keep the latest per firm so the
    // list shows each analyst's current target rather than duplicate revisions
    const news: any[] = Array.isArray(newsRes) ? newsRes : [];
    const seen = new Set<string>();
    const targets: AnalystTarget[] = news
      .filter(n => n.priceTarget > 0 && n.analystCompany)
      .sort((a, b) => (b.publishedDate || '').localeCompare(a.publishedDate || ''))
      .filter(n => (seen.has(n.analystCompany) ? false : (seen.add(n.analystCompany), true)))
      .slice(0, 12)
      .map(n => ({
        company: n.analystCompany,
        analyst: n.analystName || undefined,
        priceTarget: n.adjPriceTarget || n.priceTarget,
        date: (n.publishedDate || '').slice(0, 10),
        url: n.newsURL || undefined
      }));

    // prefer the most recent window with coverage for the headline analyst count
    const analystCount = s?.lastQuarterCount || s?.lastMonthCount || s?.lastYearCount || 0;

    return {
      consensus: c?.targetConsensus ?? s?.lastQuarterAvgPriceTarget ?? null,
      high: c?.targetHigh ?? null,
      low: c?.targetLow ?? null,
      median: c?.targetMedian ?? null,
      analystCount,
      rating: g?.consensus,
      targets
    };
  } catch (error) {
    console.warn(`FMP analyst targets error for ${ticker}:`, error);
    return null;
  }
}

export default { getCompanyInfo, getQuarterlyFinancials, getPriceStats, searchTickers, screenStocks, getLatestTranscript, getForwardEps, getAnalystTargets };
