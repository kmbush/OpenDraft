/**
 * HTTP (REST) setup/config handlers (CONVENTIONS §4.4). Thin adapters over the
 * ports: create/get league, create/get draft, set order, and the pool pointer.
 * Mutations require an admin session (AD-8); reads are open (in-person players).
 * Order editing routes through the engine — no ordering logic here (§10).
 */
import { reduce } from '@opendraft/engine';
import { newDraft } from '@opendraft/engine';
import type { DraftSettings, DraftState, LeagueMeta, Team, Theme } from '@opendraft/shared';
import type { Deps } from '../ports.js';
import { verifySession } from './auth.js';

export interface HttpRequest {
  method: string;
  /** Path without query string, e.g. `/leagues/L1/drafts/D2/order`. */
  path: string;
  headers: Record<string, string | undefined>;
  body?: string;
}

export interface HttpResponse {
  status: number;
  body: unknown;
}

const json = (status: number, body: unknown): HttpResponse => ({ status, body });
const err = (status: number, code: string, message: string): HttpResponse =>
  json(status, { ok: false, code, message });

function parseBody(req: HttpRequest): Record<string, unknown> | null {
  if (!req.body) return {};
  try {
    const v: unknown = JSON.parse(req.body);
    return typeof v === 'object' && v !== null ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function bearer(req: HttpRequest): string | undefined {
  const h = req.headers.authorization ?? req.headers.Authorization;
  if (!h) return undefined;
  return h.startsWith('Bearer ') ? h.slice(7) : h;
}

async function requireAdmin(deps: Deps, req: HttpRequest): Promise<boolean> {
  const res = await verifySession(deps.secrets, bearer(req), deps.env.leagueId, deps.env.now());
  return res.ok;
}

/**
 * Route an HTTP request. Returns a typed JSON response; never throws raw AWS
 * errors (CONVENTIONS §4.5).
 */
export async function handleHttp(deps: Deps, req: HttpRequest): Promise<HttpResponse> {
  const segments = req.path.split('/').filter(Boolean);

  // POST /admin/session  { passcode }
  if (req.method === 'POST' && segments[0] === 'admin' && segments[1] === 'session') {
    return adminSession(deps, req);
  }

  // /leagues ...
  if (segments[0] === 'leagues') {
    // POST /leagues
    if (segments.length === 1 && req.method === 'POST') return createLeague(deps, req);
    const leagueId = segments[1];
    if (!leagueId) return err(404, 'NOT_FOUND', 'Unknown route');

    // GET /leagues/{id}
    if (segments.length === 2 && req.method === 'GET') {
      const meta = await deps.persistence.getLeague(leagueId);
      return meta ? json(200, meta) : err(404, 'NOT_FOUND', 'No such league');
    }

    if (segments[2] === 'drafts') {
      // POST /leagues/{id}/drafts
      if (segments.length === 3 && req.method === 'POST') return createDraft(deps, req, leagueId);
      const draftId = segments[3];
      if (!draftId) return err(404, 'NOT_FOUND', 'Unknown route');

      // GET /leagues/{id}/drafts/{draftId}
      if (segments.length === 4 && req.method === 'GET') {
        const state = await deps.persistence.loadDraft(leagueId, draftId);
        return state ? json(200, state) : err(404, 'NOT_FOUND', 'No such draft');
      }
      // PUT /leagues/{id}/drafts/{draftId}/order
      if (segments.length === 5 && segments[4] === 'order' && req.method === 'PUT') {
        return setOrder(deps, req, leagueId, draftId);
      }
      // GET /leagues/{id}/drafts/{draftId}/pool
      if (segments.length === 5 && segments[4] === 'pool' && req.method === 'GET') {
        return poolPointer(deps, leagueId, draftId);
      }
    }
  }

  return err(404, 'NOT_FOUND', 'Unknown route');
}

async function adminSession(deps: Deps, req: HttpRequest): Promise<HttpResponse> {
  const body = parseBody(req);
  if (!body || typeof body.passcode !== 'string')
    return err(400, 'BAD_REQUEST', 'passcode required');

  const attempts = await deps.persistence.registerAuthAttempt(
    deps.env.leagueId,
    deps.env.now(),
    deps.env.authWindowSec,
  );
  if (attempts > deps.env.authMaxAttempts) {
    return err(429, 'RATE_LIMITED', 'Too many attempts, try again later');
  }

  const { verifyPasscode, issueSession } = await import('./auth.js');
  if (!(await verifyPasscode(deps.secrets, body.passcode))) {
    return err(401, 'UNAUTHORIZED', 'Invalid passcode');
  }
  const session = await issueSession(
    deps.secrets,
    deps.env.leagueId,
    deps.env.now(),
    deps.env.sessionTtlSec,
  );
  return json(200, session);
}

async function createLeague(deps: Deps, req: HttpRequest): Promise<HttpResponse> {
  if (!(await requireAdmin(deps, req))) return err(401, 'UNAUTHORIZED', 'Admin session required');
  const body = parseBody(req);
  if (!body || typeof body.name !== 'string') return err(400, 'BAD_REQUEST', 'name required');
  const meta: LeagueMeta = {
    leagueId: deps.env.leagueId,
    name: body.name,
    createdAt: deps.env.now(),
    ...(isTheme(body.theme) ? { theme: body.theme } : {}),
  };
  await deps.persistence.createLeague(meta);
  return json(201, meta);
}

async function createDraft(deps: Deps, req: HttpRequest, leagueId: string): Promise<HttpResponse> {
  if (!(await requireAdmin(deps, req))) return err(401, 'UNAUTHORIZED', 'Admin session required');
  const body = parseBody(req);
  if (!body) return err(400, 'BAD_REQUEST', 'invalid body');
  const raw = body.settings as DraftSettings | undefined;
  if (!isSettings(raw)) return err(400, 'BAD_REQUEST', 'valid settings required');
  // Default the pre-draft countdown when a client omits it (30s; 0 = skip).
  const settings: DraftSettings = {
    ...raw,
    goLiveCountdownSec:
      typeof raw.goLiveCountdownSec === 'number' && raw.goLiveCountdownSec >= 0
        ? Math.floor(raw.goLiveCountdownSec)
        : 30,
  };
  const teams = buildTeams(body.teams, settings.teams);
  if (!teams) return err(400, 'BAD_REQUEST', 'teams must match settings.teams');

  const state = newDraft({ leagueId, draftId: deps.env.newId(), settings, teams });
  const withPool: DraftState =
    typeof body.poolSnapshotId === 'string'
      ? { ...state, poolSnapshotId: body.poolSnapshotId }
      : state;
  await deps.persistence.createDraft(withPool);
  return json(201, withPool);
}

async function setOrder(
  deps: Deps,
  req: HttpRequest,
  leagueId: string,
  draftId: string,
): Promise<HttpResponse> {
  if (!(await requireAdmin(deps, req))) return err(401, 'UNAUTHORIZED', 'Admin session required');
  const body = parseBody(req);
  const order = body?.order;
  if (!Array.isArray(order) || !order.every((n) => typeof n === 'number')) {
    return err(400, 'BAD_REQUEST', 'order:number[] required');
  }
  const prev = await deps.persistence.loadDraft(leagueId, draftId);
  if (!prev) return err(404, 'NOT_FOUND', 'No such draft');

  const { state: next, outbox } = reduce(
    prev,
    { type: 'SET_ORDER', order: order as number[] },
    { now: deps.env.now(), rng: deps.env.rng },
  );
  const first = outbox[0];
  if (first && first.type === 'REJECT') return err(409, first.payload.code, first.payload.message);

  const commit = await deps.persistence.commit(leagueId, prev, next);
  if (!commit.ok) {
    return json(409, { ok: false, code: 'STALE_VERSION', currentVersion: commit.currentVersion });
  }
  return json(200, next);
}

async function poolPointer(deps: Deps, leagueId: string, draftId: string): Promise<HttpResponse> {
  const state = await deps.persistence.loadDraft(leagueId, draftId);
  if (!state) return err(404, 'NOT_FOUND', 'No such draft');
  return json(200, { poolSnapshotId: state.poolSnapshotId ?? null });
}

// --- narrowing helpers (transport validation only, not draft logic) ---

function isTheme(v: unknown): v is Theme {
  if (typeof v !== 'object' || v === null) return false;
  const t = v as Record<string, unknown>;
  if (t.colors !== undefined && (typeof t.colors !== 'object' || t.colors === null)) return false;
  if (t.logo !== undefined && typeof t.logo !== 'string') return false;
  return true;
}

function isSettings(v: unknown): v is DraftSettings {
  if (typeof v !== 'object' || v === null) return false;
  const s = v as Record<string, unknown>;
  return (
    typeof s.teams === 'number' &&
    typeof s.rounds === 'number' &&
    (s.mode === 'snake' || s.mode === 'linear') &&
    typeof s.timerSec === 'number' &&
    typeof s.waitingSec === 'number' &&
    typeof s.rosterFormat === 'object' &&
    s.rosterFormat !== null
  );
}

/** Neutral team color used when a slot arrives without a valid `#rrggbb` override. */
const DEFAULT_TEAM_COLOR = '#64748b';
const isHexColor = (v: unknown): v is string =>
  typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v);

function buildTeams(raw: unknown, count: number): Team[] | null {
  if (raw === undefined) {
    return Array.from({ length: count }, (_, i) => ({
      slot: i + 1,
      name: `Team ${i + 1}`,
      color: DEFAULT_TEAM_COLOR,
    }));
  }
  if (!Array.isArray(raw) || raw.length !== count) return null;
  const teams: Team[] = [];
  for (let i = 0; i < raw.length; i++) {
    const t = raw[i] as Record<string, unknown>;
    const name = typeof t?.name === 'string' && t.name.trim() ? t.name : `Team ${i + 1}`;
    teams.push({
      slot: i + 1,
      name,
      color: isHexColor(t?.color) ? t.color : DEFAULT_TEAM_COLOR,
      ...(typeof t?.ownerLabel === 'string' && t.ownerLabel.trim()
        ? { ownerLabel: t.ownerLabel }
        : {}),
    });
  }
  return teams;
}
