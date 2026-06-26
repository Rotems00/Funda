import { OAuth2Client } from 'google-auth-library';
import jwt from 'jsonwebtoken';

/**
 * Auth Service
 * Verifies Google ID tokens and issues/verifies our own session JWT.
 * We never see the user's Google password - the frontend's Google Sign-In
 * button hands us a signed ID token, which we verify server-side.
 */

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const JWT_SECRET = process.env.JWT_SECRET || 'dev-only-insecure-secret-change-me';
const SESSION_TTL = '30d';

const googleClient = new OAuth2Client(GOOGLE_CLIENT_ID);

export interface GoogleProfile {
  googleId: string;
  email: string;
  name?: string;
  picture?: string;
}

export interface SessionPayload {
  userId: string;
  email: string;
}

/**
 * Verify a Google ID token (from the frontend's Sign-In button) and extract
 * the user's profile. Throws if the token is invalid, expired, or wasn't
 * issued for our Client ID.
 */
export async function verifyGoogleToken(idToken: string): Promise<GoogleProfile> {
  const ticket = await googleClient.verifyIdToken({
    idToken,
    audience: GOOGLE_CLIENT_ID
  });

  const payload = ticket.getPayload();
  if (!payload || !payload.sub || !payload.email) {
    throw new Error('Invalid Google token payload');
  }

  return {
    googleId: payload.sub,
    email: payload.email,
    name: payload.name,
    picture: payload.picture
  };
}

export function createSessionToken(payload: SessionPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: SESSION_TTL });
}

export function verifySessionToken(token: string): SessionPayload | null {
  try {
    return jwt.verify(token, JWT_SECRET) as SessionPayload;
  } catch {
    return null;
  }
}

export default {
  verifyGoogleToken,
  createSessionToken,
  verifySessionToken
};
