import { getFundamentals, saveFundamentals, getStock, saveStock } from './cacheService';
import { getCompanyInfo, getQuarterlyFinancials } from './fmpService';
import { getEdgarQuarters, getEdgarRevenue, EdgarQuarter, EdgarRevenuePoint } from './edgarService';
import { filterByCik, QuarterlyFinancial } from './normalizerService';
import { IFundamentalsQuarter } from '../models/stockSchema';

/**
 * Fetch-once, cache-forever layer for quarterly financials.
 * The first lookup of a ticker pulls from FMP; the result is persisted
 * as one document per stock (the whole quarter history together, since
 * every fetch/refresh reads and writes that history as a batch) so every
 * subsequent lookup - by any user - is served from the cache instead of
 * spending another paid API call.
 */

// Fundamentals only change ~4x/year on new earnings, so a week-old cache is
// still safe; re-checking FMP weekly catches new quarters without
// spending an API call on every request
const CACHE_FRESH_MS = 7 * 24 * 60 * 60 * 1000;

function toQuarterlyFinancial(q: IFundamentalsQuarter, cik: string | undefined): QuarterlyFinancial {
  return {
    cik,
    fiscalPeriod: q.fiscalPeriod,
    fiscalYear: q.fiscalYear,
    endDate: q.endDate,
    revenue: q.revenue,
    grossProfit: q.grossProfit,
    netIncome: q.netIncome,
    eps: q.eps,
    operatingIncome: q.operatingIncome,
    nonOperatingIncome: q.nonOperatingIncome,
    operatingCashFlow: q.operatingCashFlow,
    dilutedShares: q.dilutedShares,
    currentAssets: q.currentAssets,
    currentLiabilities: q.currentLiabilities,
    inventory: q.inventory,
    accountsPayable: q.accountsPayable,
    totalLiabilities: q.totalLiabilities,
    longTermDebt: q.longTermDebt,
    intangibleAssets: q.intangibleAssets,
    totalEquity: q.equity,
    totalAssets: q.totalAssets,
    cash: q.cash,
    capitalExpenditure: q.capitalExpenditure,
    buybacks: q.buybacks,
    dividendsPaid: q.dividendsPaid
  };
}

function toFundamentalsQuarter(q: QuarterlyFinancial): IFundamentalsQuarter {
  return {
    fiscalPeriod: q.fiscalPeriod,
    fiscalYear: q.fiscalYear,
    endDate: q.endDate,
    revenue: q.revenue,
    grossProfit: q.grossProfit,
    netIncome: q.netIncome,
    eps: q.eps,
    operatingIncome: q.operatingIncome,
    nonOperatingIncome: q.nonOperatingIncome,
    operatingCashFlow: q.operatingCashFlow,
    dilutedShares: q.dilutedShares,
    currentAssets: q.currentAssets,
    currentLiabilities: q.currentLiabilities,
    inventory: q.inventory,
    accountsPayable: q.accountsPayable,
    totalAssets: q.totalAssets,
    totalLiabilities: q.totalLiabilities,
    longTermDebt: q.longTermDebt,
    intangibleAssets: q.intangibleAssets,
    equity: q.totalEquity,
    cash: q.cash,
    capitalExpenditure: q.capitalExpenditure,
    buybacks: q.buybacks,
    dividendsPaid: q.dividendsPaid
  };
}

const EDGAR_DATE_MATCH_TOLERANCE_DAYS = 5;

function daysBetween(a: string, b: string): number {
  return Math.abs(new Date(a).getTime() - new Date(b).getTime()) / (1000 * 60 * 60 * 24);
}

function findClosestEdgarQuarter(endDate: string | undefined, edgarQuarters: EdgarQuarter[]): EdgarQuarter | undefined {
  if (!endDate) return undefined;
  let best: EdgarQuarter | undefined;
  let bestDiff = Infinity;
  for (const eq of edgarQuarters) {
    const diff = daysBetween(endDate, eq.endDate);
    if (diff < bestDiff) {
      bestDiff = diff;
      best = eq;
    }
  }
  return bestDiff <= EDGAR_DATE_MATCH_TOLERANCE_DAYS ? best : undefined;
}

function findClosestRevenue(endDate: string | undefined, revenue: EdgarRevenuePoint[]): EdgarRevenuePoint | undefined {
  if (!endDate) return undefined;
  let best: EdgarRevenuePoint | undefined;
  let bestDiff = Infinity;
  for (const r of revenue) {
    const diff = daysBetween(endDate, r.endDate);
    if (diff < bestDiff) {
      bestDiff = diff;
      best = r;
    }
  }
  return bestDiff <= EDGAR_DATE_MATCH_TOLERANCE_DAYS ? best : undefined;
}

/**
 * Fill gaps in Polygon's data from SEC EDGAR. Two kinds of gap:
 *  1. Fields Polygon doesn't expose at all (cash/CapEx/buybacks/dividends).
 *  2. Revenue Polygon's free tier leaves null or omits entirely on recent
 *     quarters - including fiscal Q4, which no company files a standalone 10-Q
 *     for, so EDGAR synthesizes it from the annual 10-K.
 * Matches by fiscal period end-date with a few days' tolerance, since the two
 * sources occasionally report slightly different period-end dates for the same
 * fiscal quarter (non-calendar fiscal year conventions). Polygon's own revenue
 * is always preferred; EDGAR only fills where Polygon has none.
 * Fails soft - if EDGAR has nothing for this CIK, Polygon-only data still works.
 */
interface EdgarMergeResult {
  quarters: QuarterlyFinancial[];
  // true when EDGAR was successfully consulted (even if it had nothing for this
  // company); false only when the fetch itself failed, so the caller can avoid
  // persisting cash-less data as authoritative and retry on the next read
  edgarComplete: boolean;
}

async function mergeEdgarData(quarters: QuarterlyFinancial[], cik: string | undefined): Promise<EdgarMergeResult> {
  // No CIK means EDGAR can never be consulted for this ticker - nothing to
  // retry, so treat it as a settled (complete) outcome
  if (!cik) return { quarters, edgarComplete: true };

  try {
    const [edgarQuarters, edgarRevenue] = await Promise.all([
      getEdgarQuarters(cik),
      getEdgarRevenue(cik)
    ]);
    if (edgarQuarters.length === 0 && edgarRevenue.length === 0) {
      return { quarters, edgarComplete: true };
    }

    // 1. Enrich existing quarters: cash/CapEx/etc, and fill revenue only where
    // Polygon left it null/undefined (never override Polygon's own number).
    const merged: QuarterlyFinancial[] = quarters.map(q => {
      const cashMatch = findClosestEdgarQuarter(q.endDate, edgarQuarters);
      const revMatch = q.revenue == null ? findClosestRevenue(q.endDate, edgarRevenue) : undefined;
      // EDGAR is a fill-only cross-check now that FMP supplies these directly:
      // adopt an EDGAR value only where FMP left the field blank, never overwrite
      return {
        ...q,
        cash: q.cash ?? cashMatch?.cash,
        capitalExpenditure: q.capitalExpenditure ?? cashMatch?.capitalExpenditure,
        buybacks: q.buybacks ?? cashMatch?.buybacks,
        dividendsPaid: q.dividendsPaid ?? cashMatch?.dividendsPaid,
        revenue: q.revenue ?? revMatch?.revenue
      };
    });

    // 2. Insert quarters Polygon dropped entirely (e.g. a recent quarter not yet
    // ingested), but only within the window Polygon already covers, so we never
    // fabricate history beyond its range. Revenue-only rows - other metrics stay
    // blank and the series builders carry forward / treat them as gaps.
    const ends = merged.map(q => q.endDate).filter((e): e is string => !!e);
    if (ends.length > 0) {
      const minEnd = ends.reduce((a, b) => (a < b ? a : b));
      const maxEnd = ends.reduce((a, b) => (a > b ? a : b));
      const inserts: QuarterlyFinancial[] = edgarRevenue
        .filter(r => r.endDate >= minEnd && r.endDate <= maxEnd)
        .filter(r => !merged.some(q => daysBetween(q.endDate || '', r.endDate) <= EDGAR_DATE_MATCH_TOLERANCE_DAYS && q.endDate))
        .map(r => ({
          cik,
          fiscalYear: r.fiscalYear,
          fiscalPeriod: r.fiscalPeriod,
          endDate: r.endDate,
          revenue: r.revenue
        }));

      if (inserts.length > 0) {
        // keep Polygon's newest-first ordering that downstream builders assume
        merged.push(...inserts);
        merged.sort((a, b) => (b.endDate || '').localeCompare(a.endDate || ''));
      }
    }

    return { quarters: merged, edgarComplete: true };
  } catch (error) {
    // Transient SEC failure (rate limit/timeout/5xx survived retries) - keep the
    // Polygon data but flag it so the next read re-attempts EDGAR rather than
    // showing "no cash data" for the whole cache window
    console.warn(`EDGAR merge failed for CIK ${cik}:`, error);
    return { quarters, edgarComplete: false };
  }
}

/**
 * Get the CIK for a ticker, using the cached Stock record if we already have
 * it so this never costs an extra Polygon call on a warm cache
 */
export async function getCikForTicker(ticker: string): Promise<string | undefined> {
  const cachedStock = await getStock(ticker);
  if (cachedStock?.cik) {
    return cachedStock.cik;
  }

  const companyInfo = await getCompanyInfo(ticker);
  if (!companyInfo) {
    return undefined;
  }

  await saveStock({ ticker, cik: companyInfo.cik, companyName: companyInfo.name, sector: companyInfo.sector, industry: companyInfo.industry });
  return companyInfo.cik;
}

// The deepest range a view can request is "max" (40 quarters) plus headroom for
// trailing YoY/CAGR/contiguous-year math. We always fetch this much on a cold
// load so a single cache entry serves every range/period toggle without another
// (paid) API call.
const MAX_FETCH_QUARTERS = 48;

/**
 * Get quarterly financials for a ticker, preferring the MongoDB cache.
 * Falls back to FMP (filtered to the correct CIK) on a cold or stale
 * cache, then persists the result so the next lookup - by any user - is free.
 *
 * Freshness is purely time-based: a company younger than the requested range
 * (e.g. a recent IPO with fewer quarters than a 5y view asks for) can never
 * accumulate `minQuarters`, so gating on quarter count would refetch on every
 * request and waste API calls. We instead cache the deepest available history
 * once and trust it until it ages out.
 */
export async function getQuarters(ticker: string, cik: string | undefined): Promise<QuarterlyFinancial[]> {
  const cached = await getFundamentals(ticker);

  const isFresh = !!cached && cached.quarters.length > 0 &&
    (Date.now() - new Date(cached.updatedAt).getTime()) < CACHE_FRESH_MS;

  if (isFresh) {
    const cachedQuarters = cached.quarters.map(q => toQuarterlyFinancial(q, cached.cik));

    // Self-heal: if a prior fetch couldn't reach EDGAR, retry the enrichment now
    // (reusing the cached FMP data, so no extra paid call) and persist it if
    // it succeeds - otherwise serve what we have without blocking.
    if (cik && cached.edgarComplete !== true) {
      const { quarters: remerged, edgarComplete } = await mergeEdgarData(cachedQuarters, cik);
      if (edgarComplete) {
        await saveFundamentals(ticker, cik, remerged.map(toFundamentalsQuarter), true);
        return remerged;
      }
    }

    return cachedQuarters;
  }

  const freshQuarters = filterByCik(await getQuarterlyFinancials(ticker, MAX_FETCH_QUARTERS), cik);
  const { quarters: merged, edgarComplete } = await mergeEdgarData(freshQuarters, cik);

  await saveFundamentals(ticker, cik, merged.map(toFundamentalsQuarter), edgarComplete);

  return merged;
}

export default {
  getCikForTicker,
  getQuarters
};
