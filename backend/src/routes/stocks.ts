import { Router, Request, Response } from 'express';
import { searchStocks, getBusinessReview, saveBusinessReview } from '../services/cacheService';
import { searchTickers, getCompanyInfo, getPriceStats, getLatestTranscript } from '../services/fmpService';
import { getCikForTicker, getQuarters } from '../services/financialsCache';
import { buildAnnualSeries, buildQuarterlySeries } from '../services/normalizerService';
import { getStockDetail } from '../services/stockService';
import { streamBusinessReview, OllamaUnavailableError, BusinessReviewContext } from '../services/ollamaService';

const router = Router();

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
    const result = await getStockDetail(req.params.ticker);

    if ('error' in result) {
      const messages: Record<string, string> = {
        not_found: 'Stock not found',
        no_financials: 'Financial data not available for this ticker',
        no_price: 'Price data not available for this ticker'
      };
      return res.status(404).json({ error: messages[result.error] });
    }

    return res.json(result.detail);
  } catch (error) {
    console.error('Stock detail error:', error);
    res.status(500).json({ error: 'Failed to fetch stock' });
  }
});

/**
 * GET /api/stocks/:ticker/quote
 * Lightweight price + identity for ANY listed security, including ETFs/funds
 * that have no fundamentals (so they can't get a Funda rating). Used by the
 * portfolio to support holdings like ETFs alongside rated stocks.
 */
router.get('/:ticker/quote', async (req: Request, res: Response) => {
  try {
    const ticker = req.params.ticker.toUpperCase();
    const info = await getCompanyInfo(ticker);
    if (!info) return res.status(404).json({ error: 'Ticker not found' });

    const priceStats = await getPriceStats(ticker);
    return res.json({
      ticker,
      companyName: info.name || ticker,
      sector: info.sector || (info.isEtf ? 'ETF' : 'N/A'),
      isEtf: !!info.isEtf,
      marketCap: info.market_cap,
      price: priceStats?.price ?? 0
    });
  } catch (error) {
    console.error('Quote error:', error);
    res.status(500).json({ error: 'Failed to fetch quote' });
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

// Cap how much of the (often very long) transcript we feed the local model —
// the prepared-remarks at the start carry the business narrative we need.
const TRANSCRIPT_CHARS = 9000;

// Bump when the review prompt/sections change, so previously cached reviews are
// treated as stale and regenerated instead of served with the old format.
const REVIEW_PROMPT_VERSION = 'v2';

/**
 * GET /api/stocks/:ticker/business-review
 *   - no query:        return the CACHED review (streamed as text), or 204 if none yet
 *   - ?generate=1:     generate a fresh review (unless an up-to-date one is cached),
 *                      stream it token-by-token, and cache it for the next user
 * The review is written by a local LLM as a 20-year investor, grounded in the
 * company description, latest quarter numbers, Funda ratings and the latest
 * earnings-call transcript. Cached in MongoDB, keyed by the transcript date.
 */
router.get('/:ticker/business-review', async (req: Request, res: Response) => {
  const ticker = req.params.ticker.toUpperCase();
  const wantGenerate = req.query.generate === '1' || req.query.generate === 'true';

  const cached = await getBusinessReview(ticker);

  // A cached review only counts if it was written by the current prompt version
  const cachedIsCurrent = !!cached && cached.promptVersion === REVIEW_PROMPT_VERSION;

  // Fast path: serving an existing review needs no external calls
  if (!wantGenerate) {
    if (!cachedIsCurrent) return res.status(204).end();
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('X-Review-Cached', 'true');
    if (cached!.generatedAt) res.setHeader('X-Review-Generated-At', new Date(cached!.generatedAt).toISOString());
    return res.end(cached!.review);
  }

  // Generate path: gather grounding data
  let detailResult;
  try {
    detailResult = await getStockDetail(ticker);
  } catch (error) {
    console.error('Business review detail error:', error);
    return res.status(500).json({ error: 'Failed to load company data.' });
  }
  if ('error' in detailResult) {
    return res.status(404).json({ error: 'Stock not found.' });
  }
  const detail = detailResult.detail;

  const [companyInfo, transcript] = await Promise.all([
    getCompanyInfo(ticker).catch(() => null),
    getLatestTranscript(ticker).catch(() => null)
  ]);

  // If an up-to-date review (current prompt + same transcript) is already
  // cached, reuse it instead of regenerating
  if (cachedIsCurrent && transcript && cached!.transcriptDate === transcript.date) {
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('X-Review-Cached', 'true');
    return res.end(cached!.review);
  }

  // Latest quarter's raw figures (most-recent-first)
  const cik = await getCikForTicker(ticker).catch(() => undefined);
  const quarters = await getQuarters(ticker, cik || companyInfo?.cik).catch(() => []);
  const q0 = quarters[0];

  const context: BusinessReviewContext = {
    ticker,
    name: detail.companyName,
    sector: detail.sector,
    industry: detail.industry,
    description: companyInfo?.description,
    rating: detail.rating,
    pillars: detail.pillars,
    ratios: detail.ratios,
    latestQuarter: q0 ? {
      period: q0.fiscalPeriod && q0.fiscalYear ? `${q0.fiscalPeriod} ${q0.fiscalYear}` : undefined,
      revenue: q0.revenue,
      netIncome: q0.netIncome,
      eps: q0.eps,
      operatingCashFlow: q0.operatingCashFlow,
      cash: q0.cash,
      debt: q0.longTermDebt,
      revenueYoY: detail.trends?.revenueYoY,
      epsYoY: detail.trends?.epsYoY
    } : undefined,
    transcriptExcerpt: transcript?.content ? transcript.content.slice(0, TRANSCRIPT_CHARS) : undefined,
    transcriptLabel: transcript ? `Q${transcript.quarter} ${transcript.fiscalYear}` : undefined
  };

  let stream: NodeJS.ReadableStream;
  try {
    stream = await streamBusinessReview(context);
  } catch (error) {
    if (error instanceof OllamaUnavailableError) {
      return res.status(503).json({ error: error.message });
    }
    console.error('Business review generation error:', error);
    return res.status(500).json({ error: 'Failed to generate review.' });
  }

  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('X-Review-Cached', 'false');

  // Forward Ollama's NDJSON token stream as plain text, accumulating the full
  // text so we can cache it once generation completes.
  let buffer = '';
  let full = '';
  stream.on('data', (chunk: Buffer) => {
    buffer += chunk.toString();
    let nl: number;
    while ((nl = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, nl).trim();
      buffer = buffer.slice(nl + 1);
      if (!line) continue;
      try {
        const obj = JSON.parse(line);
        if (obj.message?.content) {
          full += obj.message.content;
          res.write(obj.message.content);
        }
      } catch {
        /* ignore partial/non-JSON lines */
      }
    }
  });
  stream.on('end', async () => {
    if (full.trim().length > 0) {
      await saveBusinessReview({
        stockId: ticker,
        review: full,
        transcriptDate: transcript?.date,
        promptVersion: REVIEW_PROMPT_VERSION,
        model: process.env.OLLAMA_MODEL || 'llama3.1'
      });
    }
    res.end();
  });
  stream.on('error', () => res.end());
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
