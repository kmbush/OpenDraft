/**
 * The single thin WS client + HTTP helpers (DESIGN §7). Connects, sends `SYNC`
 * on open, dispatches inbound messages into the store, reconnects and re-`SYNC`s.
 * Contracts come from `@opendraft/shared` — no hand-written message shapes (§10).
 */
import type { OutboundMessage } from '@opendraft/shared';
import { useLiveStore } from './store/store.js';

/**
 * Endpoints come from build-time env (§4.6). Unset → the dev-proxy fallbacks, so
 * `pnpm dev` talks to the local harness unchanged; a deployed build points these
 * at the API Gateway + CloudFront origins.
 */
const HTTP_BASE = import.meta.env.VITE_HTTP_BASE ?? '/api';

/** The self-hosted league id (single-league today; multi-tenant-ready — §MEMORY). */
export const LEAGUE_ID = import.meta.env.VITE_LEAGUE_ID ?? 'dev-league';
const WS_URL =
  import.meta.env.VITE_WS_URL ??
  `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`;

let socket: WebSocket | null = null;
let currentDraftId: string | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

/** Envelope shape sent to the server (shared outbound shape + inbound-only token). */
export interface OutboundEnvelope {
  type: string;
  draftId: string;
  payload?: unknown;
  version?: number;
  token?: string;
}

export function sendEnvelope(envelope: OutboundEnvelope): void {
  if (socket?.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify(envelope));
  }
}

function requestSync(): void {
  if (currentDraftId) sendEnvelope({ type: 'SYNC', draftId: currentDraftId });
}

export function connect(draftId: string, role = 'station'): void {
  currentDraftId = draftId;
  if (
    socket &&
    (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)
  ) {
    requestSync();
    return;
  }
  socket = new WebSocket(`${WS_URL}?role=${role}`);
  const store = useLiveStore.getState();

  socket.onopen = () => {
    store.setConnected(true);
    requestSync();
  };
  socket.onclose = () => {
    store.setConnected(false);
    if (reconnectTimer) clearTimeout(reconnectTimer);
    reconnectTimer = setTimeout(() => connect(draftId, role), 1000);
  };
  socket.onmessage = (event) => {
    try {
      const parsed = JSON.parse(String(event.data)) as { type?: unknown };
      // Only dispatch real server messages. API Gateway control/error frames
      // (e.g. {"message":"Internal server error"}) carry no `type` — drop them so
      // they can't reach the store reducer at all. The reducer's default case is a
      // second guard for any that slip through.
      if (parsed && typeof parsed.type === 'string') {
        useLiveStore.getState().handleInbound(parsed as OutboundMessage);
      }
    } catch {
      // ignore malformed frames
    }
  };
}

/**
 * Tear down the WS cleanly so a finished draft's frames (and the auto-reconnect)
 * can't bleed into the next draft. Detach handlers first so `close()` doesn't
 * trip the reconnect timer; the next `connect()` opens a fresh socket.
 */
export function disconnect(): void {
  currentDraftId = null;
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  if (socket) {
    socket.onopen = null;
    socket.onclose = null;
    socket.onmessage = null;
    socket.close();
    socket = null;
  }
  useLiveStore.getState().setConnected(false);
}

// --- HTTP (setup/config over TanStack Query; §4.1) ---

async function http<T>(method: string, path: string, body?: unknown, token?: string): Promise<T> {
  const res = await fetch(`${HTTP_BASE}${path}`, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  const json: unknown = await res.json().catch(() => ({}));
  if (!res.ok) {
    const message = (json as { message?: string }).message ?? `HTTP ${res.status}`;
    throw new Error(message);
  }
  return json as T;
}

export const api = {
  get: <T>(path: string) => http<T>('GET', path),
  post: <T>(path: string, body?: unknown, token?: string) => http<T>('POST', path, body, token),
};
