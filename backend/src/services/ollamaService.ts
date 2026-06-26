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
    `Growing, Profitable, Valuation (fairly priced), Safe (balance sheet), and Moat (can keep winning) - plus each holding's portfolio weight and profit/loss. ` +
    `Write a concise, balanced review grounded ONLY in the data provided - never invent prices, news, or figures. ` +
    `Structure your answer as: a 2-3 sentence overall take; then short "Strengths", "Risks", and "Fit for a ${p.profile} investor" sections; ` +
    `then 2-3 concrete, specific suggestions (cite tickers and their weights/scores). ` +
    `Keep it under ~250 words. Finish with the line: "Informational only - not financial advice."`;

  const lines = p.holdings.map(h => {
    const pl = h.pillars || {};
    const pillarStr = `Growing ${pl.growing?.toFixed(1) ?? '?'}, Profitable ${pl.profitable?.toFixed(1) ?? '?'}, Valuation ${pl.fairlyPriced?.toFixed(1) ?? '?'}, Safe ${pl.safe?.toFixed(1) ?? '?'}, Moat ${pl.canKeepWinning?.toFixed(1) ?? '?'}`;
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

export default { streamReview };
