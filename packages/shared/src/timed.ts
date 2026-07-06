/**
 * Client-nudge + server-gate timing for timed-state transitions (DESIGN AD-1,
 * AD-11). The server owns deadline timestamps; a timed state *advances* when its
 * deadline passes. The transition is **nudged** by any client whose
 * offset-corrected clock crosses the deadline and **gated** by the server on its
 * own clock. `honorDeadline` is the single source of truth for that instant —
 * used by the server gate, the scheduler-backstop arm time, and the client nudge
 * trigger, so all three agree by construction.
 */
import type { DraftState } from './domain.js';
import { revealAnimationMs } from './reveal.js';

/**
 * Grace buffer added to the ON_CLOCK pick deadline before an auto-pick is
 * honored. It protects a buzzer-beater (a human's last-instant `SUBMIT_PICK`
 * beats the auto-pick), absorbs cross-device clock-sync spread, and covers the
 * scheduler's whole-second `at()` truncation. Only ON_CLOCK gets grace; announce
 * / go-live / reveal advance exactly at their deadline (no grace).
 */
export const GRACE_MS = 1500;

/**
 * The instant a timed state is allowed to advance: its deadline, plus the
 * ON_CLOCK grace. `undefined` for non-timed states (nothing to nudge or arm).
 * Pure and platform-agnostic, so the server gate, the backstop arm, and the
 * client nudge all compute the same value.
 */
export function honorDeadline(state: DraftState): number | undefined {
  switch (state.status) {
    case 'REVEALING':
      return state.reveal
        ? state.reveal.revealAt + revealAnimationMs(state.settings.teams)
        : undefined;
    case 'STARTING':
      return state.liveAt;
    case 'PICK_IN':
      return state.announceUntil;
    case 'ON_CLOCK':
      return state.pickDeadline === undefined ? undefined : state.pickDeadline + GRACE_MS;
    default:
      return undefined;
  }
}
