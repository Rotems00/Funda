import { Router, Request, Response } from 'express';
import { requireAuth } from '../middleware/auth';
import { getUserProfile, addToWatchlist, removeFromWatchlist } from '../services/cacheService';
import { WATCHLIST_LIMIT } from '../models/stockSchema';

const router = Router();

/**
 * GET /api/users/watchlist
 * Get the signed-in user's watchlist tickers
 */
router.get('/watchlist', requireAuth, async (req: Request, res: Response) => {
  try {
    const profile = await getUserProfile(req.userId as string);
    return res.json({ watchlist: profile?.watchlist || [], limit: WATCHLIST_LIMIT });
  } catch (error) {
    console.error('Watchlist fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch watchlist' });
  }
});

/**
 * POST /api/users/watchlist
 * Body: { ticker }
 * Add a ticker to the signed-in user's watchlist (capped at WATCHLIST_LIMIT)
 */
router.post('/watchlist', requireAuth, async (req: Request, res: Response) => {
  try {
    const ticker = (req.body.ticker as string)?.toUpperCase();
    if (!ticker) {
      return res.status(400).json({ error: 'Missing ticker' });
    }

    const updated = await addToWatchlist(req.userId as string, ticker);
    if (!updated) {
      return res.status(409).json({ error: `Watchlist is full (max ${WATCHLIST_LIMIT})` });
    }

    return res.json({ watchlist: updated.watchlist, limit: WATCHLIST_LIMIT });
  } catch (error) {
    console.error('Watchlist add error:', error);
    res.status(500).json({ error: 'Failed to add to watchlist' });
  }
});

/**
 * DELETE /api/users/watchlist/:ticker
 * Remove a ticker from the signed-in user's watchlist
 */
router.delete('/watchlist/:ticker', requireAuth, async (req: Request, res: Response) => {
  try {
    const ticker = req.params.ticker.toUpperCase();
    const updated = await removeFromWatchlist(req.userId as string, ticker);
    return res.json({ watchlist: updated?.watchlist || [], limit: WATCHLIST_LIMIT });
  } catch (error) {
    console.error('Watchlist remove error:', error);
    res.status(500).json({ error: 'Failed to remove from watchlist' });
  }
});

export default router;
