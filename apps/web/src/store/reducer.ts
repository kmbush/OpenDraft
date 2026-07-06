/**
 * Pure reducer for the mirrored live draft state (CONVENTIONS §4.1: the server
 * is the source of truth; only inbound WS messages mutate this). Kept separate
 * from Zustand so it is unit-testable. No draft rules here — the engine owns
 * those; this only applies server-authoritative messages to the local mirror.
 */
import type { DraftState, OutboundMessage, RejectCode } from '@opendraft/shared';
import { clockOffset } from '../lib/clock.js';

/** A player added optimistically, pending server confirmation (§4.1). */
export interface OptimisticPick {
  playerId: string;
  teamSlot: number;
}

export interface LiveState {
  /** Server-authoritative draft mirror; null until the first SYNC. */
  draft: DraftState | null;
  /** clientNow − serverNow, for the countdown (§5.5). */
  serverOffsetMs: number;
  /** Pending optimistic pick, cleared on PICK_MADE/REJECT. */
  optimistic: OptimisticPick | null;
  /** Last rejection, surfaced non-blockingly on the station (§4.5). */
  lastReject: { code: RejectCode; message: string } | null;
}

export const initialLiveState: LiveState = {
  draft: null,
  serverOffsetMs: 0,
  optimistic: null,
  lastReject: null,
};

/** Apply a full authoritative snapshot; recompute the clock offset (§5.5). */
function applySync(
  state: LiveState,
  message: Extract<OutboundMessage, { type: 'SYNC' }>,
  clientNow: number,
): LiveState {
  return {
    ...state,
    draft: message.payload.state,
    serverOffsetMs: clockOffset(clientNow, message.payload.serverNow),
    optimistic: null,
    lastReject: null,
  };
}

/**
 * Apply an incremental pick. The message carries the completed pick, the next
 * team, and `announceUntil` (the announcement lockout end, §5.2). We enter the
 * PICK_IN lockout with NO pick clock — the fresh clock arrives with the SYNC the
 * server sends on ANNOUNCE_DONE — reconstructing the mirror without recomputing
 * any ordering.
 */
function applyPickMade(
  state: LiveState,
  message: Extract<OutboundMessage, { type: 'PICK_MADE' }>,
): LiveState {
  if (!state.draft) return state;
  const { pick, nextTeamSlot, announceUntil } = message.payload;
  const draft: DraftState = {
    ...state.draft,
    picks: [...state.draft.picks, pick],
    pointer: pick.overall + 1,
    status: nextTeamSlot === null ? 'COMPLETE' : 'PICK_IN',
    pendingPick: pick,
    pickDeadline: undefined,
    announceUntil: announceUntil ?? undefined,
    version: message.version ?? state.draft.version,
  };
  const clearOptimistic = state.optimistic?.playerId === pick.playerId;
  return { ...state, draft, optimistic: clearOptimistic ? null : state.optimistic };
}

/** Apply a rejection: roll back the optimistic pick, surface the reason (§4.5). */
function applyReject(
  state: LiveState,
  message: Extract<OutboundMessage, { type: 'REJECT' }>,
): LiveState {
  // TOO_EARLY only ever answers a TIMER_NUDGE — an internal "keep waiting" signal,
  // never user-actionable. Swallow it so it never surfaces as a station notice or
  // rolls back an unrelated optimistic pick (AD-1).
  if (message.payload.code === 'TOO_EARLY') return state;
  return {
    ...state,
    optimistic: null,
    lastReject: { code: message.payload.code, message: message.payload.message },
  };
}

/** Reduce one inbound message into the live mirror. */
export function applyInbound(
  state: LiveState,
  message: OutboundMessage,
  clientNow: number,
): LiveState {
  switch (message.type) {
    case 'SYNC':
      return applySync(state, message, clientNow);
    case 'PICK_MADE':
      return applyPickMade(state, message);
    case 'REJECT':
      return applyReject(state, message);
  }
}

/** Set of player ids already taken (applied picks + any optimistic pick). */
export function takenIds(state: LiveState): Set<string> {
  const ids = new Set<string>(state.draft?.picks.map((p) => p.playerId) ?? []);
  if (state.optimistic) ids.add(state.optimistic.playerId);
  return ids;
}
