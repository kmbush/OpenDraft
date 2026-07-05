/**
 * One-shot timer fire handler (DESIGN AD-1, AD-11) — the target of the schedule
 * armed by `reconcileScheduler`. It does the right thing per state:
 *   - REVEALING (at reveal end)     → dispatch `REVEAL_DONE` (order is set)
 *   - STARTING (at `liveAt`)        → dispatch `GO_LIVE` (first team on the clock)
 *   - ON_CLOCK / PICK_IN (deadline) → dispatch `TIMER_EXPIRE` (auto-pick, AD-11)
 * Then commit, fan out, and re-arm. A manual pick / "Go now" that already
 * advanced `version` makes the fire a no-op (its `expectedVersion` no longer
 * matches — idempotent; no double action).
 */
import { reduce } from '@opendraft/engine';
import type { DraftEvent, PlayerRef } from '@opendraft/shared';
import type { Deps } from '../ports.js';
import { fanOut, reconcileScheduler } from './broadcast.js';

export interface TimerFire {
  draftId: string;
  expectedVersion: number;
}

export async function onTimerFire(deps: Deps, fire: TimerFire): Promise<void> {
  const state = await deps.persistence.loadDraft(deps.env.leagueId, fire.draftId);
  if (!state) return;

  // Stale schedule: a manual pick / "Go now" already advanced the draft.
  if (state.version !== fire.expectedVersion) return;

  let event: DraftEvent;
  if (state.status === 'REVEALING') {
    event = { type: 'REVEAL_DONE' };
  } else if (state.status === 'STARTING') {
    event = { type: 'GO_LIVE' };
  } else if (state.status === 'ON_CLOCK' || state.status === 'PICK_IN') {
    if (!state.poolSnapshotId) return;
    const snapshot = await deps.pool.load(state.poolSnapshotId);
    const taken = new Set(state.picks.map((pick) => pick.playerId));
    const available: PlayerRef[] = snapshot.players
      .filter((player) => !taken.has(player.id))
      .map((player) => ({ id: player.id, position: player.position }));
    event = { type: 'TIMER_EXPIRE', available, expectedVersion: fire.expectedVersion };
  } else {
    return; // not a timed state — nothing to fire
  }

  const { state: next, outbox } = reduce(state, event, { now: deps.env.now(), rng: deps.env.rng });

  const first = outbox[0];
  if (first && first.type === 'REJECT') return; // e.g. nothing available — leave the clock

  const commit = await deps.persistence.commit(deps.env.leagueId, state, next);
  if (!commit.ok) return; // lost the race to a concurrent manual pick

  await Promise.all(outbox.map((m) => fanOut(deps, m)));
  await reconcileScheduler(deps, next);
}
