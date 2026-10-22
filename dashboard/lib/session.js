import { EncryptJWT, jwtDecrypt } from 'jose';
import { cookies } from 'next/headers';

const COOKIE = 'nx_session';
const MAX_AGE = 60 * 60 * 24 * 7; // 7 days
const secure = process.env.NODE_ENV === 'production';

async function key() {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 16) throw new Error('SESSION_SECRET must be set (32+ chars recommended)');
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(secret));
  return new Uint8Array(digest);
}

/** Encrypted (not just signed) so the Discord access token is never readable client-side. */
export async function createSession(data) {
  return new EncryptJWT(data)
    .setProtectedHeader({ alg: 'dir', enc: 'A256GCM' })
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE}s`)
    .encrypt(await key());
}

export async function readSession() {
  const store = await cookies();
  const token = store.get(COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtDecrypt(token, await key());
    return payload;
  } catch {
    return null;
  }
}

// HTTPS-only in production; HTTP localhost needs this disabled during local development.
export const cookieOptions = { name: COOKIE, httpOnly: true, secure, sameSite: 'lax', path: '/', maxAge: MAX_AGE };
