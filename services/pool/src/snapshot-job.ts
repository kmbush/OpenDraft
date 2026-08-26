/**
 * The impure edge shared by the snapshot CLIs (`build-snapshot`, `publish-snapshot`).
 *
 * Clock, network and the keep-count defaults live here so the two entry points
 * cannot drift apart — the pure builder in `build.ts` stays clock-free and
 * offline-testable (DESIGN AD-5, CONVENTIONS §6).
 */
import type { PoolSnapshot } from '@opendraft/shared';
import { buildSnapshot } from './build.js';
import { DEFAULT_KEEP_PER_POSITION } from './config.js';
import { fetchSleeperPlayers } from './sleeper.js';

/** Local build date as a YYYY-MM-DD snapshot id. The clock lives here, not in the builder. */
export function todayId(): string {
  return new Date().toISOString().slice(0, 10);
}

export interface BuiltSnapshot {
  snapshot: PoolSnapshot;
  /** How many players Sleeper returned before filtering — logged as a sanity check. */
  rawCount: number;
}

/** Fetch the live Sleeper pool and build a ranking-stripped snapshot under `snapshotId`. */
export async function fetchAndBuildSnapshot(snapshotId: string): Promise<BuiltSnapshot> {
  const raw = await fetchSleeperPlayers();
  const snapshot = buildSnapshot(raw, { snapshotId, keepPerPosition: DEFAULT_KEEP_PER_POSITION });
  return { snapshot, rawCount: Object.keys(raw).length };
}

/** Player counts per position group — printed by both CLIs so a bad build is obvious. */
export function countByPosition(snapshot: PoolSnapshot): Record<string, number> {
  return snapshot.players.reduce<Record<string, number>>((acc, p) => {
    acc[p.position] = (acc[p.position] ?? 0) + 1;
    return acc;
  }, {});
}
