/**
 * Admin auth (DESIGN AD-8): verify a passcode against a bcrypt hash from SSM,
 * then issue a short-lived HMAC-signed session token. Players have no auth.
 * No Cognito, no user accounts (CONVENTIONS §10). Secrets come from the `Secrets`
 * port and never touch logs or the bundle (§4.6).
 */
import { createHmac, timingSafeEqual } from 'node:crypto';
import bcrypt from 'bcryptjs';
import type { Secrets } from '../ports.js';

/** Claims embedded in a session token. */
export interface SessionClaims {
  role: 'admin';
  leagueId: string;
  /** Expiry, epoch seconds. */
  exp: number;
}

export type VerifyResult = { ok: true; claims: SessionClaims } | { ok: false };

function b64url(input: string): string {
  return Buffer.from(input, 'utf8').toString('base64url');
}

function sign(payloadB64: string, key: string): string {
  return createHmac('sha256', key).update(payloadB64).digest('base64url');
}

/** True iff the plaintext passcode matches the stored bcrypt hash. */
export async function verifyPasscode(secrets: Secrets, passcode: string): Promise<boolean> {
  const hash = await secrets.getPasscodeHash();
  return bcrypt.compare(passcode, hash);
}

/** Mint a signed admin session token valid for `ttlSec` from `now` (ms). */
export async function issueSession(
  secrets: Secrets,
  leagueId: string,
  now: number,
  ttlSec: number,
): Promise<{ token: string; expiresAt: number }> {
  const claims: SessionClaims = {
    role: 'admin',
    leagueId,
    exp: Math.floor(now / 1000) + ttlSec,
  };
  const payloadB64 = b64url(JSON.stringify(claims));
  const key = await secrets.getHmacKey();
  const token = `${payloadB64}.${sign(payloadB64, key)}`;
  return { token, expiresAt: claims.exp };
}

/** Verify a token's signature, expiry, and league scope (constant-time compare). */
export async function verifySession(
  secrets: Secrets,
  token: string | undefined,
  leagueId: string,
  now: number,
): Promise<VerifyResult> {
  if (!token) return { ok: false };
  const dot = token.indexOf('.');
  if (dot <= 0) return { ok: false };
  const payloadB64 = token.slice(0, dot);
  const provided = token.slice(dot + 1);
  const key = await secrets.getHmacKey();
  const expected = sign(payloadB64, key);

  const providedBuf = Buffer.from(provided);
  const expectedBuf = Buffer.from(expected);
  if (providedBuf.length !== expectedBuf.length) return { ok: false };
  if (!timingSafeEqual(providedBuf, expectedBuf)) return { ok: false };

  let claims: SessionClaims;
  try {
    claims = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8')) as SessionClaims;
  } catch {
    return { ok: false };
  }
  if (claims.role !== 'admin' || claims.leagueId !== leagueId) return { ok: false };
  if (claims.exp <= Math.floor(now / 1000)) return { ok: false };
  return { ok: true, claims };
}
