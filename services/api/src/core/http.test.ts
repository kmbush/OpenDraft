import bcrypt from 'bcryptjs';
import { describe, expect, it } from 'vitest';
import { harness } from '../test-helpers.js';
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
            { name: 'Gridiron Gang', color: '#3b82f6', ownerLabel: 'Kyle' },
            { color: 'nope' },
          ],
        },
      }),
    );
    expect(created.status).toBe(201);
    expect((created.body as { teams: unknown }).teams).toEqual([
      { slot: 1, name: 'Gridiron Gang', color: '#3b82f6', ownerLabel: 'Kyle' },
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
