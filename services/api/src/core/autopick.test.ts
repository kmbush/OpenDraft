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
    // Team 1 manually takes rb1 → version 3, team 2 now on the clock.
    const afterFirst = reduce(
      liveDraft(),
      { type: 'SUBMIT_PICK', teamSlot: 1, playerId: 'rb1', position: 'RB', expectedVersion: 2 },
      { now: 0 },
    ).state;
    h.persistence.seed(afterFirst);

    await onTimerFire(h.deps, { draftId: 'D1', expectedVersion: 3 });
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
