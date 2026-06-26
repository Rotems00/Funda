import { Router, Request, Response } from 'express';
import { streamReview, OllamaUnavailableError, ReviewPayload } from '../services/ollamaService';

const router = Router();

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

export default router;
