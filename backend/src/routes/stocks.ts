import { Router, Request, Response } from 'express';
import { searchStocks, getStock, getMetrics, saveStock, saveMetrics } from '../services/cacheService';
import { searchTickers, getCompanyInfo, getPriceStats, getForwardEps, getAnalystTargets } from '../services/fmpService';
import { getCikForTicker, getQuarters } from '../services/financialsCache';
import { buildFundamentals, buildRatios, buildAnnualSeries, buildQuarterlySeries } from '../services/normalizerService';
import { computeRating, generateSummary } from '../engine/ratingEngine';

const router = Router();

const METRICS_TTL_MS = 24 * 60 * 60 * 1000; // recompute fundamentals/rating once a day
const PRICE_TTL_MS = 24 * 60 * 60 * 1000; // prices refresh once/day (daily close), not per request

/**
 * Fetch live price stats from FMP (current price, YTD change, distance from high)
 */
async function fetchLivePriceStats(ticker: string) {
  const stats = await getPriceStats(ticker);
  return stats || { price: 0, ytdChange: 0, fromATH: 0 };
}

/**
 * Get price stats for a ticker, preferring the cached daily snapshot on the
 * Stock record so repeat lookups (by any user, same day) don't re-hit Polygon
 */
async function getCachedPriceStats(ticker: string, cachedStock: Awaited<ReturnType<typeof getStock>>) {
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
 * Rank ticker search results so exact/prefix ticker matches outrank
 * incidental name matches (e.g. leveraged ETFs tracking the ticker)
 */
function rankTickerMatches<T extends { ticker: string }>(results: T[], query: string): T[] {
  const score = (ticker: string) => {
    if (ticker === query) return 0;
    if (ticker.startsWith(query)) return 1;
    if (ticker.includes(query)) return 2;
    return 3;
  };

  return [...results].sort((a, b) => score(a.ticker) - score(b.ticker));
}

/**
 * GET /api/stocks/search?q=TICKER
 * Search for stocks by ticker or company name
 * Returns: recent searches, trending in user's wheelhouse, and autocomplete suggestions
 */
router.get('/search', async (req: Request, res: Response) => {
  try {
    const query = req.query.q as string;
    
    if (!query || query.length < 1) {
      return res.json({
        recent: ['MELI', 'NVDA', 'PLTR'],
        trending: [
          { ticker: 'MELI', name: 'MercadoLibre', sector: 'Technology', rating: 4.3 },
          { ticker: 'NVDA', name: 'NVIDIA', sector: 'Semiconductors', rating: 4.1 },
          { ticker: 'PLTR', name: 'Palantir', sector: 'Software', rating: 3.8 },
        ],
        suggestions: []
      });
    }

    // Normalize query to uppercase
    const normalizedQuery = query.toUpperCase();

    // First try MongoDB cache
    let cachedResults = await searchStocks(normalizedQuery, 10);
    
    if (cachedResults.length > 0) {
      const suggestions = cachedResults.map(stock => ({
        ticker: stock.ticker,
        name: stock.companyName || stock.ticker,
        sector: stock.sector || 'N/A'
      }));
      return res.json({ suggestions });
    }

    // If no cached results, query the data provider's search
    try {
      const searchResults = await searchTickers(normalizedQuery, 25);

      if (searchResults && searchResults.length > 0) {
        const suggestions = rankTickerMatches(searchResults, normalizedQuery)
          .slice(0, 10)
          .map((ticker: any) => ({
            ticker: ticker.ticker,
            name: ticker.name || ticker.ticker,
            sector: ticker.sector || 'N/A'
          }));
        return res.json({ suggestions });
      }
    } catch (searchError) {
      console.warn('Ticker search failed:', searchError);
    }

    // Fallback: return the query as a suggestion
    return res.json({
      suggestions: [
        { ticker: normalizedQuery, name: `${normalizedQuery} (not found)`, sector: 'Unknown' }
      ]
    });
  } catch (error) {
    console.error('Search error:', error);
    res.status(500).json({ error: 'Search failed' });
  }
});

/**
 * GET /api/stocks/:ticker
 * Get full stock data including rating and all 5 pillars
 */
router.get('/:ticker', async (req: Request, res: Response) => {
  try {
    const ticker = req.params.ticker.toUpperCase();

    const cachedStock = await getStock(ticker);
    const cachedMetrics = cachedStock ? await getMetrics(ticker) : null;
    const isFresh = !!cachedMetrics && (Date.now() - new Date(cachedMetrics.computedAt).getTime()) < METRICS_TTL_MS;

    if (cachedStock && cachedMetrics && isFresh) {
      const priceStats = await getCachedPriceStats(ticker, cachedStock);
      if (!priceStats) {
        return res.status(404).json({ error: 'Price data not available for this ticker' });
      }

      return res.json({
        ticker,
        companyName: cachedStock.companyName || ticker,
        exchange: cachedStock.exchange || 'N/A',
        sector: cachedStock.sector || 'N/A',
        industry: cachedStock.industry || 'N/A',
        price: priceStats.price,
        ytdChange: priceStats.ytdChange,
        fromATH: priceStats.fromATH,
        rating: cachedMetrics.rating,
        summary: generateSummary(cachedMetrics.rating || 0),
        pillars: cachedMetrics.pillars,
        ratios: cachedMetrics.ratios,
        trends: cachedMetrics.trends,
        details: cachedMetrics.details,
        analysts: cachedMetrics.analysts
      });
    }

    const companyInfo = await getCompanyInfo(ticker);
    if (!companyInfo) {
      return res.status(404).json({ error: 'Stock not found' });
    }

    const quarters = await getQuarters(ticker, companyInfo.cik);
    if (quarters.length === 0) {
      return res.status(404).json({ error: 'Financial data not available for this ticker' });
    }

    const priceStats = await getCachedPriceStats(ticker, cachedStock);
    if (!priceStats) {
      return res.status(404).json({ error: 'Price data not available for this ticker' });
    }

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
      industry: companyInfo.industry
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

    return res.json({
      ticker,
      companyName: companyInfo.name,
      exchange: companyInfo.exchange || 'N/A',
      sector: companyInfo.sector || 'N/A',
      industry: companyInfo.industry || 'N/A',
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
    });
  } catch (error) {
    console.error('Stock detail error:', error);
    res.status(500).json({ error: 'Failed to fetch stock' });
  }
});

/**
 * GET /api/stocks/:ticker/metrics
 * Get detailed metrics breakdown for a stock
 */
router.get('/:ticker/metrics', async (req: Request, res: Response) => {
  try {
    const ticker = req.params.ticker.toUpperCase();

    // TODO: Query MongoDB metrics collection
    return res.json({
      ticker,
      metrics: {
        // Placeholder
      }
    });
  } catch (error) {
    console.error('Metrics error:', error);
    res.status(500).json({ error: 'Failed to fetch metrics' });
  }
});

const RANGE_TO_QUARTERS: Record<string, number> = {
  '2y': 8,
  '5y': 20,
  max: 40
};

const RANGE_TO_YEARS: Record<string, number> = {
  '2y': 2,
  '5y': 5,
  max: 10
};

/**
 * GET /api/stocks/:ticker/momentum?period=quarterly|annual&range=2y|5y|max
 * Get trend data for charts (QoQ, YoY, trajectory)
 */
router.get('/:ticker/momentum', async (req: Request, res: Response) => {
  try {
    const ticker = req.params.ticker.toUpperCase();
    const period = (req.query.period as string) || 'annual'; // quarterly or annual
    const range = (req.query.range as string) || '5y'; // 2y, 5y, or max

    // CIK is optional now: FMP fetches financials by ticker, and CIK is only used
    // for the fail-soft EDGAR cross-check. Some FMP profiles (e.g. NU) omit the
    // CIK even though full financials exist, so don't hard-fail when it's missing.
    const cik = await getCikForTicker(ticker);

    const limit = RANGE_TO_QUARTERS[range] || RANGE_TO_QUARTERS['5y'];
    // getQuarters always caches the deepest available history, so a single
    // fetch serves every range/period view without another API call
    const quarters = await getQuarters(ticker, cik);

    if (quarters.length === 0) {
      return res.status(404).json({ error: 'Financial data not available for this ticker' });
    }

    const data = period === 'quarterly'
      ? buildQuarterlySeries(quarters).slice(-limit)
      : buildAnnualSeries(quarters, RANGE_TO_YEARS[range] || RANGE_TO_YEARS['5y']);

    return res.json({ ticker, period, range, data });
  } catch (error) {
    console.error('Momentum error:', error);
    res.status(500).json({ error: 'Failed to fetch momentum data' });
  }
});

/**
 * GET /api/stocks
 * Get all stocks (for explore page)
 * Optional filters: sector, minRating
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const sector = req.query.sector as string;
    const minRating = parseFloat(req.query.minRating as string) || 0;

    // TODO: Query MongoDB with filters
    return res.json({
      stocks: [],
      total: 0
    });
  } catch (error) {
    console.error('Get all stocks error:', error);
    res.status(500).json({ error: 'Failed to fetch stocks' });
  }
});

export default router;
