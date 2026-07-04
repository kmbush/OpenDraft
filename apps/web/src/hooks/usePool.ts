/**
 * Loads the pool snapshot once (memory → IndexedDB → network), rank-free from
 * the server (AD-6). Kept outside Zustand/Query per §4.1 — it is large, static,
 * and filtered/sorted client-side.
 */
import type { Player, PoolSnapshot } from '@opendraft/shared';
import { useEffect, useState } from 'react';
import { idbGet, idbPut } from '../lib/idb.js';

const memory = new Map<string, PoolSnapshot>();

async function loadPool(snapshotId: string): Promise<PoolSnapshot> {
  const cached = memory.get(snapshotId);
  if (cached) return cached;

  const stored = await idbGet<PoolSnapshot>(snapshotId);
  if (stored) {
    memory.set(snapshotId, stored);
    return stored;
  }

  const res = await fetch(`/pool/${snapshotId}.json`);
  const snapshot = (await res.json()) as PoolSnapshot;
  memory.set(snapshotId, snapshot);
  void idbPut(snapshotId, snapshot);
  return snapshot;
}

/** Returns the pool players for a snapshot (empty until loaded). */
export function usePool(snapshotId: string | undefined): Player[] {
  const [players, setPlayers] = useState<Player[]>([]);
  useEffect(() => {
    if (!snapshotId) {
      setPlayers([]);
      return;
    }
    let active = true;
    loadPool(snapshotId)
      .then((snapshot) => {
        if (active) setPlayers(snapshot.players);
      })
      .catch(() => {
        if (active) setPlayers([]);
      });
    return () => {
      active = false;
    };
  }, [snapshotId]);
  return players;
}

/** Player lookup by id, for rendering rosters from the pick log. */
export function indexPlayers(players: Player[]): Map<string, Player> {
  return new Map(players.map((p) => [p.id, p]));
}
