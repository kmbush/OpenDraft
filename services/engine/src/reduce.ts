/**
 * The pure draft state machine (DESIGN §5, AD-2). No I/O, no `Date.now()`, no
 * `Math.random()` — time enters via `ctx.now`, randomness via `ctx.rng`
 * (CONVENTIONS §4.2, §10). Illegal events are rejected with a typed message,
 * never thrown (CONVENTIONS §4.5).
 */
import type {
  DraftEvent,
  DraftState,
  OutboundMessage,
  Pick,
  Position,
  RejectCode,
} from '@opendraft/shared';
import { isValidOrder, pickInRound, roundForOverall, slotForOverallPick } from './ordering.js';
import { legalCandidates, rosterCounts } from './roster.js';

/** Context threaded into every reduction: the clock and (optionally) an RNG. */
export interface ReduceContext {
  /** Authoritative wall-clock in epoch milliseconds. */
  now: number;
  /** Injected RNG returning [0, 1); required only for auto-pick (TIMER_EXPIRE). */
  rng?: () => number;
}

export interface ReduceResult {
  state: DraftState;
  outbox: OutboundMessage[];
}

/** A team is live on the clock in both ON_CLOCK and the PICK_IN announcement window. */
function isLive(state: DraftState): boolean {
  return state.status === 'ON_CLOCK' || state.status === 'PICK_IN';
}

function takenIds(state: DraftState): Set<string> {
  return new Set(state.picks.map((p) => p.playerId));
}

function totalPicks(state: DraftState): number {
  return state.settings.teams * state.settings.rounds;
}

function reject(state: DraftState, code: RejectCode, message: string): ReduceResult {
  return {
    state,
    outbox: [
      {
        type: 'REJECT',
        draftId: state.draftId,
        payload: { code, message, currentVersion: state.version },
        version: state.version,
      },
    ],
  };
}

function sync(state: DraftState, ctx: ReduceContext): ReduceResult {
  return {
    state,
    outbox: [
      {
        type: 'SYNC',
        draftId: state.draftId,
        payload: { state, serverNow: ctx.now },
        version: state.version,
      },
    ],
  };
}

/** Millisecond deadline `secs` from now. */
function deadlineFrom(now: number, secs: number): number {
  return now + secs * 1000;
}

/**
 * Apply a pick (manual or auto) at the current pointer, advance the pointer, and
 * emit the single PICK_MADE broadcast carrying the completed pick plus the next
 * team's deadline = now + waitingSec + timerSec (DESIGN §5.2). The final pick
 * transitions to COMPLETE with no next clock.
 */
function applyPick(
  state: DraftState,
  teamSlot: number,
  playerId: string,
  position: Position,
  auto: boolean,
  now: number,
): ReduceResult {
  const teams = state.settings.teams;
  const overall = state.pointer;
  const pick: Pick = {
    overall,
    round: roundForOverall(overall, teams),
    pickInRound: pickInRound(overall, teams),
    teamSlot,
    playerId,
    position,
    madeAt: now,
    auto,
  };
  const picks = [...state.picks, pick];
  const version = state.version + 1;
  const nextPointer = overall + 1;

  if (nextPointer > totalPicks(state)) {
    const next: DraftState = {
      ...state,
      picks,
      pointer: nextPointer,
      version,
      status: 'COMPLETE',
      pendingPick: pick,
      pickDeadline: undefined,
    };
    return {
      state: next,
      outbox: [
        {
          type: 'PICK_MADE',
          draftId: state.draftId,
          payload: { pick, nextTeamSlot: null, nextPickDeadline: null },
          version,
        },
      ],
    };
  }

  const nextTeamSlot = slotForOverallPick(
    nextPointer,
    state.settings.teams,
    state.order,
    state.settings.mode,
  );
  const nextPickDeadline = deadlineFrom(now, state.settings.waitingSec + state.settings.timerSec);
  const next: DraftState = {
    ...state,
    picks,
    pointer: nextPointer,
    version,
    status: 'PICK_IN',
    pendingPick: pick,
    pickDeadline: nextPickDeadline,
  };
  return {
    state: next,
    outbox: [
      {
        type: 'PICK_MADE',
        draftId: state.draftId,
        payload: { pick, nextTeamSlot, nextPickDeadline },
        version,
      },
    ],
  };
}

function onClockSlot(state: DraftState): number {
  return slotForOverallPick(state.pointer, state.settings.teams, state.order, state.settings.mode);
}

function submitPick(
  state: DraftState,
  event: Extract<DraftEvent, { type: 'SUBMIT_PICK' }>,
  ctx: ReduceContext,
): ReduceResult {
  if (!isLive(state)) return reject(state, 'NOT_ON_CLOCK', 'No team is on the clock.');
  if (event.expectedVersion !== undefined && event.expectedVersion !== state.version) {
    return reject(state, 'STALE_VERSION', 'Submitted against a stale draft version.');
  }
  const slot = onClockSlot(state);
  if (event.teamSlot !== slot) {
    return reject(state, 'WRONG_TEAM', `Team ${slot} is on the clock, not ${event.teamSlot}.`);
  }
  if (takenIds(state).has(event.playerId)) {
    return reject(state, 'PLAYER_TAKEN', 'That player has already been drafted.');
  }
  return applyPick(state, slot, event.playerId, event.position, false, ctx.now);
}

function timerExpire(
  state: DraftState,
  event: Extract<DraftEvent, { type: 'TIMER_EXPIRE' }>,
  ctx: ReduceContext,
): ReduceResult {
  if (!isLive(state)) return reject(state, 'NOT_ON_CLOCK', 'No team is on the clock.');
  if (event.expectedVersion !== undefined && event.expectedVersion !== state.version) {
    return reject(state, 'STALE_VERSION', 'Timer fired against a stale draft version.');
  }
  if (!ctx.rng) return reject(state, 'RNG_REQUIRED', 'Auto-pick requires an injected rng.');

  const slot = onClockSlot(state);
  const taken = takenIds(state);
  const available = event.available.filter((p) => !taken.has(p.id));
  if (available.length === 0) {
    return reject(state, 'NO_LEGAL_PLAYERS', 'No available players to auto-pick.');
  }
  const counts = rosterCounts(state, slot);
  const legal = legalCandidates(available, counts, state.settings.rosterFormat);
  // Fall back to any available player if every position is capped (AD-11 edge case).
  const pool = legal.length > 0 ? legal : available;
  const chosen = pool[Math.floor(ctx.rng() * pool.length)] ?? pool[0];
  if (!chosen) return reject(state, 'NO_LEGAL_PLAYERS', 'No available players to auto-pick.');
  return applyPick(state, slot, chosen.id, chosen.position, true, ctx.now);
}

function start(state: DraftState, ctx: ReduceContext): ReduceResult {
  if (state.status !== 'ORDER_SET') {
    return reject(state, 'BAD_STATE', 'START requires an ORDER_SET draft.');
  }
  if (!isValidOrder(state.order, state.settings.teams)) {
    return reject(state, 'INVALID_ORDER', 'Draft order is not a valid permutation.');
  }
  const next: DraftState = {
    ...state,
    status: 'ON_CLOCK',
    pointer: 1,
    // First team just gets the pick clock — there is no prior "pick is in" to wait on.
    pickDeadline: deadlineFrom(ctx.now, state.settings.timerSec),
    pendingPick: undefined,
    version: state.version + 1,
  };
  return sync(next, ctx);
}

function pause(state: DraftState, ctx: ReduceContext): ReduceResult {
  if (!isLive(state)) return reject(state, 'BAD_STATE', 'Only a live clock can be paused.');
  const remaining = Math.max(0, (state.pickDeadline ?? ctx.now) - ctx.now);
  const next: DraftState = {
    ...state,
    status: 'PAUSED',
    pausedRemainingMs: remaining,
    pickDeadline: undefined,
    version: state.version + 1,
  };
  return sync(next, ctx);
}

function resume(state: DraftState, ctx: ReduceContext): ReduceResult {
  if (state.status !== 'PAUSED') return reject(state, 'BAD_STATE', 'Draft is not paused.');
  const next: DraftState = {
    ...state,
    status: 'ON_CLOCK',
    pickDeadline: ctx.now + (state.pausedRemainingMs ?? 0),
    pausedRemainingMs: undefined,
    version: state.version + 1,
  };
  return sync(next, ctx);
}

function undo(state: DraftState, ctx: ReduceContext): ReduceResult {
  if (state.picks.length === 0) {
    return reject(state, 'NOTHING_TO_UNDO', 'There are no picks to undo.');
  }
  const picks = state.picks.slice(0, -1);
  const next: DraftState = {
    ...state,
    picks,
    pointer: state.pointer - 1,
    // `version` is a forward-only concurrency token: undo advances it like any
    // mutation (never rewinds), so a stale expectedVersion can never re-match and
    // silently re-draft the just-undone player (DESIGN §4, §5.4).
    version: state.version + 1,
    status: 'ON_CLOCK',
    // Re-arm the clock for the team back on the clock; no stale announcement.
    pickDeadline: deadlineFrom(ctx.now, state.settings.timerSec),
    pendingPick: undefined,
    pausedRemainingMs: undefined,
  };
  return sync(next, ctx);
}

function editPick(
  state: DraftState,
  event: Extract<DraftEvent, { type: 'EDIT_PICK' }>,
  ctx: ReduceContext,
): ReduceResult {
  const idx = state.picks.findIndex((p) => p.overall === event.overall);
  if (idx === -1) return reject(state, 'PICK_NOT_FOUND', `No pick at overall ${event.overall}.`);
  const target = state.picks[idx];
  if (!target) return reject(state, 'PICK_NOT_FOUND', `No pick at overall ${event.overall}.`);
  const clashes = state.picks.some(
    (p) => p.overall !== event.overall && p.playerId === event.playerId,
  );
  if (clashes) return reject(state, 'PLAYER_TAKEN', 'That player is already on another pick.');
  const picks = [...state.picks];
  picks[idx] = { ...target, playerId: event.playerId, position: event.position };
  const next: DraftState = { ...state, picks, version: state.version + 1 };
  return sync(next, ctx);
}

function setOnClock(
  state: DraftState,
  event: Extract<DraftEvent, { type: 'SET_ON_CLOCK' }>,
  ctx: ReduceContext,
): ReduceResult {
  if (state.status === 'SETUP' || state.status === 'ORDER_SET') {
    return reject(state, 'BAD_STATE', 'Cannot move the pointer before the draft starts.');
  }
  if (event.overall < 1 || event.overall > totalPicks(state)) {
    return reject(state, 'OUT_OF_RANGE', `overall ${event.overall} is out of range.`);
  }
  const next: DraftState = {
    ...state,
    status: 'ON_CLOCK',
    pointer: event.overall,
    pickDeadline: deadlineFrom(ctx.now, state.settings.timerSec),
    pendingPick: undefined,
    pausedRemainingMs: undefined,
    version: state.version + 1,
  };
  return sync(next, ctx);
}

/** Shared guard+apply for SET_ORDER / EDIT_ORDER (both pre-START only). */
function applyOrder(state: DraftState, order: number[], ctx: ReduceContext): ReduceResult {
  if (state.status !== 'SETUP' && state.status !== 'ORDER_SET') {
    return reject(state, 'ORDER_LOCKED', 'The draft order is locked once the draft starts.');
  }
  if (!isValidOrder(order, state.settings.teams)) {
    return reject(state, 'INVALID_ORDER', 'Order must be a permutation of the team slots.');
  }
  const next: DraftState = {
    ...state,
    order: [...order],
    status: 'ORDER_SET',
    version: state.version + 1,
  };
  return sync(next, ctx);
}

/**
 * The single entry point. `reduce(state, event, ctx) => { state, outbox }`.
 * Pure and deterministic given `ctx`.
 */
export function reduce(state: DraftState, event: DraftEvent, ctx: ReduceContext): ReduceResult {
  switch (event.type) {
    case 'SUBMIT_PICK':
      return submitPick(state, event, ctx);
    case 'TIMER_EXPIRE':
      return timerExpire(state, event, ctx);
    case 'START':
      return start(state, ctx);
    case 'PAUSE':
      return pause(state, ctx);
    case 'RESUME':
      return resume(state, ctx);
    case 'UNDO':
      return undo(state, ctx);
    case 'EDIT_PICK':
      return editPick(state, event, ctx);
    case 'SET_ON_CLOCK':
      return setOnClock(state, event, ctx);
    case 'SET_ORDER':
      return applyOrder(state, event.order, ctx);
    case 'EDIT_ORDER':
      return applyOrder(state, event.order, ctx);
  }
}
