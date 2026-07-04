import { randomBytes, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
/**
 * Local no-AWS harness. It reuses the `services/api` CORE verbatim
 * (`dispatchAction`, `sendSync`, `onConnect/onDisconnect`, `onTimerFire`,
 * `handleHttp`) behind in-memory adapters that implement the same ports the
 * Lambda handlers use — so `apps/web` talks to it unchanged. This doubly
 * validates the ports design (DESIGN §2, CONVENTIONS §4.3).
 *
 * Adapters: Persistence → in-memory map; Broadcaster → real `ws` sockets;
 * Scheduler → setTimeout (so timer-expiry auto-picks actually fire locally);
 * PoolLoader → the bundled snapshot on disk; Secrets → a dev passcode + random
 * HMAC key.
 */
import { type IncomingMessage, type ServerResponse, createServer } from 'node:http';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  dispatchAction,
  handleHttp,
  onConnect,
  onDisconnect,
  onTimerFire,
  sendSync,
} from '@opendraft/api';
import type {
  Broadcaster,
  ConnectionRole,
  Deps,
  Environment,
  PoolLoader,
  Scheduler,
  Secrets,
} from '@opendraft/api';
import { FakePersistence } from '@opendraft/api/fakes';
import type { PoolSnapshot } from '@opendraft/shared';
import bcrypt from 'bcryptjs';
import { WebSocket, WebSocketServer } from 'ws';

const DEV_PASSCODE = 'draft2026';
const LEAGUE_ID = 'dev-league';

/** No rate-limiting in local dev (the FakePersistence counter never resets). */
class HarnessPersistence extends FakePersistence {
  override async registerAuthAttempt(): Promise<number> {
    return 1;
  }
}

function loadBundledPool(): PoolSnapshot {
  const here = dirname(fileURLToPath(import.meta.url));
  const path = join(here, '..', '..', '..', 'services', 'pool', 'data', 'bundled-snapshot.json');
  return JSON.parse(readFileSync(path, 'utf8')) as PoolSnapshot;
}

export interface Harness {
  port: number;
  passcode: string;
  deps: Deps;
  close(): Promise<void>;
}

export async function createHarness(
  options: { port?: number; passcode?: string } = {},
): Promise<Harness> {
  const passcode = options.passcode ?? DEV_PASSCODE;
  const pool = loadBundledPool();
  const passcodeHash = bcrypt.hashSync(passcode, 8);
  const hmacKey = randomBytes(32).toString('hex');

  const persistence = new HarnessPersistence();
  const sockets = new Map<string, WebSocket>();

  const broadcaster: Broadcaster = {
    async post(connectionId, message) {
      const socket = sockets.get(connectionId);
      if (!socket || socket.readyState !== WebSocket.OPEN) return 'gone';
      socket.send(JSON.stringify(message));
      return 'ok';
    },
  };

  // Circular wiring: the scheduler fires back into `onTimerFire(deps, …)`, so
  // `deps` is referenced by a closure defined before it is assigned below.
  // biome-ignore lint/style/useConst: deferred assignment for the circular wiring
  let deps: Deps;
  const timers = new Map<string, ReturnType<typeof setTimeout>>();
  const scheduler: Scheduler = {
    async arm({ draftId, version, fireAt }) {
      const existing = timers.get(draftId);
      if (existing) clearTimeout(existing);
      const delay = Math.max(0, fireAt - Date.now());
      timers.set(
        draftId,
        setTimeout(() => {
          timers.delete(draftId);
          void onTimerFire(deps, { draftId, expectedVersion: version });
        }, delay),
      );
    },
    async cancel(draftId) {
      const existing = timers.get(draftId);
      if (existing) {
        clearTimeout(existing);
        timers.delete(draftId);
      }
    },
  };

  const poolLoader: PoolLoader = {
    async load() {
      return pool;
    },
  };
  const secrets: Secrets = {
    async getPasscodeHash() {
      return passcodeHash;
    },
    async getHmacKey() {
      return hmacKey;
    },
  };
  const env: Environment = {
    now: () => Date.now(),
    rng: () => Math.random(),
    newId: () => randomUUID(),
    leagueId: LEAGUE_ID,
    sessionTtlSec: 8 * 60 * 60,
    authMaxAttempts: 100,
    authWindowSec: 900,
  };

  deps = { persistence, broadcaster, scheduler, pool: poolLoader, secrets, env };

  const server = createServer((req, res) => void handleRequest(deps, pool, req, res));
  const wss = new WebSocketServer({ server, path: '/ws' });
  wss.on('connection', (socket, req) => {
    const id = randomUUID();
    sockets.set(id, socket);
    const role = (new URL(req.url ?? '/', 'http://localhost').searchParams.get('role') ??
      'station') as ConnectionRole;
    void onConnect(deps, id, role);

    // Serialize a connection's messages so dependent admin actions (e.g.
    // SET_ORDER then START) can't race each other's commits.
    let queue: Promise<void> = Promise.resolve();
    socket.on('message', (data) => {
      queue = queue.then(() => handleWsMessage(deps, id, data.toString()));
    });
    socket.on('close', () => {
      sockets.delete(id);
      void onDisconnect(deps, id);
    });
  });

  const requestedPort = options.port ?? 8787;
  await new Promise<void>((resolve) => server.listen(requestedPort, resolve));
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : requestedPort;

  return {
    port,
    passcode,
    deps,
    close: () =>
      new Promise<void>((resolve) => {
        for (const t of timers.values()) clearTimeout(t);
        wss.close();
        server.close(() => resolve());
      }),
  };
}

async function handleWsMessage(deps: Deps, connectionId: string, raw: string): Promise<void> {
  let envelope: { type: string; draftId: string };
  try {
    envelope = JSON.parse(raw) as { type: string; draftId: string };
  } catch {
    return;
  }
  if (envelope.type === 'SYNC') {
    await sendSync(deps, connectionId, envelope.draftId);
  } else {
    await dispatchAction(deps, connectionId, envelope as never);
  }
}

async function handleRequest(
  deps: Deps,
  pool: PoolSnapshot,
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  res.setHeader('access-control-allow-origin', '*');
  res.setHeader('access-control-allow-headers', 'content-type, authorization');
  res.setHeader('access-control-allow-methods', 'GET, POST, PUT, OPTIONS');
  if (req.method === 'OPTIONS') {
    res.writeHead(204).end();
    return;
  }

  const url = new URL(req.url ?? '/', 'http://localhost');
  const path = url.pathname;

  // The bundled pool is served for any snapshot id in local dev.
  if (path.startsWith('/pool/')) {
    res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(pool));
    return;
  }

  if (path.startsWith('/api')) {
    const body = await readBody(req);
    const result = await handleHttp(deps, {
      method: req.method ?? 'GET',
      path: path.slice('/api'.length) || '/',
      headers: req.headers as Record<string, string | undefined>,
      ...(body ? { body } : {}),
    });
    res
      .writeHead(result.status, { 'content-type': 'application/json' })
      .end(JSON.stringify(result.body));
    return;
  }

  res
    .writeHead(404, { 'content-type': 'application/json' })
    .end(JSON.stringify({ code: 'NOT_FOUND' }));
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve) => {
    let data = '';
    req.on('data', (chunk) => {
      data += chunk;
    });
    req.on('end', () => resolve(data));
  });
}
