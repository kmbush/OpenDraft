import { reduce } from '@opendraft/engine';
import type { DraftState } from '@opendraft/shared';
import bcrypt from 'bcryptjs';
import { describe, expect, it } from 'vitest';
import { harness, liveDraft } from '../test-helpers.js';
import { type HttpRequest, handleHttp } from './http.js';

const HASH = bcrypt.hashSync('letmein', 8);

function req(
  method: string,
  path: string,
  opts: { body?: unknown; token?: string } = {},
): HttpRequest {
  return {
    method,
    path,
    headers: opts.token ? { authorization: `Bearer ${opts.token}` } : {},
    ...(opts.body !== undefined ? { body: JSON.stringify(opts.body) } : {}),
  };
}

async function adminToken(deps: ReturnType<typeof harness>['deps']): Promise<string> {
  const res = await handleHttp(
    deps,
    req('POST', '/admin/session', { body: { passcode: 'letmein' } }),
  );
  return (res.body as { token: string }).token;
}

describe('POST /admin/session', () => {
  it('issues a token for the right passcode and 401s a wrong one', async () => {
    const { deps } = harness({ hash: HASH });
    const ok = await handleHttp(
      deps,
      req('POST', '/admin/session', { body: { passcode: 'letmein' } }),
    );
    expect(ok.status).toBe(200);
    expect((ok.body as { token: string }).token).toBeTruthy();

    const bad = await handleHttp(
      deps,
      req('POST', '/admin/session', { body: { passcode: 'nope' } }),
    );
    expect(bad.status).toBe(401);
  });

  it('rate-limits after too many attempts', async () => {
    const { deps } = harness({ hash: HASH });
    for (let i = 0; i < 5; i++) {
      await handleHttp(deps, req('POST', '/admin/session', { body: { passcode: 'x' } }));
    }
    const limited = await handleHttp(
      deps,
      req('POST', '/admin/session', { body: { passcode: 'x' } }),
    );
    expect(limited.status).toBe(429);
  });

  it('does not count successful logins toward the lockout', async () => {
    const { deps } = harness({ hash: HASH });
    // Far more successes than authMaxAttempts (5) — none should ever rate-limit.
    for (let i = 0; i < 20; i++) {
      const res = await handleHttp(
        deps,
        req('POST', '/admin/session', { body: { passcode: 'letmein' } }),
      );
      expect(res.status).toBe(200);
    }
  });

  it('resets the lockout once the attempt window elapses (does not wait on TTL)', async () => {
    let clock = 1_000_000; // ms
    const { deps } = harness({ hash: HASH, env: { now: () => clock, authWindowSec: 900 } });

    for (let i = 0; i < 5; i++) {
      await handleHttp(deps, req('POST', '/admin/session', { body: { passcode: 'x' } }));
    }
    expect(
      (await handleHttp(deps, req('POST', '/admin/session', { body: { passcode: 'x' } }))).status,
    ).toBe(429);

    // Advance past the 900s window: the counter reads as a fresh 0, so a correct
    // passcode works again — the commissioner is not locked out for hours.
    clock += 901_000;
    const after = await handleHttp(
      deps,
      req('POST', '/admin/session', { body: { passcode: 'letmein' } }),
    );
    expect(after.status).toBe(200);
  });
});

describe('draft setup CRUD', () => {
  it('requires admin to create a draft', async () => {
    const { deps } = harness({ hash: HASH });
    const res = await handleHttp(
      deps,
      req('POST', '/leagues/L1/drafts', { body: { settings: minimalSettings() } }),
    );
    expect(res.status).toBe(401);
  });

  it('creates then reads a draft (SETUP) with an admin token', async () => {
    const { deps, persistence } = harness({ hash: HASH });
    const token = await adminToken(deps);

    const created = await handleHttp(
      deps,
      req('POST', '/leagues/L1/drafts', {
        token,
        body: { settings: minimalSettings(), poolSnapshotId: '2026-07-03' },
      }),
    );
    expect(created.status).toBe(201);
    const draftId = (created.body as { draftId: string }).draftId;
    expect(draftId).toBeTruthy();
    expect(persistence.drafts.size).toBe(1);

    const fetched = await handleHttp(deps, req('GET', `/leagues/L1/drafts/${draftId}`));
    expect(fetched.status).toBe(200);
    expect(fetched.body).toMatchObject({ status: 'SETUP', poolSnapshotId: '2026-07-03' });
  });

  it('carries team name/color/owner and defaults omitted fields', async () => {
    const { deps } = harness({ hash: HASH });
    const token = await adminToken(deps);
    const created = await handleHttp(
      deps,
      req('POST', '/leagues/L1/drafts', {
        token,
        body: {
          settings: minimalSettings(),
          teams: [
            { name: 'Gridiron Gang', color: '#3b82f6', ownerLabel: 'Commish' },
            { color: 'nope' },
          ],
        },
      }),
    );
    expect(created.status).toBe(201);
    expect((created.body as { teams: unknown }).teams).toEqual([
      { slot: 1, name: 'Gridiron Gang', color: '#3b82f6', ownerLabel: 'Commish' },
      { slot: 2, name: 'Team 2', color: '#64748b' },
    ]);
  });

  it('rejects a teams array that does not match settings.teams', async () => {
    const { deps } = harness({ hash: HASH });
    const token = await adminToken(deps);
    const res = await handleHttp(
      deps,
      req('POST', '/leagues/L1/drafts', {
        token,
        body: { settings: minimalSettings(), teams: [{ name: 'Only One' }] },
      }),
    );
    expect(res.status).toBe(400);
  });

  it("lists the league's drafts newest first, without dragging pick logs along", async () => {
    const { deps, persistence } = harness({ hash: HASH });
    const token = await adminToken(deps);

    for (let i = 0; i < 3; i++) {
      // Distinct creation instants, so "newest first" is actually testable.
      deps.env.now = () => 1_000 + i * 1_000;
      await handleHttp(
        deps,
        req('POST', '/leagues/L1/drafts', { token, body: { settings: minimalSettings() } }),
      );
    }
    // A draft in a different league must not leak into this league's list.
    persistence.seed({ ...liveDraft(), leagueId: 'OTHER', draftId: 'X1' });

    const res = await handleHttp(deps, req('GET', '/leagues/L1/drafts', { token }));
    expect(res.status).toBe(200);
    const { drafts } = res.body as { drafts: Array<Record<string, unknown>> };

    expect(drafts).toHaveLength(3);
    expect(drafts.map((d) => d.createdAt)).toEqual([3_000, 2_000, 1_000]);
    expect(drafts[0]).toMatchObject({ status: 'SETUP', teams: 2, rounds: 2, picksMade: 0 });
    // A summary is a summary: no pick log, no team roster.
    expect(drafts[0]).not.toHaveProperty('picks');
    expect(drafts[0]).not.toHaveProperty('teams.0');
  });

  it('reports how far a draft got, so the hub can show progress', async () => {
    const { deps, persistence } = harness({ hash: HASH });
    const token = await adminToken(deps);
    persistence.seed(liveDraft()); // ON_CLOCK, no picks yet

    const before = await handleHttp(deps, req('GET', '/leagues/L1/drafts', { token }));
    expect((before.body as { drafts: Array<{ picksMade: number }> }).drafts[0]?.picksMade).toBe(0);

    const played = reduce(
      persistence.drafts.get('L1#D1') as DraftState,
      { type: 'SUBMIT_PICK', teamSlot: 1, playerId: 'p1', position: 'RB' },
      { now: 1 },
    ).state;
    persistence.seed(played);

    const after = await handleHttp(deps, req('GET', '/leagues/L1/drafts', { token }));
    expect((after.body as { drafts: Array<{ picksMade: number }> }).drafts[0]?.picksMade).toBe(1);
  });

  it('returns an empty list for a league that has never drafted', async () => {
    const { deps } = harness({ hash: HASH });
    const token = await adminToken(deps);
    const res = await handleHttp(deps, req('GET', '/leagues/NOPE/drafts', { token }));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ drafts: [] });
  });

  it('refuses to list drafts without an admin session', async () => {
    // A draft id IS the capability to view or pick in that draft — there is no
    // player auth by design. An open list would publish every id to anyone who
    // loads the site, turning unguessable links into public ones.
    const { deps, persistence } = harness({ hash: HASH });
    persistence.seed(liveDraft());

    const anon = await handleHttp(deps, req('GET', '/leagues/L1/drafts'));
    expect(anon.status).toBe(401);
    expect(anon.body).not.toHaveProperty('drafts');

    const bad = await handleHttp(deps, req('GET', '/leagues/L1/drafts', { token: 'nonsense' }));
    expect(bad.status).toBe(401);
  });

  it('404s an unknown route/draft', async () => {
    const { deps } = harness({ hash: HASH });
    expect((await handleHttp(deps, req('GET', '/leagues/L1/drafts/nope'))).status).toBe(404);
    expect((await handleHttp(deps, req('GET', '/nonsense'))).status).toBe(404);
  });
});

function minimalSettings() {
  return {
    teams: 2,
    rounds: 2,
    mode: 'linear',
    timerSec: 90,
    waitingSec: 8,
    rosterFormat: { starters: { QB: 1 }, flex: [], bench: 1, positionMax: { QB: 2 } },
  };
}
