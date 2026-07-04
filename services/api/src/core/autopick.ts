/**
 * Auto-pick fire handler (DESIGN AD-1, AD-11) — the target of the one-shot
 * EventBridge schedule. On fire: load state; if still on the clock at the
 * expected version, load the pool, compute the available set (pool − taken),
 * dispatch `TIMER_EXPIRE` through the same pure `reduce`, commit, fan out.
 *
 * A manual pick that already advanced `version` makes this a no-op — the stale
 * fire's `expectedVersion` no longer matches (idempotent; no double pick).
 */
import { reduce } from '@opendraft/engine';
import type { PlayerRef } from '@opendraft/shared';
import type { Deps } from '../ports.js';
import { fanOut, reconcileScheduler } from './broadcast.js';

export interface TimerFire {
  draftId: string;
  expectedVersion: number;
}

export async function onTimerFire(deps: Deps, fire: TimerFire): Promise<void> {
  const state = await deps.persistence.loadDraft(deps.env.leagueId, fire.draftId);
  if (!state) return;

  // Stale schedule (a manual pick advanced the draft) or not on a live clock.
  if (state.version !== fire.expectedVersion) return;
  if (state.status !== 'ON_CLOCK' && state.status !== 'PICK_IN') return;
  if (!state.poolSnapshotId) return;

  const snapshot = await deps.pool.load(state.poolSnapshotId);
  const taken = new Set(state.picks.map((pick) => pick.playerId));
  const available: PlayerRef[] = snapshot.players
    .filter((player) => !taken.has(player.id))
    .map((player) => ({ id: player.id, position: player.position }));

  const { state: next, outbox } = reduce(
    state,
    { type: 'TIMER_EXPIRE', available, expectedVersion: fire.expectedVersion },
    { now: deps.env.now(), rng: deps.env.rng },
  );

  const first = outbox[0];
  if (first && first.type === 'REJECT') return; // e.g. nothing available — leave the clock

  const commit = await deps.persistence.commit(deps.env.leagueId, state, next);
  if (!commit.ok) return; // lost the race to a concurrent manual pick

  await Promise.all(outbox.map((m) => fanOut(deps, m)));
  await reconcileScheduler(deps, next);
}
