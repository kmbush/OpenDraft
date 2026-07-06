/**
 * Outbound message contracts (the engine's `outbox`) and the shared WS envelope.
 *
 * All wire messages use the envelope `{ type, draftId, payload, version? }`
 * (CONVENTIONS §4.4). `type` values are UPPER_SNAKE literals. These are imported
 * by both the Lambda authority and the browser client — never hand-duplicated.
 */
import type { DraftState, Pick } from './domain.js';

/** Generic WS envelope. */
export interface Envelope<TType extends string, TPayload> {
  type: TType;
  draftId: string;
  payload: TPayload;
  /** State version at emit time; used for optimistic concurrency / ordering. */
  version?: number;
}

/** Typed reasons an event can be rejected (CONVENTIONS §4.5). */
export type RejectCode =
  | 'NOT_ON_CLOCK'
  | 'ANNOUNCING'
  | 'WRONG_TEAM'
  | 'PLAYER_TAKEN'
  | 'STALE_VERSION'
  | 'BAD_STATE'
  | 'ORDER_LOCKED'
  | 'INVALID_ORDER'
  | 'PICK_NOT_FOUND'
  | 'OUT_OF_RANGE'
  | 'NOTHING_TO_UNDO'
  | 'NO_LEGAL_PLAYERS'
  | 'RNG_REQUIRED'
  // Transport/auth rejects owned by the handler layer (not the engine).
  | 'UNAUTHORIZED'
  | 'BAD_REQUEST'
  | 'NOT_FOUND'
  // A `TIMER_NUDGE` arrived before the server's own clock reached the deadline;
  // retry-able — the client keeps waiting and nudges again (AD-1).
  | 'TOO_EARLY';

/**
 * Inbound (client→server) nudge: the sender's offset-corrected countdown for the
 * current timed state has crossed its `honorDeadline` (DESIGN AD-1). Carries only
 * `draftId` — no auth, no phase. The server maps the current status to the
 * transition and honors it **only when its OWN clock is past `honorDeadline`**
 * (else `TOO_EARLY`); the version guard collapses concurrent nudges from multiple
 * screens into one commit (losers get `STALE_VERSION`). The EventBridge scheduler
 * stays armed as a backstop for when no client is watching.
 */
export const TIMER_NUDGE = 'TIMER_NUDGE';

/**
 * A pick was applied (manual or auto). Carries the completed pick for the
 * announcement AND the next team plus `announceUntil` (epoch ms the announcement
 * lockout ends). During the lockout there is NO pick clock and every SUBMIT_PICK
 * is rejected; the server flips PICK_IN → ON_CLOCK at `announceUntil`, which
 * arms the fresh pick clock (DESIGN §5.2). Both fields are null on the final pick.
 */
export type PickMade = Envelope<
  'PICK_MADE',
  {
    pick: Pick;
    nextTeamSlot: number | null;
    announceUntil: number | null;
  }
>;

/** An event was refused; state is unchanged. */
export type Reject = Envelope<
  'REJECT',
  {
    code: RejectCode;
    message: string;
    currentVersion: number;
  }
>;

/**
 * Full authoritative snapshot (DESIGN §5.5). Emitted on every admin/state
 * transition and on reconnect; the client rebuilds its UI wholesale.
 * `serverNow` anchors the clock-offset handshake.
 */
export type Sync = Envelope<
  'SYNC',
  {
    state: DraftState;
    serverNow: number;
  }
>;

export type OutboundMessage = PickMade | Reject | Sync;

export type OutboundType = OutboundMessage['type'];
