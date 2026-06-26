import { Router, Request, Response } from 'express';
import {
  streamReview,
  suggestTickers,
  OllamaUnavailableError,
  ReviewPayload,
  SuggestHolding,
  SuggestPreferences
} from '../services/ollamaService';
import { getStockDetail } from '../services/stockService';
import { screenStocks } from '../services/fmpService';

const router = Router();

// How many candidates we'll rate through the full Funda engine per run ("Deep").
// The market screener returns far more; we sample down to this to bound work.
const MAX_RESOLVE = 36;
const RESOLVE_CONCURRENCY = 8;

// Run an async fn over items with bounded concurrency (so we don't fire dozens
// of live data fetches at once).
async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const idx = cursor++;
      out[idx] = await fn(items[idx]);
    }
  });
  await Promise.all(workers);
  return out;
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Our UI's short sector labels -> FMP's exact sector names (one label can span
// two FMP sectors, e.g. Consumer). Unknown labels pass through unchanged.
const SECTOR_TO_FMP: Record<string, string[]> = {
  Technology: ['Technology'],
  Healthcare: ['Healthcare'],
  Financials: ['Financial Services'],
  Consumer: ['Consumer Cyclical', 'Consumer Defensive'],
  Industrials: ['Industrials'],
  Energy: ['Energy'],
  Communication: ['Communication Services'],
  Utilities: ['Utilities']
};

function toFmpSectors(sectors: string[] | undefined): string[] {
  if (!sectors || sectors.length === 0) return [];
  return [...new Set(sectors.flatMap(s => SECTOR_TO_FMP[s] || [s]))];
}

// Translate the user's market-cap preference into a screener cap window.
function capWindow(prefs: SuggestPreferences): { more?: number; lower?: number } {
  switch (prefs.marketCap) {
    case 'Large': return { more: 10e9 };
    case 'Mid': return { more: 2e9, lower: 10e9 };
    case 'Small': return { more: 3e8, lower: 2e9 }; // skip micro/penny illiquids
    default:
      // "Any": when growth matters, hunt the $2-80B "growth zone" where
      // under-the-radar growers concentrate. The handful of mega-cap growers
      // (NVDA/META/AVGO) still reach us via the LLM, so excluding the mostly
      // mature >$80B tier here sharply raises the growth hit-rate.
      return (prefs.growth === 'High' || prefs.growth === 'Medium')
        ? { more: 2e9, lower: 80e9 }
        : { more: 1e9 };
  }
}

// A plain-English reason for screener-sourced names (the LLM didn't pick these,
// so we describe them straight from their real pillars).
function reasonFromPillars(d: { sector: string; pillars: Pillars }): string {
  const p = d.pillars || {};
  const bits: string[] = [];
  if ((p.growing ?? 0) >= 4.5) bits.push('fast-growing');
  else if ((p.growing ?? 0) >= 3.5) bits.push('steadily growing');
  if ((p.profitable ?? 0) >= 4) bits.push('highly profitable');
  if ((p.safe ?? 0) >= 4) bits.push('financially sturdy');
  if ((p.canKeepWinning ?? 0) >= 4) bits.push('a durable moat');
  if ((p.fairlyPriced ?? 0) >= 3.5) bits.push('reasonably valued');
  const lead = bits.length ? bits.slice(0, 2).join(', ') : 'solid all-round fundamentals';
  const text = `Surfaced from the market screen — ${lead}.`;
  return text.charAt(0).toUpperCase() + text.slice(1);
}

// One AI review per requester per day, to avoid abusing the model. Keyed by IP
// (the analyzer is anonymous); in-memory, so it resets if the server restarts.
const DAY_MS = 24 * 60 * 60 * 1000;
const lastReviewAt = new Map<string, number>();

function formatRemaining(ms: number): string {
  const h = Math.floor(ms / (60 * 60 * 1000));
  const m = Math.floor((ms % (60 * 60 * 1000)) / (60 * 1000));
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

/**
 * POST /api/portfolio/review
 * Body: ReviewPayload (profile + totals + holdings with Funda ratings/pillars).
 * Streams an AI-written review token-by-token from the local model (Ollama) as
 * plain text. Rate-limited to once per day per requester. Connection/model
 * problems return a 503 + setup hint instead (and don't consume the daily run).
 */
router.post('/review', async (req: Request, res: Response) => {
  const payload = req.body as ReviewPayload;
  if (!payload?.holdings?.length) {
    return res.status(400).json({ error: 'No holdings to review.' });
  }

  const key = req.ip || 'anon';
  const last = lastReviewAt.get(key);
  const now = Date.now();
  if (last && now - last < DAY_MS) {
    const retryAfterMs = DAY_MS - (now - last);
    return res.status(429).json({
      error: `You've already run today's AI review. The next one is available in ${formatRemaining(retryAfterMs)}.`,
      retryAfterMs
    });
  }

  let stream: NodeJS.ReadableStream;
  try {
    stream = await streamReview(payload);
  } catch (error) {
    if (error instanceof OllamaUnavailableError) {
      return res.status(503).json({ error: error.message });
    }
    console.error('Portfolio review error:', error);
    return res.status(500).json({ error: 'Failed to generate review.' });
  }

  // Only consume the daily allowance once the model is actually reachable
  lastReviewAt.set(key, now);

  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache');

  // Ollama emits newline-delimited JSON; forward each token's content as it lands
  let buffer = '';
  stream.on('data', (chunk: Buffer) => {
    buffer += chunk.toString();
    let nl: number;
    while ((nl = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, nl).trim();
      buffer = buffer.slice(nl + 1);
      if (!line) continue;
      try {
        const obj = JSON.parse(line);
        if (obj.message?.content) res.write(obj.message.content);
      } catch {
        /* ignore partial/non-JSON lines */
      }
    }
  });
  stream.on('end', () => res.end());
  stream.on('error', () => res.end());
});

// Light cooldown so the (single-threaded, local) model isn't hammered by repeat
// clicks. Suggestions are meant to be iterated on, so this is short - not daily.
const SUGGEST_COOLDOWN_MS = 12 * 1000;
const lastSuggestAt = new Map<string, number>();

type Pillars = { growing?: number; profitable?: number; fairlyPriced?: number; safe?: number; canKeepWinning?: number };
interface Grounded {
  ticker: string; name: string; sector: string; marketCap: number | null;
  price: number; rating: number; pillars: Pillars; reason: string; isEtf: boolean;
}

// Minimum REAL Funda pillar scores a candidate must clear for the given
// preferences. This is the gatekeeper: the LLM only nominates names, but a name
// only ships if its actual fundamentals back up what the user asked for. e.g.
// "High growth" demands a growing pillar of 4.5/5 — so slow-growers (ADBE/KO)
// are rejected even if the model suggested them.
const GROWTH_MIN: Record<string, number> = { High: 4.5, Medium: 3.3, Low: 0 };
const SAFE_MIN: Record<string, number> = { Conservative: 3.0, Balanced: 2.0, Aggressive: 0 };

function capBucketOk(marketCap: number | null, pref: string): boolean {
  if (pref === 'Any' || marketCap == null) return true; // unknown cap -> don't drop
  if (pref === 'Large') return marketCap >= 10e9;
  if (pref === 'Mid') return marketCap >= 2e9 && marketCap < 10e9;
  if (pref === 'Small') return marketCap < 2e9;
  return true;
}

function passesGates(s: Grounded, prefs: SuggestPreferences): boolean {
  // Default to stocks-only: Funda rates company fundamentals, not funds
  if (prefs.assetType !== 'Any' && s.isEtf) return false;
  if ((s.pillars.growing ?? 0) < (GROWTH_MIN[prefs.growth] ?? 0)) return false;
  if ((s.pillars.safe ?? 0) < (SAFE_MIN[prefs.risk] ?? 0)) return false;
  if (!capBucketOk(s.marketCap, prefs.marketCap)) return false;
  if (s.rating < 2.5) return false; // never surface clearly weak fundamentals
  return true;
}

// Rank survivors by a preference-weighted blend of their real pillars, so the
// ordering reflects what the user cares about (not just overall rating).
function fitScore(s: Grounded, prefs: SuggestPreferences): number {
  const p = s.pillars;
  const g = p.growing ?? 0, prof = p.profitable ?? 0, val = p.fairlyPriced ?? 0, safe = p.safe ?? 0, moat = p.canKeepWinning ?? 0;

  let wG = 1, wProf = 1, wVal = 1, wSafe = 1, wMoat = 1;
  if (prefs.risk === 'Aggressive') { wG = 1.6; wMoat = 1.3; wVal = 0.6; wSafe = 0.5; }
  else if (prefs.risk === 'Conservative') { wSafe = 1.6; wVal = 1.3; wProf = 1.3; wG = 0.6; }

  if (prefs.growth === 'High') wG += 1.4;
  else if (prefs.growth === 'Medium') wG += 0.6;

  let score = wG * g + wProf * prof + wVal * val + wSafe * safe + wMoat * moat + s.rating * 0.5;

  if (prefs.sectors?.length) {
    const sec = (s.sector || '').toLowerCase();
    if (sec && prefs.sectors.some(pref => sec.includes(pref.toLowerCase()) || pref.toLowerCase().includes(sec))) {
      score += 3; // soft sector preference (taxonomies differ, so loose match)
    }
  }
  return score;
}

/**
 * POST /api/portfolio/suggest
 * Body: { holdings: SuggestHolding[], preferences: SuggestPreferences }
 * The local model proposes candidate tickers to ADD; each is then grounded in a
 * real Funda rating (price + 5 pillars) before being returned. Unverifiable or
 * already-held tickers are dropped. Returns the best `count` by Funda rating.
 */
router.post('/suggest', async (req: Request, res: Response) => {
  const holdings = (req.body?.holdings || []) as SuggestHolding[];
  const prefs = req.body?.preferences as SuggestPreferences;

  if (!prefs) {
    return res.status(400).json({ error: 'Missing preferences.' });
  }

  const key = req.ip || 'anon';
  const last = lastSuggestAt.get(key);
  const now = Date.now();
  if (last && now - last < SUGGEST_COOLDOWN_MS) {
    return res.status(429).json({ error: 'Easy there — give it a few seconds before asking again.' });
  }

  const count = Math.min(Math.max(prefs.count || 5, 1), 8);
  lastSuggestAt.set(key, now);

  const held = new Set(holdings.map(h => h.ticker.toUpperCase()));

  // --- Source 1: the local LLM's ideas (good for well-known names) ---
  // Don't let Ollama being down kill the whole request: the screener can still
  // carry it. Only surface the Ollama error if we end up with nothing at all.
  let llmIdeas: { ticker: string; reason: string }[] = [];
  let ollamaError: string | null = null;
  try {
    llmIdeas = await suggestTickers(holdings, { ...prefs, count: count + 10 });
  } catch (error) {
    if (error instanceof OllamaUnavailableError) ollamaError = error.message;
    else console.error('Portfolio suggest (LLM) error:', error);
  }

  // --- Source 2: the live market screener (finds growers the LLM never knew) ---
  const cap = capWindow(prefs);
  let screenerHits: { ticker: string; marketCap?: number }[] = [];
  try {
    screenerHits = await screenStocks({
      marketCapMoreThan: cap.more,
      marketCapLowerThan: cap.lower,
      sectors: toFmpSectors(prefs.sectors), // map UI labels -> FMP sector names; screener is stocks-only
      priceMoreThan: 3,
      limitPerCall: 120
    });
  } catch (error) {
    console.warn('Portfolio suggest (screener) error:', error);
  }

  // Build the resolution queue: LLM ideas first (often the strongest known
  // names), then a sample of the screener universe. We bias the sample toward
  // the LARGER companies in the selected window — that's where rateable
  // financials and genuine growers concentrate (random micro-caps mostly fail
  // the rating) — but shuffle within that quality pool so repeat runs still
  // surface different ideas instead of the same fixed list.
  const reasonByTicker = new Map(llmIdeas.map(i => [i.ticker, i.reason]));
  const llmTickers = llmIdeas.map(i => i.ticker).filter(t => !held.has(t));
  // The cap window already bounds the universe to a sensible quality band, so
  // just shuffle it to explore the whole zone (and vary across repeat runs).
  const screenerTickers = shuffle(screenerHits.map(h => h.ticker))
    .filter(t => !held.has(t) && !reasonByTicker.has(t));

  const queue = [...new Set([...llmTickers, ...screenerTickers])].slice(0, MAX_RESOLVE);

  if (queue.length === 0) {
    return res.json({
      suggestions: [],
      note: ollamaError || 'No candidates matched — try widening the market cap or clearing the sector filter.'
    });
  }

  // Ground every candidate in a real Funda rating (bounded concurrency), drop
  // anything we can't verify. Screener names get a reason built from their pillars.
  const resolved = await mapLimit(queue, RESOLVE_CONCURRENCY, async (ticker): Promise<Grounded | null> => {
    try {
      const result = await getStockDetail(ticker);
      if ('error' in result) return null;
      const d = result.detail;
      return {
        ticker: d.ticker,
        name: d.companyName,
        sector: d.sector,
        marketCap: d.marketCap ?? null,
        price: d.price,
        rating: d.rating,
        pillars: d.pillars,
        reason: reasonByTicker.get(ticker) || reasonFromPillars(d),
        isEtf: !!d.isEtf
      };
    } catch {
      return null;
    }
  });

  // Gate on the REAL pillars, then rank by preference-weighted fit.
  const ranked = resolved
    .filter((s): s is Grounded => s !== null)
    .filter(s => passesGates(s, prefs))
    .sort((a, b) => fitScore(b, prefs) - fitScore(a, prefs));

  // Collapse the same company appearing under two tickers (e.g. FB/META, or
  // GOOG/GOOGL share classes) by de-duplicating on a normalized company name.
  const seenNames = new Set<string>();
  const suggestions: Grounded[] = [];
  for (const s of ranked) {
    const nameKey = s.name.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (nameKey && seenNames.has(nameKey)) continue;
    seenNames.add(nameKey);
    suggestions.push(s);
    if (suggestions.length >= count) break;
  }

  if (suggestions.length === 0) {
    const why: string[] = [];
    if ((GROWTH_MIN[prefs.growth] ?? 0) > 0) why.push(`growth ≥ ${GROWTH_MIN[prefs.growth]}/5`);
    if (prefs.marketCap !== 'Any') why.push(`${prefs.marketCap.toLowerCase()}-cap`);
    if ((SAFE_MIN[prefs.risk] ?? 0) > 0) why.push(`balance-sheet safety ≥ ${SAFE_MIN[prefs.risk]}/5`);
    return res.json({
      suggestions: [],
      note: `None of the ideas cleared your filters (${why.join(', ') || 'quality floor'}). Try widening the market cap, easing the growth requirement, or a different sector.`
    });
  }

  // Be transparent when the gates filtered out most ideas — better to return a
  // few names that truly fit than to pad the list with ones that don't.
  const note = suggestions.length < count
    ? `Only ${suggestions.length} idea${suggestions.length === 1 ? '' : 's'} cleared your bar (e.g. growth ≥ ${GROWTH_MIN[prefs.growth] ?? 0}/5). Run again for more, or ease a filter to widen the field.`
    : undefined;

  return res.json({ suggestions, note });
});

export default router;
