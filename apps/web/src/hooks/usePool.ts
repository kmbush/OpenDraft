/**
 * Loads the pool snapshot once (memory → IndexedDB → network), rank-free from
 * the server (AD-6). Kept outside Zustand/Query per §4.1 — it is large, static,
 * and filtered/sorted client-side.
 */
import type { Player, PoolSnapshot } from '@opendraft/shared';
import { useEffect, useState } from 'react';
import { idbGet, idbPut } from '../lib/idb.js';

const memory = new Map<string, PoolSnapshot>();

/**
 * Pool base URL (§4.6). Unset → the dev proxy at `/pool`; a deployed build sets
 * this to CloudFront `/pools` (note the prefix — infra serves the plural path).
 */
const POOL_BASE = import.meta.env.VITE_POOL_BASE ?? '/pool';

async function loadPool(snapshotId: string): Promise<PoolSnapshot> {
  const cached = memory.get(snapshotId);
  if (cached) return cached;

  const stored = await idbGet<PoolSnapshot>(snapshotId);
  if (stored) {
    memory.set(snapshotId, stored);
    return stored;
  }

  const res = await fetch(`${POOL_BASE}/${snapshotId}.json`);
  // Guard against a 200 SPA-fallback (`index.html`): fail loudly rather than
  // choke inside `res.json()` on HTML.
  if (!res.ok || !res.headers.get('content-type')?.includes('json')) {
    throw new Error(`pool ${snapshotId} unavailable (HTTP ${res.status})`);
  }
  const snapshot = (await res.json()) as PoolSnapshot;
  memory.set(snapshotId, snapshot);
  void idbPut(snapshotId, snapshot);
  return snapshot;
}

/** Load lifecycle for the pool, so views can show real states (§4.5). */
export type PoolStatus = 'none' | 'loading' | 'ready' | 'error';

export interface PoolState {
  players: Player[];
  status: PoolStatus;
}

/**
 * Loads the pool for a snapshot and reports its lifecycle: `none` (no snapshot
 * configured), `loading`, `ready`, or `error`. Views render the matching state
 * instead of a silent blank screen.
 */
export function usePool(snapshotId: string | undefined): PoolState {
  const [state, setState] = useState<PoolState>({ players: [], status: 'none' });
  useEffect(() => {
    if (!snapshotId) {
      setState({ players: [], status: 'none' });
      return;
    }
    let active = true;
    setState({ players: [], status: 'loading' });
    loadPool(snapshotId)
      .then((snapshot) => {
        if (active) setState({ players: snapshot.players, status: 'ready' });
      })
      .catch(() => {
        if (active) setState({ players: [], status: 'error' });
      });
    return () => {
      active = false;
    };
  }, [snapshotId]);
  return state;
}

/** Load a pool and report how many players it holds (for setup confirmation). */
export async function fetchPoolCount(snapshotId: string): Promise<number> {
  const snapshot = await loadPool(snapshotId);
  return snapshot.players.length;
}

/** Player lookup by id, for rendering rosters from the pick log. */
export function indexPlayers(players: Player[]): Map<string, Player> {
  return new Map(players.map((p) => [p.id, p]));
}

/** `"First Last"` for a player id, or the raw id if the pool doesn't know it. */
export function playerName(byId: Map<string, Player>, id: string): string {
  const p = byId.get(id);
  return p ? `${p.firstName} ${p.lastName}` : id;
}
