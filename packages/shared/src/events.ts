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
import type { PlayerRef, Position } from './domain.js';

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

/** Admin: begin the draft (ORDER_SET → ON_CLOCK). */
export interface StartEvent {
  type: 'START';
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

export type DraftEvent =
  | SubmitPickEvent
  | TimerExpireEvent
  | StartEvent
  | PauseEvent
  | ResumeEvent
  | UndoEvent
  | EditPickEvent
  | SetOnClockEvent
  | EditOrderEvent
  | SetOrderEvent;

export type DraftEventType = DraftEvent['type'];
