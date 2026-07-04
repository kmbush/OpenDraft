import type { DraftState } from '@opendraft/shared';
import { beforeEach, describe, expect, it } from 'vitest';
import { type Harness, harness, liveDraft } from '../test-helpers.js';
import { issueSession } from './auth.js';
import { dispatchAction, sendSync } from './dispatch.js';

let h: Harness;
beforeEach(() => {
  h = harness();
  h.persistence.seed(liveDraft());
});

function submit(version: number | undefined, teamSlot: number, playerId: string) {
  return dispatchAction(h.deps, 'c1', {
    type: 'SUBMIT_PICK',
    draftId: 'D1',
    payload: { teamSlot, playerId, position: 'RB' },
    ...(version !== undefined ? { version } : {}),
  });
}

describe('happy-path pick', () => {
  it('persists the pick, fans PICK_MADE to all connections, and arms the timer', async () => {
    await submit(2, 1, 'p1');

    const stored = h.persistence.drafts.get('L1#D1') as DraftState;
    expect(stored.version).toBe(3);
    expect(stored.picks.map((p) => p.playerId)).toEqual(['p1']);

    // Broadcast to both connections (sender c1 included = ack).
    expect(h.broadcaster.typesTo('c1')).toEqual(['PICK_MADE']);
    expect(h.broadcaster.typesTo('c2')).toEqual(['PICK_MADE']);

    // Next clock armed at the new version.
    expect(h.scheduler.armed).toHaveLength(1);
    expect(h.scheduler.armed[0]).toMatchObject({ draftId: 'D1', version: 3 });
  });
});

describe('rejections surface as REJECT to the sender only', () => {
  it('stale expectedVersion → REJECT{currentVersion}, no mutation, no broadcast', async () => {
    await submit(99, 1, 'p1');
    const stored = h.persistence.drafts.get('L1#D1') as DraftState;
    expect(stored.version).toBe(2); // unchanged
    expect(h.broadcaster.messagesTo('c1')).toMatchObject([
      { type: 'REJECT', payload: { code: 'STALE_VERSION', currentVersion: 2 } },
    ]);
    expect(h.broadcaster.messagesTo('c2')).toEqual([]);
    expect(h.scheduler.armed).toEqual([]);
  });

  it('wrong team → REJECT WRONG_TEAM, no broadcast', async () => {
    await submit(2, 2, 'p1');
    expect(h.broadcaster.messagesTo('c1')).toMatchObject([
      { type: 'REJECT', payload: { code: 'WRONG_TEAM' } },
    ]);
    expect(h.broadcaster.messagesTo('c2')).toEqual([]);
  });

  it('already-taken player → REJECT PLAYER_TAKEN', async () => {
    await submit(2, 1, 'dup'); // team 1 takes dup (version → 3)
    await submit(3, 2, 'dup'); // team 2 tries the same player
    const last = h.broadcaster.messagesTo('c1').at(-1);
    expect(last).toMatchObject({ type: 'REJECT', payload: { code: 'PLAYER_TAKEN' } });
  });

  it('a concurrent commit race → REJECT STALE_VERSION from the version guard', async () => {
    // Simulate the DynamoDB conditional-write losing to a concurrent Lambda:
    // the engine accepts the event, but commit reports a moved version.
    h.persistence.commit = async () => ({ ok: false, currentVersion: 7 });
    await submit(2, 1, 'p1');
    expect(h.broadcaster.messagesTo('c1')).toMatchObject([
      { type: 'REJECT', payload: { code: 'STALE_VERSION', currentVersion: 7 } },
    ]);
    expect(h.broadcaster.messagesTo('c2')).toEqual([]);
  });
});

describe('SYNC', () => {
  it('sends the full snapshot with serverNow to the requester only', async () => {
    await sendSync(h.deps, 'c1', 'D1');
    const msg = h.broadcaster.messagesTo('c1')[0];
    expect(msg?.type).toBe('SYNC');
    expect(msg).toMatchObject({ payload: { serverNow: 1_000_000 } });
    expect((msg as { payload: { state: DraftState } }).payload.state.draftId).toBe('D1');
    expect(h.broadcaster.messagesTo('c2')).toEqual([]);
  });
});

describe('admin gating (AD-8)', () => {
  it('rejects an admin event with no session token, without mutating', async () => {
    await dispatchAction(h.deps, 'c1', { type: 'PAUSE', draftId: 'D1', payload: {} });
    expect(h.broadcaster.messagesTo('c1')).toMatchObject([
      { type: 'REJECT', payload: { code: 'UNAUTHORIZED' } },
    ]);
    expect((h.persistence.drafts.get('L1#D1') as DraftState).status).toBe('ON_CLOCK');
  });

  it('accepts an admin event with a valid session token', async () => {
    const { token } = await issueSession(h.deps.secrets, 'L1', h.deps.env.now(), 3600);
    await dispatchAction(h.deps, 'c1', { type: 'PAUSE', draftId: 'D1', payload: {}, token });
    expect((h.persistence.drafts.get('L1#D1') as DraftState).status).toBe('PAUSED');
    expect(h.broadcaster.typesTo('c2')).toEqual(['SYNC']); // fanned out
    expect(h.scheduler.canceled).toContain('D1'); // clock canceled on pause
  });
});
