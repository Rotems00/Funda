import axios from 'axios';

/**
 * Local open-source LLM (Ollama) integration for reviewing a user's portfolio.
 * Runs entirely on the user's machine - no API key, no data leaving the host.
 * Configure with OLLAMA_URL / OLLAMA_MODEL; defaults to a local llama3.1.
 */

// 127.0.0.1 (not "localhost") avoids Node resolving to IPv6 ::1, which Ollama
// doesn't listen on by default
const OLLAMA_URL = process.env.OLLAMA_URL || 'http://127.0.0.1:11434';
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'llama3.1';

export interface ReviewHolding {
  ticker: string;
  name?: string;
  weightPct: number;
  rating: number;
  sector?: string;
  gainPct?: number | null;
  pillars?: { growing?: number; profitable?: number; fairlyPriced?: number; safe?: number; canKeepWinning?: number };
}

export interface ReviewPayload {
  profile: string; // Conservative / Balanced / Aggressive
  totals: { totalValue: number; weightedRating: number; totalGainPct?: number | null };
  holdings: ReviewHolding[];
}

export class OllamaUnavailableError extends Error {}

function buildPrompt(p: ReviewPayload): { system: string; user: string } {
  const system =
    `You are a fundamental-investing assistant reviewing a user's stock portfolio. ` +
    `You are given Funda's quantitative ratings for each holding: an overall 0-5 rating and five 0-5 pillars - ` +
    `Growing, Profitable, Valuation (fairly priced), Resilient (balance sheet), and Moat (can keep winning) - plus each holding's portfolio weight and profit/loss. ` +
    `Write a concise, balanced review grounded ONLY in the data provided - never invent prices, news, or figures. ` +
    `Structure your answer as: a 2-3 sentence overall take; then short "Strengths", "Risks", and "Fit for a ${p.profile} investor" sections; ` +
    `then 2-3 concrete, specific suggestions (cite tickers and their weights/scores). ` +
    `Keep it under ~250 words. Finish with the line: "Informational only - not financial advice."`;

  const lines = p.holdings.map(h => {
    const pl = h.pillars || {};
    const pillarStr = `Growing ${pl.growing?.toFixed(1) ?? '?'}, Profitable ${pl.profitable?.toFixed(1) ?? '?'}, Valuation ${pl.fairlyPriced?.toFixed(1) ?? '?'}, Resilient ${pl.safe?.toFixed(1) ?? '?'}, Moat ${pl.canKeepWinning?.toFixed(1) ?? '?'}`;
    const plStr = h.gainPct == null ? 'P/L n/a' : `P/L ${h.gainPct >= 0 ? '+' : ''}${h.gainPct.toFixed(1)}%`;
    return `- ${h.ticker}${h.name ? ` (${h.name})` : ''} — ${h.weightPct.toFixed(1)}% of portfolio · ${h.sector || 'sector n/a'} · Funda ${h.rating.toFixed(1)}/5 · pillars: ${pillarStr} · ${plStr}`;
  }).join('\n');

  const totalsStr =
    `Portfolio value: $${Math.round(p.totals.totalValue).toLocaleString()}. ` +
    `Value-weighted Funda rating: ${p.totals.weightedRating.toFixed(1)}/5. ` +
    (p.totals.totalGainPct == null ? '' : `Overall P/L: ${p.totals.totalGainPct >= 0 ? '+' : ''}${p.totals.totalGainPct.toFixed(1)}%. `);

  const user = `Risk profile: ${p.profile}.\n${totalsStr}\n\nHoldings (${p.holdings.length}):\n${lines}`;
  return { system, user };
}

/**
 * Open a streaming chat with Ollama and return the raw NDJSON token stream.
 * Connection/model errors are converted to OllamaUnavailableError *before* any
 * bytes are sent, so the route can still respond with a clean 503 + setup hint.
 */
export async function streamReview(payload: ReviewPayload): Promise<NodeJS.ReadableStream> {
  const { system, user } = buildPrompt(payload);
  try {
    const res = await axios.post(
      `${OLLAMA_URL}/api/chat`,
      {
        model: OLLAMA_MODEL,
        stream: true,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user }
        ]
      },
      { responseType: 'stream', timeout: 120_000 }
    );
    return res.data as NodeJS.ReadableStream;
  } catch (error) {
    const status = axios.isAxiosError(error) ? error.response?.status : undefined;
    const code = axios.isAxiosError(error) ? error.code : undefined;
    if (status === 404) {
      throw new OllamaUnavailableError(`Model "${OLLAMA_MODEL}" isn't installed. Run: ollama pull ${OLLAMA_MODEL}`);
    }
    if (code === 'ECONNREFUSED' || code === 'ECONNABORTED' || !status) {
      throw new OllamaUnavailableError(`Can't reach Ollama at ${OLLAMA_URL}. Start it with "ollama serve" and install a model: "ollama pull ${OLLAMA_MODEL}".`);
    }
    throw error;
  }
}

/* ------------------------------------------------------------------ *
 * Portfolio recommendations: the model proposes candidate tickers to
 * ADD, given the user's current holdings and stated preferences. The
 * route then grounds each suggestion in a real Funda rating, so the LLM
 * is only used for the "which companies to consider" creative step -
 * never for the numbers.
 * ------------------------------------------------------------------ */

export interface SuggestHolding {
  ticker: string;
  sector?: string;
  rating?: number;
}

export interface SuggestPreferences {
  risk: string;       // Conservative | Balanced | Aggressive
  marketCap: string;  // Any | Large | Mid | Small
  sectors: string[];  // empty => no sector preference
  growth: string;     // Low | Medium | High  (importance of growth)
  dividend: string;   // No | Nice-to-have | Important
  assetType?: string; // Stocks (default) | Any  - whether ETFs/funds are allowed
  count: number;      // how many ideas the user wants
}

export interface SuggestedTicker {
  ticker: string;
  reason: string;
}

const MARKET_CAP_HINT: Record<string, string> = {
  Large: 'large-cap companies (market cap over ~$10B)',
  Mid: 'mid-cap companies (market cap roughly $2B-$10B)',
  Small: 'small-cap companies (market cap under ~$2B)',
  Any: 'companies of any market cap'
};

function buildSuggestPrompt(holdings: SuggestHolding[], p: SuggestPreferences): { system: string; user: string } {
  const system =
    `You are a fundamental-investing screener helping a user find NEW US-listed stocks to add to their portfolio. ` +
    `Suggest only well-known, real, currently US-exchange-listed companies (common stock, not ETFs or funds) with a reputation for strong fundamentals. ` +
    `NEVER suggest a ticker the user already holds. Do not invent prices, financial figures, or news - each "reason" must be a short, qualitative one-liner about why the company fits the user's preferences. ` +
    `Respond with ONLY a JSON object of the form {"suggestions":[{"ticker":"AAPL","reason":"..."}]} and nothing else.`;

  const held = holdings.map(h => h.ticker).join(', ') || '(none yet)';
  const sectors = p.sectors.length ? p.sectors.join(', ') : 'no specific sector preference';
  const capHint = MARKET_CAP_HINT[p.marketCap] || MARKET_CAP_HINT.Any;

  // The biggest failure mode is the model defaulting to mature blue-chips
  // (KO, JNJ, ADBE) when the user wants growth, so steer hard on growth/risk.
  let growthDirective = '';
  if (p.growth === 'High') {
    growthDirective =
      `GROWTH IS THE TOP PRIORITY. Only suggest companies you are confident are growing FAST right now ` +
      `(strong, sustained double-digit revenue growth). Do NOT suggest slow-growing mature blue-chips ` +
      `(e.g. avoid the likes of Coca-Cola, Johnson & Johnson, or Adobe) — those will be rejected.`;
  } else if (p.growth === 'Medium') {
    growthDirective = `Growth matters: lean toward companies still meaningfully growing revenue, not flat/declining mature names.`;
  } else {
    growthDirective = `Growth is not a priority: stability and quality matter more than fast growth.`;
  }

  let riskDirective = '';
  if (p.risk === 'Aggressive') {
    riskDirective = `The user is aggressive and accepts higher risk for higher upside — bolder, faster-growing names are welcome.`;
  } else if (p.risk === 'Conservative') {
    riskDirective = `The user is conservative — favour financially sturdy, durable, lower-volatility businesses.`;
  } else {
    riskDirective = `The user has a balanced risk appetite — mix quality and growth sensibly.`;
  }

  const assetDirective = p.assetType === 'Any'
    ? `Individual common stocks are preferred, but a strong ETF/fund is acceptable.`
    : `Suggest INDIVIDUAL COMMON STOCKS ONLY — never ETFs, index funds, mutual funds, or trusts. Any ETF/fund will be rejected.`;

  const user =
    `The user already holds: ${held}.\n` +
    `Their preferences:\n` +
    `- Risk appetite: ${p.risk}.\n` +
    `- Prefer ${capHint}.\n` +
    `- Sector interest: ${sectors}.\n` +
    `- Importance of growth: ${p.growth}.\n` +
    `- Importance of dividends: ${p.dividend}.\n\n` +
    `${assetDirective}\n${growthDirective}\n${riskDirective}\n\n` +
    `Suggest ${p.count} companies (tickers) that would diversify and complement this portfolio while matching the preferences above. ` +
    `Favour names that genuinely screen well on fundamentals (growing, profitable, reasonably valued, financially sturdy, durable moat). ` +
    `Return strictly the JSON object described.`;

  return { system, user };
}

function parseSuggestions(content: string): SuggestedTicker[] {
  // The model is asked for {"suggestions":[...]}, but small local models
  // sometimes wrap it in prose; grab the first {...} or [...] block.
  const tryParse = (text: string): SuggestedTicker[] | null => {
    try {
      const obj = JSON.parse(text);
      const arr = Array.isArray(obj) ? obj : obj?.suggestions;
      if (!Array.isArray(arr)) return null;
      return arr
        .map((x: any) => ({
          ticker: String(x?.ticker || x?.symbol || '').toUpperCase().trim(),
          reason: String(x?.reason || x?.rationale || '').trim()
        }))
        .filter(s => /^[A-Z][A-Z.\-]{0,6}$/.test(s.ticker));
    } catch {
      return null;
    }
  };

  const direct = tryParse(content);
  if (direct) return direct;

  const objMatch = content.match(/\{[\s\S]*\}/);
  if (objMatch) {
    const fromObj = tryParse(objMatch[0]);
    if (fromObj) return fromObj;
  }
  const arrMatch = content.match(/\[[\s\S]*\]/);
  if (arrMatch) {
    const fromArr = tryParse(arrMatch[0]);
    if (fromArr) return fromArr;
  }
  return [];
}

/**
 * Ask the local model for candidate tickers to add. Non-streaming: we need the
 * full list to validate each against real Funda ratings before returning.
 * Throws OllamaUnavailableError (same as streamReview) when Ollama/model is down.
 */
export async function suggestTickers(holdings: SuggestHolding[], prefs: SuggestPreferences): Promise<SuggestedTicker[]> {
  const { system, user } = buildSuggestPrompt(holdings, prefs);
  try {
    const res = await axios.post(
      `${OLLAMA_URL}/api/chat`,
      {
        model: OLLAMA_MODEL,
        stream: false,
        format: 'json',
        options: { temperature: 0.6 },
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user }
        ]
      },
      { timeout: 120_000 }
    );
    const content: string = res.data?.message?.content || '';
    const held = new Set(holdings.map(h => h.ticker.toUpperCase()));

    // De-dupe and drop any already-held names the model slipped in
    const seen = new Set<string>();
    return parseSuggestions(content).filter(s => {
      if (held.has(s.ticker) || seen.has(s.ticker)) return false;
      seen.add(s.ticker);
      return true;
    });
  } catch (error) {
    const status = axios.isAxiosError(error) ? error.response?.status : undefined;
    const code = axios.isAxiosError(error) ? error.code : undefined;
    if (status === 404) {
      throw new OllamaUnavailableError(`Model "${OLLAMA_MODEL}" isn't installed. Run: ollama pull ${OLLAMA_MODEL}`);
    }
    if (code === 'ECONNREFUSED' || code === 'ECONNABORTED' || !status) {
      throw new OllamaUnavailableError(`Can't reach Ollama at ${OLLAMA_URL}. Start it with "ollama serve" and install a model: "ollama pull ${OLLAMA_MODEL}".`);
    }
    throw error;
  }
}

/* ------------------------------------------------------------------ *
 * Business deep-dive: a long-form review of a single company written
 * as a 20-year investor, grounded in the company description, the
 * latest quarter's numbers, Funda's ratings, and an earnings-call
 * excerpt. Streamed like streamReview; the route caches the result.
 * ------------------------------------------------------------------ */

export interface BusinessReviewContext {
  ticker: string;
  name: string;
  sector?: string;
  industry?: string;
  description?: string;
  rating: number;
  pillars?: { growing?: number; profitable?: number; fairlyPriced?: number; safe?: number; canKeepWinning?: number };
  ratios?: Record<string, number | null | undefined>;
  latestQuarter?: {
    period?: string;
    revenue?: number;
    netIncome?: number;
    eps?: number;
    operatingCashFlow?: number;
    cash?: number;
    debt?: number;
    revenueYoY?: number;
    epsYoY?: number;
  };
  transcriptExcerpt?: string;
  transcriptLabel?: string;
}

const fmtMoney = (v?: number) => {
  if (v == null) return 'n/a';
  const a = Math.abs(v);
  if (a >= 1e9) return `$${(v / 1e9).toFixed(1)}B`;
  if (a >= 1e6) return `$${(v / 1e6).toFixed(0)}M`;
  return `$${v.toLocaleString()}`;
};

function buildBusinessPrompt(c: BusinessReviewContext): { system: string; user: string } {
  const system =
    `You are a seasoned value investor with 20 years of experience analyzing and owning businesses. ` +
    `You write candid, plain-English investment reviews for a thoughtful individual investor. ` +
    `Ground EVERYTHING in the data provided below — the company description, the latest quarter's numbers, Funda's 0-5 ratings, and the earnings-call excerpt. ` +
    `Never invent figures, prices, or facts not present in the data; if something isn't given, say so plainly. Be specific, balanced, and unafraid to name real risks. ` +
    `Bring the seasoned investor's judgment and angle, but do NOT refer to yourself, your experience, or "20 years" anywhere in the text. ` +
    `Write in Markdown with these exact section headings, in order:\n` +
    `## What the business does\n## How it makes money\n## The moat\n## The numbers\n## Risks & downside\n## The verdict\n` +
    `In "The verdict", give a clear, opinionated bottom-line view of the business. ` +
    `Keep it tight and useful (~450-650 words total). End with the line: "Informational only — not financial advice."`;

  const p = c.pillars || {};
  const r = c.ratios || {};
  const q = c.latestQuarter || {};

  const fundaLine =
    `Funda rating ${c.rating?.toFixed(1)}/5 — Growing ${p.growing?.toFixed(1) ?? '?'}, Profitable ${p.profitable?.toFixed(1) ?? '?'}, ` +
    `Valuation ${p.fairlyPriced?.toFixed(1) ?? '?'}, Resilient ${p.safe?.toFixed(1) ?? '?'}, Moat ${p.canKeepWinning?.toFixed(1) ?? '?'}.`;

  const ratioLine =
    `P/E ${r.peRatio ?? 'n/a'}, Forward P/E ${r.forwardPE ?? 'n/a'}, PEG ${r.pegRatio ?? 'n/a'}, ` +
    `Net margin ${r.netMargin ?? 'n/a'}%, ROIC ${r.roic ?? 'n/a'}%, Debt/Equity ${r.debtToEquity ?? 'n/a'}.`;

  const qLine =
    `Latest quarter${q.period ? ` (${q.period})` : ''}: revenue ${fmtMoney(q.revenue)} ` +
    `(${q.revenueYoY == null ? 'YoY n/a' : `${q.revenueYoY >= 0 ? '+' : ''}${q.revenueYoY.toFixed(1)}% YoY`}), ` +
    `net income ${fmtMoney(q.netIncome)}, EPS ${q.eps ?? 'n/a'} ` +
    `(${q.epsYoY == null ? 'YoY n/a' : `${q.epsYoY >= 0 ? '+' : ''}${q.epsYoY.toFixed(1)}% YoY`}), ` +
    `operating cash flow ${fmtMoney(q.operatingCashFlow)}, cash ${fmtMoney(q.cash)}, debt ${fmtMoney(q.debt)}.`;

  const user =
    `Company: ${c.name} (${c.ticker})${c.sector ? ` — ${c.sector}${c.industry ? ` / ${c.industry}` : ''}` : ''}.\n\n` +
    `Business description (from filings):\n${c.description || 'Not provided.'}\n\n` +
    `${fundaLine}\n${ratioLine}\n${qLine}\n\n` +
    (c.transcriptExcerpt
      ? `Excerpt from the latest earnings call${c.transcriptLabel ? ` (${c.transcriptLabel})` : ''} — management's own words:\n"""\n${c.transcriptExcerpt}\n"""\n\n`
      : `No earnings-call transcript was available.\n\n`) +
    `Write the full review now, following the required sections.`;

  return { system, user };
}

export async function streamBusinessReview(context: BusinessReviewContext): Promise<NodeJS.ReadableStream> {
  const { system, user } = buildBusinessPrompt(context);
  try {
    const res = await axios.post(
      `${OLLAMA_URL}/api/chat`,
      {
        model: OLLAMA_MODEL,
        stream: true,
        options: { temperature: 0.6 },
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user }
        ]
      },
      { responseType: 'stream', timeout: 300_000 }
    );
    return res.data as NodeJS.ReadableStream;
  } catch (error) {
    const status = axios.isAxiosError(error) ? error.response?.status : undefined;
    const code = axios.isAxiosError(error) ? error.code : undefined;
    if (status === 404) {
      throw new OllamaUnavailableError(`Model "${OLLAMA_MODEL}" isn't installed. Run: ollama pull ${OLLAMA_MODEL}`);
    }
    if (code === 'ECONNREFUSED' || code === 'ECONNABORTED' || !status) {
      throw new OllamaUnavailableError(`Can't reach Ollama at ${OLLAMA_URL}. Start it with "ollama serve" and install a model: "ollama pull ${OLLAMA_MODEL}".`);
    }
    throw error;
  }
}

export default { streamReview, suggestTickers, streamBusinessReview };
