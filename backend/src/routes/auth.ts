import { Router, Request, Response } from 'express';
import { verifyGoogleToken, createSessionToken, verifySessionToken } from '../services/authService';
import { getUserProfile, saveUserProfile } from '../services/cacheService';
import { SESSION_COOKIE } from '../middleware/auth';

const router = Router();

const COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: 'lax' as const,
  secure: process.env.NODE_ENV === 'production',
  maxAge: 30 * 24 * 60 * 60 * 1000 // 30 days
};

/**
 * POST /api/auth/google
 * Body: { credential: string } - the ID token from the Google Sign-In button
 * Verifies the token, creates the user profile on first sign-in, and sets
 * a session cookie
 */
router.post('/google', async (req: Request, res: Response) => {
  try {
    const { credential } = req.body;
    if (!credential) {
      return res.status(400).json({ error: 'Missing credential' });
    }

    const profile = await verifyGoogleToken(credential);

    const existing = await getUserProfile(profile.googleId);
    const user = await saveUserProfile({
      userId: profile.googleId,
      email: profile.email,
      name: profile.name,
      picture: profile.picture,
      watchlist: existing?.watchlist || [],
      sectors: existing?.sectors || [],
      recentSearches: existing?.recentSearches || []
    });

    const sessionToken = createSessionToken({ userId: user.userId, email: user.email });
    res.cookie(SESSION_COOKIE, sessionToken, COOKIE_OPTIONS);

    return res.json({
      userId: user.userId,
      email: user.email,
      name: user.name,
      picture: user.picture
    });
  } catch (error) {
    console.error('Google sign-in error:', error);
    res.status(401).json({ error: 'Google sign-in failed' });
  }
});

/**
 * GET /api/auth/me
 * Returns the current session's user, or 401 if not signed in
 */
router.get('/me', async (req: Request, res: Response) => {
  try {
    const token = req.cookies?.[SESSION_COOKIE];
    const session = token ? verifySessionToken(token) : null;
    if (!session) {
      return res.status(401).json({ error: 'Not signed in' });
    }

    const user = await getUserProfile(session.userId);
    if (!user) {
      return res.status(401).json({ error: 'Not signed in' });
    }

    return res.json({
      userId: user.userId,
      email: user.email,
      name: user.name,
      picture: user.picture
    });
  } catch (error) {
    console.error('Get session error:', error);
    res.status(500).json({ error: 'Failed to load session' });
  }
});

/**
 * POST /api/auth/logout
 */
router.post('/logout', (req: Request, res: Response) => {
  res.clearCookie(SESSION_COOKIE, COOKIE_OPTIONS);
  res.json({ ok: true });
});

export default router;
