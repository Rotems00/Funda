import { getStock, getMetrics, saveStock, saveMetrics } from './cacheService';
import { getCompanyInfo, getPriceStats, getForwardEps, getAnalystTargets } from './fmpService';
import { getQuarters } from './financialsCache';
import { buildFundamentals, buildRatios } from './normalizerService';
import { computeRating, generateSummary } from '../engine/ratingEngine';
import { IStock } from '../models/stockSchema';

/**
 * Shared stock-detail pipeline. Encapsulates the "fetch once, cache forever"
 * logic that turns a ticker into a full Funda rating (price + 5 pillars + ratios
 * + trends + analyst targets). Used by the GET /api/stocks/:ticker route and by
 * the portfolio recommender, which grounds the LLM's suggestions in real ratings.
 */

const METRICS_TTL_MS = 24 * 60 * 60 * 1000; // recompute fundamentals/rating once a day
const PRICE_TTL_MS = 24 * 60 * 60 * 1000; // prices refresh once/day (daily close), not per request

export interface StockDetail {
  ticker: string;
  companyName: string;
  exchange: string;
  sector: string;
  industry: string;
  marketCap?: number;
  isEtf?: boolean;
  price: number;
  ytdChange: number;
  fromATH: number;
  rating: number;
  summary: string;
  pillars: any;
  ratios: any;
  trends: any;
  details: any;
  analysts: any;
}

// Distinguishes the not-found reasons so the route can keep its original
// per-reason 404 messages
export type StockDetailError = 'not_found' | 'no_financials' | 'no_price';
export type StockDetailResult = { detail: StockDetail } | { error: StockDetailError };

async function fetchLivePriceStats(ticker: string) {
  const stats = await getPriceStats(ticker);
  return stats || { price: 0, ytdChange: 0, fromATH: 0 };
}

/**
 * Get price stats for a ticker, preferring the cached daily snapshot on the
 * Stock record so repeat lookups (by any user, same day) don't re-hit the feed
 */
async function getCachedPriceStats(ticker: string, cachedStock: IStock | null) {
  const isFresh = !!cachedStock?.priceUpdatedAt && cachedStock.price != null &&
    (Date.now() - new Date(cachedStock.priceUpdatedAt).getTime()) < PRICE_TTL_MS;

  if (isFresh) {
    return { price: cachedStock!.price as number, ytdChange: cachedStock!.ytdChange || 0, fromATH: cachedStock!.fromATH || 0 };
  }

  const priceStats = await fetchLivePriceStats(ticker);
  if (!priceStats.price) {
    return null;
  }

  await saveStock({
    ticker,
    price: priceStats.price,
    ytdChange: priceStats.ytdChange,
    fromATH: priceStats.fromATH,
    priceUpdatedAt: new Date()
  });

  return priceStats;
}

/**
 * Resolve a ticker to its full Funda detail, using the daily cache when fresh
 * and recomputing from FMP financials otherwise. Returns a discriminated result
 * so callers can tell "not a real ticker" from "no financials"/"no price".
 */
export async function getStockDetail(rawTicker: string): Promise<StockDetailResult> {
  const ticker = rawTicker.toUpperCase();

  const cachedStock = await getStock(ticker);
  const cachedMetrics = cachedStock ? await getMetrics(ticker) : null;
  const isFresh = !!cachedMetrics && (Date.now() - new Date(cachedMetrics.computedAt).getTime()) < METRICS_TTL_MS;

  if (cachedStock && cachedMetrics && isFresh) {
    const priceStats = await getCachedPriceStats(ticker, cachedStock);
    if (!priceStats) return { error: 'no_price' };

    return {
      detail: {
        ticker,
        companyName: cachedStock.companyName || ticker,
        exchange: cachedStock.exchange || 'N/A',
        sector: cachedStock.sector || 'N/A',
        industry: cachedStock.industry || 'N/A',
        marketCap: cachedStock.marketCap,
        isEtf: cachedStock.isEtf,
        price: priceStats.price,
        ytdChange: priceStats.ytdChange,
        fromATH: priceStats.fromATH,
        rating: cachedMetrics.rating ?? 0,
        summary: generateSummary(cachedMetrics.rating || 0),
        pillars: cachedMetrics.pillars,
        ratios: cachedMetrics.ratios,
        trends: cachedMetrics.trends,
        details: cachedMetrics.details,
        analysts: cachedMetrics.analysts
      }
    };
  }

  const companyInfo = await getCompanyInfo(ticker);
  if (!companyInfo) return { error: 'not_found' };

  const quarters = await getQuarters(ticker, companyInfo.cik);
  if (quarters.length === 0) return { error: 'no_financials' };

  const priceStats = await getCachedPriceStats(ticker, cachedStock);
  if (!priceStats) return { error: 'no_price' };

  const fundamentals = buildFundamentals(quarters, priceStats.price, companyInfo.sharesOutstanding);
  const rating = computeRating(fundamentals);

  // Forward P/E from analyst consensus (next-FY EPS). Note: estimates are
  // typically non-GAAP, so forward P/E and trailing (GAAP) P/E aren't strictly
  // comparable - standard across finance sites, shown side by side.
  const [forwardEps, analystTargets] = await Promise.all([
    getForwardEps(ticker),
    getAnalystTargets(ticker)
  ]);
  const forwardPE = forwardEps && priceStats.price ? Math.round((priceStats.price / forwardEps) * 10) / 10 : null;

  const ratios = { ...buildRatios(fundamentals), forwardPE };

  // Analyst price targets + implied upside vs the current price
  const analysts = analystTargets && analystTargets.consensus
    ? {
        ...analystTargets,
        upside: priceStats.price ? Math.round(((analystTargets.consensus - priceStats.price) / priceStats.price) * 1000) / 10 : null
      }
    : null;

  await saveStock({
    ticker,
    cik: companyInfo.cik,
    companyName: companyInfo.name,
    exchange: companyInfo.exchange,
    sector: companyInfo.sector,
    industry: companyInfo.industry,
    marketCap: companyInfo.market_cap,
    isEtf: companyInfo.isEtf
  });

  const trends = {
    revenueYoY: fundamentals.revenueYoY,
    epsYoY: fundamentals.epsYoY,
    revenueCagr5Y: fundamentals.revenueCagr5Y,
    trajectory: fundamentals.trajectory
  };

  const details = {
    roe: fundamentals.roe,
    ocfToNetIncome: fundamentals.ocfToNetIncome,
    currentRatio: fundamentals.currentRatio,
    interestCoverage: fundamentals.interestCoverage,
    intangibleAssetRatio: fundamentals.intangibleAssetRatio,
    roicYoY: fundamentals.roicYoY,
    operatingMarginYoY: fundamentals.operatingMarginYoY,
    shareCountYoY: fundamentals.shareCountYoY,
    buybackYield: fundamentals.buybackYield
  };

  await saveMetrics({
    stockId: ticker,
    rating: rating.overall,
    pillars: rating.pillars,
    ratios,
    trends,
    details,
    analysts
  });

  return {
    detail: {
      ticker,
      companyName: companyInfo.name,
      exchange: companyInfo.exchange || 'N/A',
      sector: companyInfo.sector || 'N/A',
      industry: companyInfo.industry || 'N/A',
      marketCap: companyInfo.market_cap,
      isEtf: companyInfo.isEtf,
      price: priceStats.price,
      ytdChange: priceStats.ytdChange,
      fromATH: priceStats.fromATH,
      rating: rating.overall,
      summary: rating.summary,
      pillars: rating.pillars,
      ratios,
      trends,
      details,
      analysts
    }
  };
}

export default { getStockDetail };
