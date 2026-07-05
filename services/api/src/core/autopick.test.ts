import { reduce } from '@opendraft/engine';
import type { DraftState } from '@opendraft/shared';
import { beforeEach, describe, expect, it } from 'vitest';
import { type Harness, harness, liveDraft } from '../test-helpers.js';
import { onTimerFire } from './autopick.js';

let h: Harness;
beforeEach(() => {
  h = harness();
  h.persistence.seed(liveDraft());
});

describe('auto-pick fire (AD-11)', () => {
  it('loads the pool, dispatches TIMER_EXPIRE, and fans out a legal auto-pick', async () => {
    await onTimerFire(h.deps, { draftId: 'D1', expectedVersion: 2 });

    const stored = h.persistence.drafts.get('L1#D1') as DraftState;
    expect(stored.version).toBe(3);
    expect(stored.picks).toHaveLength(1);
    const pick = stored.picks[0];
    expect(pick?.auto).toBe(true);
    expect(['rb1', 'wr1', 'qb1']).toContain(pick?.playerId); // from the pool, legal

    expect(h.broadcaster.typesTo('c1')).toEqual(['PICK_MADE']);
    expect(h.broadcaster.typesTo('c2')).toEqual(['PICK_MADE']);
    expect(h.scheduler.armed).toHaveLength(1); // next clock armed
  });

  it('never auto-picks an already-taken player', async () => {
    // Team 1 manually takes rb1 → version 3, then the draft is in the PICK_IN
    // announcement lockout. The lockout fire ends it (ANNOUNCE_DONE → ON_CLOCK)
    // before any auto-pick can run; the next fire is team 2's actual auto-pick.
    const afterFirst = reduce(
      liveDraft(),
      { type: 'SUBMIT_PICK', teamSlot: 1, playerId: 'rb1', position: 'RB', expectedVersion: 2 },
      { now: 0 },
    ).state;
    expect(afterFirst.status).toBe('PICK_IN');
    h.persistence.seed(afterFirst);

    await onTimerFire(h.deps, { draftId: 'D1', expectedVersion: afterFirst.version });
    const onClock = h.persistence.drafts.get('L1#D1') as DraftState;
    expect(onClock.status).toBe('ON_CLOCK'); // lockout ended, team 2 now live
    expect(onClock.picks).toHaveLength(1); // no auto-pick yet

    await onTimerFire(h.deps, { draftId: 'D1', expectedVersion: onClock.version });
    const stored = h.persistence.drafts.get('L1#D1') as DraftState;
    expect(stored.picks).toHaveLength(2);
    expect(stored.picks.at(-1)?.playerId).not.toBe('rb1'); // rb1 was taken
  });

  it('is a no-op when the fire is stale (a manual pick already advanced version)', async () => {
    await onTimerFire(h.deps, { draftId: 'D1', expectedVersion: 999 });
    const stored = h.persistence.drafts.get('L1#D1') as DraftState;
    expect(stored.version).toBe(2); // unchanged
    expect(h.broadcaster.sent).toEqual([]);
    expect(h.scheduler.armed).toEqual([]);
  });
});

describe('reveal-done fire (REVEALING show)', () => {
  it('dispatches REVEAL_DONE, flips to ORDER_SET, and preserves the rolled order', async () => {
    const revealing: DraftState = {
      ...liveDraft(),
      status: 'REVEALING',
      pointer: 0,
      order: [2, 1],
      pickDeadline: undefined,
      reveal: { game: 'envelopes', revealAt: 1000 },
    };
    h.persistence.seed(revealing);

    await onTimerFire(h.deps, { draftId: 'D1', expectedVersion: revealing.version });

    const stored = h.persistence.drafts.get('L1#D1') as DraftState;
    expect(stored.status).toBe('ORDER_SET');
    expect(stored.order).toEqual([2, 1]); // the reveal never changes the order
    expect(stored.reveal).toBeUndefined();
    expect(stored.version).toBe(revealing.version + 1);
    expect(h.broadcaster.typesTo('c2')).toEqual(['SYNC']);
    expect(h.scheduler.armed).toHaveLength(0); // nothing timed after the reveal
  });
});

describe('announce-done fire (PICK_IN lockout)', () => {
  it('dispatches ANNOUNCE_DONE, flips PICK_IN → ON_CLOCK, and arms the fresh pick clock', async () => {
    // Team 1 picks → PICK_IN lockout (version 3, no pick clock, announceUntil set).
    const pickIn = reduce(
      liveDraft(),
      { type: 'SUBMIT_PICK', teamSlot: 1, playerId: 'rb1', position: 'RB', expectedVersion: 2 },
      { now: 0 },
    ).state;
    expect(pickIn.status).toBe('PICK_IN');
    expect(pickIn.pickDeadline).toBeUndefined();
    expect(pickIn.announceUntil).toBeDefined();
    h.persistence.seed(pickIn);

    await onTimerFire(h.deps, { draftId: 'D1', expectedVersion: pickIn.version });

    const stored = h.persistence.drafts.get('L1#D1') as DraftState;
    expect(stored.status).toBe('ON_CLOCK');
    expect(stored.pointer).toBe(2); // team 2 now live
    expect(stored.picks).toHaveLength(1); // no new pick — just the lockout ending
    expect(stored.pickDeadline).toBeDefined();
    expect(stored.announceUntil).toBeUndefined();
    expect(stored.version).toBe(pickIn.version + 1);
    expect(h.broadcaster.typesTo('c2')).toEqual(['SYNC']);
    expect(h.scheduler.armed).toHaveLength(1); // team 2's pick clock armed
  });
});

describe('go-live fire (STARTING countdown)', () => {
  it('dispatches GO_LIVE, puts team 1 on the clock, and arms the pick clock', async () => {
    const starting: DraftState = {
      ...liveDraft(),
      status: 'STARTING',
      pointer: 0,
      liveAt: 1000,
      pickDeadline: undefined,
    };
    h.persistence.seed(starting);

    await onTimerFire(h.deps, { draftId: 'D1', expectedVersion: starting.version });

    const stored = h.persistence.drafts.get('L1#D1') as DraftState;
    expect(stored.status).toBe('ON_CLOCK');
    expect(stored.pointer).toBe(1);
    expect(stored.liveAt).toBeUndefined();
    expect(stored.version).toBe(starting.version + 1);
    expect(stored.picks).toHaveLength(0); // no pick — just the clock
    expect(h.broadcaster.typesTo('c2')).toEqual(['SYNC']);
    expect(h.scheduler.armed).toHaveLength(1); // first pick clock armed
  });
});
