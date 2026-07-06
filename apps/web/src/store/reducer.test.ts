import type { DraftState, OutboundMessage, Pick } from '@opendraft/shared';
import { describe, expect, it } from 'vitest';
import { type LiveState, applyInbound, initialLiveState, takenIds } from './reducer.js';

function draftFixture(): DraftState {
  return {
    leagueId: 'L1',
    draftId: 'D1',
    status: 'ON_CLOCK',
    settings: {
      teams: 2,
      rounds: 2,
      mode: 'linear',
      timerSec: 90,
      waitingSec: 8,
      goLiveCountdownSec: 0,
      rosterFormat: { starters: {}, flex: [], bench: 0, positionMax: {} },
    },
    teams: [
      { slot: 1, name: 'A' },
      { slot: 2, name: 'B' },
    ],
    order: [1, 2],
    picks: [],
    pointer: 1,
    pickDeadline: 100_000,
    version: 2,
    poolSnapshotId: 'snap',
  };
}

const syncMsg = (state: DraftState, serverNow: number): OutboundMessage => ({
  type: 'SYNC',
  draftId: 'D1',
  payload: { state, serverNow },
  version: state.version,
});

const pickMadeMsg = (
  pick: Pick,
  nextTeamSlot: number | null,
  announceUntil: number | null,
  version: number,
): OutboundMessage => ({
  type: 'PICK_MADE',
  draftId: 'D1',
  payload: { pick, nextTeamSlot, announceUntil },
  version,
});

const pick = (overall: number, playerId: string): Pick => ({
  overall,
  round: 1,
  pickInRound: overall,
  teamSlot: 1,
  playerId,
  position: 'RB',
  madeAt: 0,
  auto: false,
});

describe('applyInbound: SYNC', () => {
  it('adopts the snapshot and computes the clock offset', () => {
    const next = applyInbound(initialLiveState, syncMsg(draftFixture(), 5_000), 5_400);
    expect(next.draft?.draftId).toBe('D1');
    expect(next.serverOffsetMs).toBe(400); // clientNow - serverNow
  });
});

describe('applyInbound: PICK_MADE', () => {
  it('appends the pick, advances the pointer, enters the PICK_IN lockout, clears optimistic', () => {
    const base: LiveState = {
      ...initialLiveState,
      draft: draftFixture(),
      optimistic: { playerId: 'p1', teamSlot: 1 },
    };
    const next = applyInbound(base, pickMadeMsg(pick(1, 'p1'), 2, 200_000, 3), 0);
    expect(next.draft?.picks.map((p) => p.playerId)).toEqual(['p1']);
    expect(next.draft?.pointer).toBe(2);
    expect(next.draft?.status).toBe('PICK_IN');
    // The lockout carries no pick clock — announceUntil drives the board, and the
    // fresh clock arrives with the ANNOUNCE_DONE SYNC.
    expect(next.draft?.announceUntil).toBe(200_000);
    expect(next.draft?.pickDeadline).toBeUndefined();
    expect(next.draft?.version).toBe(3);
    expect(next.optimistic).toBeNull();
  });

  it('marks COMPLETE on the final pick', () => {
    const base: LiveState = { ...initialLiveState, draft: draftFixture() };
    const next = applyInbound(base, pickMadeMsg(pick(4, 'last'), null, null, 6), 0);
    expect(next.draft?.status).toBe('COMPLETE');
  });
});

describe('applyInbound: REJECT', () => {
  it('rolls back the optimistic pick and surfaces the reason', () => {
    const base: LiveState = {
      ...initialLiveState,
      draft: draftFixture(),
      optimistic: { playerId: 'p1', teamSlot: 1 },
    };
    const next = applyInbound(
      base,
      {
        type: 'REJECT',
        draftId: 'D1',
        payload: { code: 'PLAYER_TAKEN', message: 'taken', currentVersion: 2 },
        version: 2,
      },
      0,
    );
    expect(next.optimistic).toBeNull();
    expect(next.lastReject).toEqual({ code: 'PLAYER_TAKEN', message: 'taken' });
  });
});

describe('takenIds', () => {
  it('includes applied picks and the pending optimistic pick', () => {
    const state: LiveState = {
      ...initialLiveState,
      draft: { ...draftFixture(), picks: [pick(1, 'a')] },
      optimistic: { playerId: 'b', teamSlot: 2 },
    };
    expect([...takenIds(state)].sort()).toEqual(['a', 'b']);
  });
});

describe('applyInbound: unexpected frames (defensive)', () => {
  it('an unknown / type-less frame leaves the mirror untouched (never undefined)', () => {
    const base: LiveState = { ...initialLiveState, draft: draftFixture() };
    // e.g. an API Gateway control frame: {"message":"Internal server error"} — no `type`.
    // Zustand v5 replaces the store on a non-object return, so the reducer must
    // return `state` (not undefined) or every screen white-screens.
    const bogus = { message: 'Internal server error' } as unknown as OutboundMessage;
    expect(applyInbound(base, bogus, 0)).toBe(base);
  });
});
