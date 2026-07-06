/**
 * Timed-state advancement (DESIGN AD-1, AD-11). A single helper drives every
 * timed transition, called two ways:
 *   - **nudge** (primary): a client's offset-corrected clock crossed the deadline
 *     and sent `TIMER_NUDGE`. The server gates on its OWN clock (`now >=
 *     honorDeadline`) — authority stays server-side — else rejects `TOO_EARLY`.
 *   - **backstop** (`onTimerFire`): the one-shot EventBridge schedule fired. It
 *     is keyed by `expectedVersion`; a stale schedule (a manual pick / "Go now"
 *     already advanced the draft) is a no-op. No clock gate — the scheduler is
 *     armed at `honorDeadline`, so the grace is already baked into its fire time.
 *
 * Per current status the transition is: REVEALING→REVEAL_DONE, STARTING→GO_LIVE,
 * PICK_IN→ANNOUNCE_DONE, ON_CLOCK→TIMER_EXPIRE (auto-pick). For ON_CLOCK the
 * server — never the client — loads the pool and computes `available`. Both paths
 * end in the same version-guarded commit + fan-out + backstop re-arm, so
 * concurrent nudges collapse to one commit (losers see a moved version).
 */
import { reduce } from '@opendraft/engine';
import { type DraftEvent, type DraftState, type PlayerRef, honorDeadline } from '@opendraft/shared';
import type { Deps } from '../ports.js';
import { fanOut, reconcileScheduler } from './broadcast.js';

export interface TimerFire {
  draftId: string;
  expectedVersion: number;
}

/** Outcome of an advance attempt; the nudge dispatch maps it to a sender REJECT. */
export type AdvanceResult =
  | { ok: true }
  /** Not currently in a timed state, or the engine declined — silently ignored. */
  | { ok: false; reason: 'not_timed'; currentVersion: number }
  /** Backstop only: the armed version no longer matches (stale schedule). */
  | { ok: false; reason: 'stale_schedule'; currentVersion: number }
  /** Nudge only: the server's clock has not yet reached the deadline. */
  | { ok: false; reason: 'too_early'; currentVersion: number }
  /** The version-guarded commit lost a race (another nudge/pick committed first). */
  | { ok: false; reason: 'stale_version'; currentVersion: number };

/** Build the transition event for the current timed status (ON_CLOCK loads the pool). */
async function buildTimedEvent(
  deps: Deps,
  state: DraftState,
  expectedVersion?: number,
): Promise<DraftEvent | null> {
  switch (state.status) {
    case 'REVEALING':
      return { type: 'REVEAL_DONE' };
    case 'STARTING':
      return { type: 'GO_LIVE' };
    case 'PICK_IN':
      return { type: 'ANNOUNCE_DONE' };
    case 'ON_CLOCK': {
      if (!state.poolSnapshotId) return null;
      const snapshot = await deps.pool.load(state.poolSnapshotId);
      const taken = new Set(state.picks.map((pick) => pick.playerId));
      const available: PlayerRef[] = snapshot.players
        .filter((player) => !taken.has(player.id))
        .map((player) => ({ id: player.id, position: player.position }));
      return {
        type: 'TIMER_EXPIRE',
        available,
        ...(expectedVersion !== undefined ? { expectedVersion } : {}),
      };
    }
    default:
      return null;
  }
}

/**
 * Advance the draft's current timed state. Shared by the nudge dispatch (primary)
 * and `onTimerFire` (backstop) — the one place that maps status→event, gates,
 * reduces, commits under the version guard, fans out, and re-arms the backstop.
 */
export async function advanceTimedState(
  deps: Deps,
  draftId: string,
  opts: { source: 'nudge' | 'backstop'; expectedVersion?: number },
): Promise<AdvanceResult> {
  const state = await deps.persistence.loadDraft(deps.env.leagueId, draftId);
  if (!state) return { ok: false, reason: 'not_timed', currentVersion: 0 };

  // Backstop: a manual pick / "Go now" already advanced the draft past this fire.
  if (opts.source === 'backstop' && state.version !== opts.expectedVersion) {
    return { ok: false, reason: 'stale_schedule', currentVersion: state.version };
  }

  const deadline = honorDeadline(state);
  if (deadline === undefined)
    return { ok: false, reason: 'not_timed', currentVersion: state.version };

  // Nudge: the server gates on its OWN clock — the client's countdown is only a
  // "the clock expired" signal, never the authority (AD-1). ON_CLOCK's grace is
  // already folded into `honorDeadline`, so a buzzer-beater SUBMIT_PICK wins.
  if (opts.source === 'nudge' && deps.env.now() < deadline) {
    return { ok: false, reason: 'too_early', currentVersion: state.version };
  }

  const event = await buildTimedEvent(deps, state, opts.expectedVersion);
  if (!event) return { ok: false, reason: 'not_timed', currentVersion: state.version };

  const { state: next, outbox } = reduce(state, event, { now: deps.env.now(), rng: deps.env.rng });
  const first = outbox[0];
  if (first && first.type === 'REJECT') {
    return { ok: false, reason: 'not_timed', currentVersion: state.version };
  }

  const commit = await deps.persistence.commit(deps.env.leagueId, state, next);
  if (!commit.ok)
    return { ok: false, reason: 'stale_version', currentVersion: commit.currentVersion };

  await Promise.all(outbox.map((m) => fanOut(deps, m)));
  await reconcileScheduler(deps, next);
  return { ok: true };
}

/**
 * Backstop entry: the target of the one-shot EventBridge schedule (AD-1, AD-11).
 * Fire-and-forget — a stale/lost outcome is a no-op by design.
 */
export async function onTimerFire(deps: Deps, fire: TimerFire): Promise<void> {
  await advanceTimedState(deps, fire.draftId, {
    source: 'backstop',
    expectedVersion: fire.expectedVersion,
  });
}
