/**
 * Inbound draft events consumed by the engine `reduce`.
 *
 * Over the wire these travel inside the WS envelope `{ type, draftId, payload, version? }`
 * (see `messages.ts`); the handler maps the envelope onto these flat, engine-facing
 * events. `type` values are UPPER_SNAKE string literals (CONVENTIONS §3).
 *
 * Time and randomness never appear here — they enter `reduce` via `ctx`. The one
 * data dependency the pure engine cannot compute itself, the set of currently
 * available players for an auto-pick, is carried on `TIMER_EXPIRE` (AD-11).
 */
import type { PlayerRef, Position, RevealGame } from './domain.js';

/** A player pick submitted from a station for the on-clock team. */
export interface SubmitPickEvent {
  type: 'SUBMIT_PICK';
  teamSlot: number;
  playerId: string;
  /** Carried so the engine maintains per-team roster-by-position counts. */
  position: Position;
  /** Optimistic-concurrency guard; rejected as stale if it mismatches state. */
  expectedVersion?: number;
}

/**
 * The pick clock hit zero — auto-pick a random legal player (AD-11).
 * `available` is the current pool minus taken players (id + position only),
 * supplied by the caller because the pure engine performs no I/O.
 */
export interface TimerExpireEvent {
  type: 'TIMER_EXPIRE';
  available: PlayerRef[];
  expectedVersion?: number;
}

/**
 * Admin: run "The Reveal" — roll a fair draft order and play the reveal show.
 * Valid from SETUP/ORDER_SET. The engine commits the rolled order immediately
 * and parks in REVEALING; the board unveils it while the admin stays blind.
 */
export interface StartRevealEvent {
  type: 'START_REVEAL';
  game: RevealGame;
}

/**
 * End the reveal show (REVEALING → ORDER_SET, order preserved). Fired by the
 * scheduler when the animation finishes, and by an admin "Skip to result".
 */
export interface RevealDoneEvent {
  type: 'REVEAL_DONE';
}

/**
 * End the "the pick is in" announcement lockout (PICK_IN → ON_CLOCK, next team on
 * the clock with a fresh pick clock). Fired by the scheduler at `announceUntil`
 * and by an admin "Skip announcement". No team can draft until it lands.
 */
export interface AnnounceDoneEvent {
  type: 'ANNOUNCE_DONE';
}

/** Admin: begin the draft (ORDER_SET → STARTING, or straight to ON_CLOCK if no countdown). */
export interface StartEvent {
  type: 'START';
}

/**
 * End the pre-draft countdown (STARTING → ON_CLOCK, first team on the clock).
 * Fired by the scheduler at `liveAt` and by an admin "Go now".
 */
export interface GoLiveEvent {
  type: 'GO_LIVE';
}

/** Admin: freeze the clock, storing remaining ms. */
export interface PauseEvent {
  type: 'PAUSE';
}

/** Admin: resume, recomputing the deadline from stored remaining ms. */
export interface ResumeEvent {
  type: 'RESUME';
}

/** Admin: pop the last pick and rewind the pointer/version (repeatable). */
export interface UndoEvent {
  type: 'UNDO';
}

/** Admin: replace the player on a past pick without disturbing draft order. */
export interface EditPickEvent {
  type: 'EDIT_PICK';
  overall: number;
  playerId: string;
  position: Position;
}

/** Admin: move the on-clock pointer to a given overall pick. */
export interface SetOnClockEvent {
  type: 'SET_ON_CLOCK';
  overall: number;
}

/** Admin: adjust the draft order before START (post-randomizer tweak). */
export interface EditOrderEvent {
  type: 'EDIT_ORDER';
  order: number[];
}

/** Admin: set the draft order (manual entry or randomizer result). */
export interface SetOrderEvent {
  type: 'SET_ORDER';
  order: number[];
}

/**
 * Admin: move a drafted player to a different team. Only the stored `teamSlot`
 * changes; draft order and pointer are untouched (rosters derive from picks).
 */
export interface ReassignPickEvent {
  type: 'REASSIGN_PICK';
  overall: number;
  teamSlot: number;
}

/**
 * Admin: undraft a specific player. Removes that pick from the log without
 * renumbering the others — the team is left one pick lighter (the correction).
 */
export interface RemovePickEvent {
  type: 'REMOVE_PICK';
  overall: number;
}

/**
 * Admin: rewind the draft to overall pick `N` — drop every pick at `overall >= N`
 * and put team N back on the clock. The multi-step "undo back to pick N".
 */
export interface RewindToEvent {
  type: 'REWIND_TO';
  overall: number;
}

export type DraftEvent =
  | SubmitPickEvent
  | TimerExpireEvent
  | StartRevealEvent
  | RevealDoneEvent
  | AnnounceDoneEvent
  | StartEvent
  | GoLiveEvent
  | PauseEvent
  | ResumeEvent
  | UndoEvent
  | EditPickEvent
  | SetOnClockEvent
  | EditOrderEvent
  | SetOrderEvent
  | ReassignPickEvent
  | RemovePickEvent
  | RewindToEvent;

export type DraftEventType = DraftEvent['type'];
