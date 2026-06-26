import { Request, Response, NextFunction } from 'express';
import { verifySessionToken } from '../services/authService';

export const SESSION_COOKIE = 'funda_session';

declare global {
  namespace Express {
    interface Request {
      userId?: string;
      userEmail?: string;
    }
  }
}

/**
 * Requires a valid session cookie. Attaches req.userId/req.userEmail on
 * success, otherwise responds 401.
 */
export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const token = req.cookies?.[SESSION_COOKIE];
  const session = token ? verifySessionToken(token) : null;

  if (!session) {
    return res.status(401).json({ error: 'Not signed in' });
  }

  req.userId = session.userId;
  req.userEmail = session.email;
  next();
}
