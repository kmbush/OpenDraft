/**
 * The client-nudge path drives timed transitions on its OWN — independent of the
 * EventBridge backstop (DESIGN AD-1). Proves: a nudge at/after the deadline
 * advances the state; a nudge before the deadline → TOO_EARLY with no mutation;
 * the ON_CLOCK grace is enforced (and a buzzer-beater SUBMIT_PICK in that window
 * wins); concurrent nudges collapse to one commit via the version guard.
 *
 * The harness `env.now()` is fixed at 1_000_000; `liveDraft()` is ON_CLOCK with
 * `pickDeadline` 90_000 (deep in the past), so a plain nudge is well past the
 * honor deadline. Future/grace-window deadlines are set explicitly.
 */
import { type DraftState, GRACE_MS, type OutboundMessage } from '@opendraft/shared';
import { beforeEach, describe, expect, it } from 'vitest';
import { type Harness, harness, liveDraft } from '../test-helpers.js';
import { dispatchAction } from './dispatch.js';

let h: Harness;
beforeEach(() => {
  h = harness();
});

const NOW = 1_000_000; // fakeEnv.now()

function nudge(connectionId: string) {
  return dispatchAction(h.deps, connectionId, { type: 'TIMER_NUDGE', draftId: 'D1' });
}
function stored(): DraftState {
  return h.persistence.drafts.get('L1#D1') as DraftState;
}
function rejectsOfCode(code: string): OutboundMessage[] {
  return h.broadcaster.sent
    .map((s) => s.message)
    .filter((m) => m.type === 'REJECT' && m.payload.code === code);
}

describe('nudge drives the transition on its own (no scheduler)', () => {
  it('a nudge at/after the deadline auto-picks and advances ON_CLOCK → PICK_IN', async () => {
    h.persistence.seed(liveDraft()); // pickDeadline 90_000 ≪ now
    await nudge('c1');

    const s = stored();
    expect(s.version).toBe(3);
    expect(s.picks).toHaveLength(1);
    expect(s.picks[0]?.auto).toBe(true);
    expect(s.status).toBe('PICK_IN');
    // Fanned to every connection; no TOO_EARLY.
    expect(h.broadcaster.typesTo('c1')).toEqual(['PICK_MADE']);
    expect(h.broadcaster.typesTo('c2')).toEqual(['PICK_MADE']);
  });

  it('a nudge before the deadline → TOO_EARLY to the sender only, no mutation', async () => {
    h.persistence.seed({ ...liveDraft(), pickDeadline: NOW }); // honorDeadline = now + GRACE
    await nudge('c1');

    expect(stored().version).toBe(2); // untouched
    expect(stored().picks).toHaveLength(0);
    expect(h.broadcaster.messagesTo('c1')).toMatchObject([
      { type: 'REJECT', payload: { code: 'TOO_EARLY', currentVersion: 2 } },
    ]);
    expect(h.broadcaster.messagesTo('c2')).toEqual([]); // not fanned out
  });
});

describe('ON_CLOCK grace buffer (AD-11)', () => {
  it('a nudge at pickDeadline but < +GRACE is still too early', async () => {
    // now is past pickDeadline, but not past pickDeadline + GRACE_MS.
    h.persistence.seed({ ...liveDraft(), pickDeadline: NOW - (GRACE_MS - 500) });
    expect(NOW).toBeGreaterThan(NOW - (GRACE_MS - 500)); // deadline is in the past…
    await nudge('c1');

    expect(stored().picks).toHaveLength(0); // …yet the grace forbids the auto-pick
    expect(h.broadcaster.messagesTo('c1')).toMatchObject([
      { type: 'REJECT', payload: { code: 'TOO_EARLY' } },
    ]);
  });

  it('a buzzer-beater SUBMIT_PICK in the grace window wins over the auto-pick', async () => {
    h.persistence.seed({ ...liveDraft(), pickDeadline: NOW - (GRACE_MS - 500) });

    // Human pick lands during the grace window (SUBMIT_PICK has no time-gate).
    await dispatchAction(h.deps, 'c1', {
      type: 'SUBMIT_PICK',
      draftId: 'D1',
      payload: { teamSlot: 1, playerId: 'p-human', position: 'RB' },
      version: 2,
    });
    expect(stored().picks).toHaveLength(1);
    expect(stored().picks[0]).toMatchObject({ playerId: 'p-human', auto: false });

    // A late auto-pick nudge now finds PICK_IN (announcing) → too early, no clobber.
    await nudge('c2');
    expect(stored().picks).toHaveLength(1);
    expect(stored().picks[0]?.playerId).toBe('p-human');
  });
});

describe('concurrent nudges (version guard dedupe)', () => {
  it('two simultaneous nudges → exactly one commit; the loser is silent (no reject)', async () => {
    h.persistence.seed(liveDraft()); // past deadline for both
    await Promise.all([nudge('c1'), nudge('c2')]);

    // Only one transition committed.
    expect(stored().version).toBe(3);
    expect(stored().picks).toHaveLength(1);

    // One auto-pick fanned out (to c1 and c2). The loser's nudge lost the version
    // race and gets NO reject — a nudge is not a user action, and surfacing
    // STALE_VERSION would read as if the user's pick was rejected. The winning
    // PICK_MADE broadcast corrects the loser.
    const pickMades = h.broadcaster.sent.filter((s) => s.message.type === 'PICK_MADE');
    expect(pickMades).toHaveLength(2);
    expect(rejectsOfCode('STALE_VERSION')).toHaveLength(0);
    expect(rejectsOfCode('TOO_EARLY')).toHaveLength(0);
  });
});
