import bcrypt from 'bcryptjs';
import { describe, expect, it } from 'vitest';
import { FakeSecrets } from '../fakes.js';
import { issueSession, verifyPasscode, verifySession } from './auth.js';

const HASH = bcrypt.hashSync('letmein', 8);
const KEY = 'test-hmac-key';
const secrets = new FakeSecrets(HASH, KEY);
const NOW = 1_000_000; // ms

describe('verifyPasscode', () => {
  it('accepts the right passcode and rejects the wrong one', async () => {
    expect(await verifyPasscode(secrets, 'letmein')).toBe(true);
    expect(await verifyPasscode(secrets, 'nope')).toBe(false);
  });
});

describe('session tokens', () => {
  it('issues a token that verifies within its TTL', async () => {
    const { token, expiresAt } = await issueSession(secrets, 'L1', NOW, 3600);
    expect(expiresAt).toBe(1000 + 3600);
    const res = await verifySession(secrets, token, 'L1', NOW);
    expect(res).toMatchObject({ ok: true, claims: { role: 'admin', leagueId: 'L1' } });
  });

  it('rejects a missing, tampered, expired, or wrong-league token', async () => {
    const { token } = await issueSession(secrets, 'L1', NOW, 3600);
    expect(await verifySession(secrets, undefined, 'L1', NOW)).toEqual({ ok: false });
    expect(await verifySession(secrets, `${token}x`, 'L1', NOW)).toEqual({ ok: false });
    // expired: now well past exp
    expect(await verifySession(secrets, token, 'L1', NOW + 4000 * 1000)).toEqual({ ok: false });
    // wrong league scope
    expect(await verifySession(secrets, token, 'OTHER', NOW)).toEqual({ ok: false });
  });

  it('rejects a token signed with a different key', async () => {
    const { token } = await issueSession(new FakeSecrets(HASH, 'other-key'), 'L1', NOW, 3600);
    expect(await verifySession(secrets, token, 'L1', NOW)).toEqual({ ok: false });
  });
});
