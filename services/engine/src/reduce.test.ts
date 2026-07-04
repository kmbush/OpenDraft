import type { DraftState, Position, RosterFormat } from '@opendraft/shared';
import { beforeEach, describe, expect, it } from 'vitest';
import { newDraft } from './draft.js';
import { slotForOverallPick } from './ordering.js';
import { type ReduceContext, reduce } from './reduce.js';
import { makeSettings, makeTeams, pool, seededRng, setupDraft } from './test-helpers.js';

/** Submit a pick for whichever team is currently on the clock. */
function submit(state: DraftState, ctx: ReduceContext, playerId: string, position: Position) {
  const slot = slotForOverallPick(
    state.pointer,
    state.settings.teams,
    state.order,
    state.settings.mode,
  );
  return reduce(state, { type: 'SUBMIT_PICK', teamSlot: slot, playerId, position }, ctx);
}

const CTX: ReduceContext = { now: 1000, rng: seededRng(1) };

describe('START', () => {
  it('moves ORDER_SET → ON_CLOCK, arms the pick clock, bumps version, emits SYNC', () => {
    const state = setupDraft(makeSettings({ mode: 'linear' }));
    const { state: next, outbox } = reduce(state, { type: 'START' }, { now: 1000 });
    expect(next.status).toBe('ON_CLOCK');
    expect(next.pointer).toBe(1);
    expect(next.version).toBe(1);
    expect(next.pickDeadline).toBe(1000 + 90 * 1000); // timerSec only, no waiting
    expect(outbox[0]?.type).toBe('SYNC');
  });

  it('rejects START unless ORDER_SET', () => {
    const state = newDraft({
      leagueId: 'L1',
      draftId: 'D1',
      settings: makeSettings(),
      teams: makeTeams(4),
    });
    const { state: next, outbox } = reduce(state, { type: 'START' }, { now: 1000 });
    expect(next).toBe(state); // unchanged
    expect(outbox[0]).toMatchObject({ type: 'REJECT', payload: { code: 'BAD_STATE' } });
  });
});

describe('SUBMIT_PICK + waiting-period deadline (DESIGN §5.2)', () => {
  let started: DraftState;
  beforeEach(() => {
    started = reduce(
      setupDraft(makeSettings({ mode: 'linear' })),
      { type: 'START' },
      { now: 0 },
    ).state;
  });

  it('applies a pick and arms the NEXT clock at now + (waitingSec + timerSec)', () => {
    const { state, outbox } = submit(started, { now: 2000 }, 'p1', 'RB');
    expect(state.status).toBe('PICK_IN');
    expect(state.pointer).toBe(2);
    expect(state.version).toBe(2);
    expect(state.pendingPick?.playerId).toBe('p1');
    expect(state.pickDeadline).toBe(2000 + (8 + 90) * 1000);

    const msg = outbox[0];
    expect(msg?.type).toBe('PICK_MADE');
    expect(msg).toMatchObject({
      payload: {
        pick: { overall: 1, teamSlot: 1, playerId: 'p1', auto: false },
        nextTeamSlot: 2,
        nextPickDeadline: 2000 + 98 * 1000,
      },
    });
  });

  it('accepts the next pick while in the PICK_IN window (next team is live)', () => {
    const afterFirst = submit(started, { now: 2000 }, 'p1', 'RB').state;
    const { state } = submit(afterFirst, { now: 3000 }, 'p2', 'WR');
    expect(state.pointer).toBe(3);
    expect(state.picks).toHaveLength(2);
  });

  it('transitions to COMPLETE on the final pick with no next clock', () => {
    // teams 2, rounds 1 → only 2 picks total
    let s = reduce(
      setupDraft(makeSettings({ teams: 2, rounds: 1, mode: 'linear' }), [1, 2]),
      { type: 'START' },
      { now: 0 },
    ).state;
    s = submit(s, { now: 10 }, 'a', 'QB').state;
    const { state, outbox } = submit(s, { now: 20 }, 'b', 'RB');
    expect(state.status).toBe('COMPLETE');
    expect(state.pickDeadline).toBeUndefined();
    expect(outbox[0]).toMatchObject({
      type: 'PICK_MADE',
      payload: { nextTeamSlot: null, nextPickDeadline: null },
    });
  });
});

describe('SUBMIT_PICK rejections', () => {
  it('rejects a pick when no team is on the clock', () => {
    const state = setupDraft(makeSettings()); // ORDER_SET, not started (pointer 0)
    const { state: next, outbox } = reduce(
      state,
      { type: 'SUBMIT_PICK', teamSlot: 1, playerId: 'p1', position: 'RB' },
      CTX,
    );
    expect(next).toBe(state);
    expect(outbox[0]).toMatchObject({ type: 'REJECT', payload: { code: 'NOT_ON_CLOCK' } });
  });

  it('rejects a pick for the wrong team', () => {
    const started = reduce(
      setupDraft(makeSettings({ mode: 'linear' })),
      { type: 'START' },
      { now: 0 },
    ).state;
    const wrongSlot = 3; // slot 1 is on the clock
    const { outbox } = reduce(
      started,
      { type: 'SUBMIT_PICK', teamSlot: wrongSlot, playerId: 'p1', position: 'RB' },
      CTX,
    );
    expect(outbox[0]).toMatchObject({ type: 'REJECT', payload: { code: 'WRONG_TEAM' } });
  });

  it('rejects drafting an already-taken player', () => {
    let s = reduce(
      setupDraft(makeSettings({ mode: 'linear' })),
      { type: 'START' },
      { now: 0 },
    ).state;
    s = submit(s, { now: 1 }, 'dup', 'RB').state;
    const { outbox } = submit(s, { now: 2 }, 'dup', 'WR');
    expect(outbox[0]).toMatchObject({ type: 'REJECT', payload: { code: 'PLAYER_TAKEN' } });
  });

  it('rejects a stale expectedVersion', () => {
    const started = reduce(
      setupDraft(makeSettings({ mode: 'linear' })),
      { type: 'START' },
      { now: 0 },
    ).state;
    const { state: next, outbox } = reduce(
      started,
      { type: 'SUBMIT_PICK', teamSlot: 1, playerId: 'p1', position: 'RB', expectedVersion: 99 },
      CTX,
    );
    expect(next).toBe(started);
    expect(outbox[0]).toMatchObject({
      type: 'REJECT',
      payload: { code: 'STALE_VERSION', currentVersion: 1 },
    });
  });
});

describe('multi-step UNDO', () => {
  it('restores pointer, version, and returns players to the pool; re-arms the clock', () => {
    let s = reduce(
      setupDraft(makeSettings({ mode: 'linear' })),
      { type: 'START' },
      { now: 0 },
    ).state;
    s = submit(s, { now: 1 }, 'p1', 'RB').state; // v2 ptr2
    s = submit(s, { now: 2 }, 'p2', 'WR').state; // v3 ptr3
    s = submit(s, { now: 3 }, 'p3', 'TE').state; // v4 ptr4
    expect(s.version).toBe(4);
    expect(s.pointer).toBe(4);

    s = reduce(s, { type: 'UNDO' }, { now: 100 }).state; // pop p3 → v5
    s = reduce(s, { type: 'UNDO' }, { now: 200 }).state; // pop p2 → v6
    expect(s.picks.map((p) => p.playerId)).toEqual(['p1']);
    // pointer and pool ARE restored, but `version` is a forward-only token: it
    // advances on undo too (4 → 5 → 6), so a stale expectedVersion never re-matches.
    expect(s.pointer).toBe(2);
    expect(s.version).toBe(6);
    expect(s.status).toBe('ON_CLOCK');
    expect(s.pendingPick).toBeUndefined();
    expect(s.pickDeadline).toBe(200 + 90 * 1000); // re-armed with the timer

    // p2 and p3 are draftable again; p1 is still taken
    const retake = submit(s, { now: 300 }, 'p2', 'WR');
    expect(retake.outbox[0]?.type).toBe('PICK_MADE');
    const retakeTaken = submit(s, { now: 300 }, 'p1', 'QB');
    expect(retakeTaken.outbox[0]).toMatchObject({
      type: 'REJECT',
      payload: { code: 'PLAYER_TAKEN' },
    });
  });

  it('rejects undo when there are no picks', () => {
    const s = reduce(setupDraft(makeSettings()), { type: 'START' }, { now: 0 }).state;
    const { outbox } = reduce(s, { type: 'UNDO' }, { now: 0 });
    expect(outbox[0]).toMatchObject({ type: 'REJECT', payload: { code: 'NOTHING_TO_UNDO' } });
  });
});

describe('TIMER_EXPIRE auto-pick (AD-11)', () => {
  const capRoster: RosterFormat = {
    starters: { QB: 1, RB: 2, WR: 2, TE: 1 },
    flex: [],
    bench: 4,
    positionMax: { QB: 1, RB: 8, WR: 8, TE: 3 },
  };

  /** A linear, 2-team draft on team 1's second-round pick, team 1 already holds a QB. */
  function stateWithCappedQb(): DraftState {
    const settings = makeSettings({ teams: 2, rounds: 4, mode: 'linear', rosterFormat: capRoster });
    return {
      ...setupDraft(settings, [1, 2]),
      status: 'ON_CLOCK',
      pointer: 3, // linear R2 seat 1 → team 1
      picks: [
        {
          overall: 1,
          round: 1,
          pickInRound: 1,
          teamSlot: 1,
          playerId: 'qb0',
          position: 'QB',
          madeAt: 0,
          auto: false,
        },
        {
          overall: 2,
          round: 1,
          pickInRound: 2,
          teamSlot: 2,
          playerId: 'rbX',
          position: 'RB',
          madeAt: 0,
          auto: false,
        },
      ],
      version: 3,
    };
  }

  const candidates = pool([
    ['qbA', 'QB'],
    ['qbB', 'QB'],
    ['rb1', 'RB'],
    ['rb2', 'RB'],
    ['wr1', 'WR'],
  ]);

  it('picks only a legal player (QB is capped for the team)', () => {
    for (let seed = 0; seed < 25; seed++) {
      const { state, outbox } = reduce(
        stateWithCappedQb(),
        { type: 'TIMER_EXPIRE', available: candidates },
        { now: 5000, rng: seededRng(seed) },
      );
      expect(state.pendingPick?.position).not.toBe('QB');
      expect(state.pendingPick?.auto).toBe(true);
      expect(outbox[0]?.type).toBe('PICK_MADE');
    }
  });

  it('is deterministic under a seeded rng', () => {
    const run = () =>
      reduce(
        stateWithCappedQb(),
        { type: 'TIMER_EXPIRE', available: candidates },
        { now: 5000, rng: seededRng(7) },
      ).state.pendingPick?.playerId;
    expect(run()).toBe(run());
  });

  it('never auto-picks an already-taken player', () => {
    const withTaken = pool([
      ['qb0', 'QB'], // already drafted in the fixture
      ['rbX', 'RB'], // already drafted in the fixture
      ['rb9', 'RB'],
    ]);
    for (let seed = 0; seed < 25; seed++) {
      const { state } = reduce(
        stateWithCappedQb(),
        { type: 'TIMER_EXPIRE', available: withTaken },
        { now: 5000, rng: seededRng(seed) },
      );
      expect(state.pendingPick?.playerId).toBe('rb9');
    }
  });

  it('falls back to any available player when every position is capped', () => {
    // Only QBs available, and QB is capped → fall back to a QB anyway.
    const onlyQbs = pool([
      ['qbA', 'QB'],
      ['qbB', 'QB'],
    ]);
    const { state, outbox } = reduce(
      stateWithCappedQb(),
      { type: 'TIMER_EXPIRE', available: onlyQbs },
      { now: 5000, rng: seededRng(3) },
    );
    expect(state.pendingPick?.position).toBe('QB');
    expect(outbox[0]?.type).toBe('PICK_MADE');
  });

  it('rejects when no rng is provided', () => {
    const { outbox } = reduce(
      stateWithCappedQb(),
      { type: 'TIMER_EXPIRE', available: candidates },
      { now: 5000 },
    );
    expect(outbox[0]).toMatchObject({ type: 'REJECT', payload: { code: 'RNG_REQUIRED' } });
  });

  it('rejects when off the clock', () => {
    const s = setupDraft(makeSettings());
    const { outbox } = reduce(
      s,
      { type: 'TIMER_EXPIRE', available: candidates },
      { now: 0, rng: seededRng(1) },
    );
    expect(outbox[0]).toMatchObject({ type: 'REJECT', payload: { code: 'NOT_ON_CLOCK' } });
  });
});

describe('PAUSE / RESUME', () => {
  it('stores remaining ms on pause and recomputes the deadline on resume', () => {
    const started = reduce(
      setupDraft(makeSettings({ mode: 'linear' })),
      { type: 'START' },
      { now: 1000 },
    ).state;
    // deadline = 1000 + 90000 = 91000
    const paused = reduce(started, { type: 'PAUSE' }, { now: 31000 }).state; // 60s elapsed
    expect(paused.status).toBe('PAUSED');
    expect(paused.pausedRemainingMs).toBe(60000);
    expect(paused.pickDeadline).toBeUndefined();

    const resumed = reduce(paused, { type: 'RESUME' }, { now: 500000 }).state;
    expect(resumed.status).toBe('ON_CLOCK');
    expect(resumed.pickDeadline).toBe(500000 + 60000);
    expect(resumed.pausedRemainingMs).toBeUndefined();
  });

  it('rejects pause when not live and resume when not paused', () => {
    const orderSet = setupDraft(makeSettings());
    expect(reduce(orderSet, { type: 'PAUSE' }, { now: 0 }).outbox[0]).toMatchObject({
      type: 'REJECT',
      payload: { code: 'BAD_STATE' },
    });
    expect(reduce(orderSet, { type: 'RESUME' }, { now: 0 }).outbox[0]).toMatchObject({
      type: 'REJECT',
      payload: { code: 'BAD_STATE' },
    });
  });
});

describe('order editing (pre-START only)', () => {
  it('SET_ORDER moves SETUP → ORDER_SET with a valid permutation', () => {
    const s = newDraft({
      leagueId: 'L1',
      draftId: 'D1',
      settings: makeSettings(),
      teams: makeTeams(4),
    });
    const { state } = reduce(s, { type: 'SET_ORDER', order: [4, 3, 2, 1] }, { now: 0 });
    expect(state.status).toBe('ORDER_SET');
    expect(state.order).toEqual([4, 3, 2, 1]);
    expect(state.version).toBe(1);
  });

  it('EDIT_ORDER rejects an invalid permutation', () => {
    const s = setupDraft(makeSettings());
    const { outbox } = reduce(s, { type: 'EDIT_ORDER', order: [1, 1, 2, 3] }, { now: 0 });
    expect(outbox[0]).toMatchObject({ type: 'REJECT', payload: { code: 'INVALID_ORDER' } });
  });

  it('rejects order edits once the draft has started', () => {
    const started = reduce(setupDraft(makeSettings()), { type: 'START' }, { now: 0 }).state;
    const { outbox } = reduce(started, { type: 'EDIT_ORDER', order: [4, 3, 2, 1] }, { now: 0 });
    expect(outbox[0]).toMatchObject({ type: 'REJECT', payload: { code: 'ORDER_LOCKED' } });
  });
});

describe('EDIT_PICK', () => {
  it('replaces a past pick player without disturbing order or pointer', () => {
    let s = reduce(
      setupDraft(makeSettings({ mode: 'linear' })),
      { type: 'START' },
      { now: 0 },
    ).state;
    s = submit(s, { now: 1 }, 'old', 'RB').state;
    const before = { pointer: s.pointer, order: s.order };
    const { state } = reduce(
      s,
      { type: 'EDIT_PICK', overall: 1, playerId: 'new', position: 'WR' },
      { now: 5 },
    );
    expect(state.picks[0]).toMatchObject({ overall: 1, playerId: 'new', position: 'WR' });
    expect(state.pointer).toBe(before.pointer);
    expect(state.order).toEqual(before.order);
    expect(state.version).toBe(s.version + 1);
  });

  it('rejects editing a missing pick and a clashing player', () => {
    let s = reduce(
      setupDraft(makeSettings({ mode: 'linear' })),
      { type: 'START' },
      { now: 0 },
    ).state;
    s = submit(s, { now: 1 }, 'p1', 'RB').state;
    s = submit(s, { now: 2 }, 'p2', 'WR').state;
    expect(
      reduce(s, { type: 'EDIT_PICK', overall: 99, playerId: 'x', position: 'RB' }, { now: 0 })
        .outbox[0],
    ).toMatchObject({
      type: 'REJECT',
      payload: { code: 'PICK_NOT_FOUND' },
    });
    expect(
      reduce(s, { type: 'EDIT_PICK', overall: 1, playerId: 'p2', position: 'WR' }, { now: 0 })
        .outbox[0],
    ).toMatchObject({
      type: 'REJECT',
      payload: { code: 'PLAYER_TAKEN' },
    });
  });
});

describe('SET_ON_CLOCK', () => {
  it('moves the pointer and re-arms the clock', () => {
    const started = reduce(
      setupDraft(makeSettings({ mode: 'linear' })),
      { type: 'START' },
      { now: 0 },
    ).state;
    const { state } = reduce(started, { type: 'SET_ON_CLOCK', overall: 5 }, { now: 7000 });
    expect(state.pointer).toBe(5);
    expect(state.status).toBe('ON_CLOCK');
    expect(state.pickDeadline).toBe(7000 + 90 * 1000);
  });

  it('rejects out-of-range and pre-start pointer moves', () => {
    const started = reduce(setupDraft(makeSettings()), { type: 'START' }, { now: 0 }).state;
    expect(
      reduce(started, { type: 'SET_ON_CLOCK', overall: 999 }, { now: 0 }).outbox[0],
    ).toMatchObject({
      type: 'REJECT',
      payload: { code: 'OUT_OF_RANGE' },
    });
    const orderSet = setupDraft(makeSettings());
    expect(
      reduce(orderSet, { type: 'SET_ON_CLOCK', overall: 1 }, { now: 0 }).outbox[0],
    ).toMatchObject({
      type: 'REJECT',
      payload: { code: 'BAD_STATE' },
    });
  });
});

describe('snake vs linear across full rounds (on-clock sequence)', () => {
  it('linear repeats the order each round', () => {
    let s = reduce(
      setupDraft(makeSettings({ teams: 3, rounds: 3, mode: 'linear' }), [1, 2, 3]),
      { type: 'START' },
      { now: 0 },
    ).state;
    const seen: number[] = [];
    for (let i = 0; i < 9; i++) {
      seen.push(slotForOverallPick(s.pointer, 3, s.order, 'linear'));
      s = submit(s, { now: i }, `pl${i}`, 'RB').state;
    }
    expect(seen).toEqual([1, 2, 3, 1, 2, 3, 1, 2, 3]);
    expect(s.status).toBe('COMPLETE');
  });

  it('snake reverses even rounds', () => {
    let s = reduce(
      setupDraft(makeSettings({ teams: 3, rounds: 3, mode: 'snake' }), [1, 2, 3]),
      { type: 'START' },
      { now: 0 },
    ).state;
    const seen: number[] = [];
    for (let i = 0; i < 9; i++) {
      seen.push(slotForOverallPick(s.pointer, 3, s.order, 'snake'));
      s = submit(s, { now: i }, `sn${i}`, 'RB').state;
    }
    expect(seen).toEqual([1, 2, 3, 3, 2, 1, 1, 2, 3]);
    expect(s.status).toBe('COMPLETE');
  });
});
