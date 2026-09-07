import { describe, expect, it } from 'vitest';
import { mapEnvelopeToEvent } from './envelope.js';

describe('mapEnvelopeToEvent', () => {
  it('maps SUBMIT_PICK and copies version into expectedVersion', () => {
    const r = mapEnvelopeToEvent({
      type: 'SUBMIT_PICK',
      draftId: 'D1',
      payload: { teamSlot: 1, playerId: 'p1', position: 'RB' },
      version: 5,
    });
    expect(r).toEqual({
      ok: true,
      admin: false,
      event: {
        type: 'SUBMIT_PICK',
        teamSlot: 1,
        playerId: 'p1',
        position: 'RB',
        expectedVersion: 5,
      },
    });
  });

  it('flags admin events', () => {
    expect(mapEnvelopeToEvent({ type: 'PAUSE', draftId: 'D1' })).toMatchObject({ admin: true });
    expect(
      mapEnvelopeToEvent({ type: 'SET_ORDER', draftId: 'D1', payload: { order: [2, 1] } }),
    ).toMatchObject({
      ok: true,
      admin: true,
      event: { type: 'SET_ORDER', order: [2, 1] },
    });
  });

  it('carries END_DRAFT as an admin event needing no payload', () => {
    // The console offers this button; if the envelope drops it the button is a
    // no-op the operator only discovers on the night.
    expect(mapEnvelopeToEvent({ type: 'END_DRAFT', draftId: 'D1' })).toEqual({
      ok: true,
      admin: true,
      event: { type: 'END_DRAFT' },
    });
  });

  it('rejects malformed payloads and internal/unknown types', () => {
    expect(
      mapEnvelopeToEvent({ type: 'SUBMIT_PICK', draftId: 'D1', payload: { teamSlot: 1 } }),
    ).toMatchObject({
      ok: false,
      code: 'BAD_REQUEST',
    });
    expect(
      mapEnvelopeToEvent({
        type: 'SUBMIT_PICK',
        draftId: 'D1',
        payload: { teamSlot: 1, playerId: 'p', position: 'XX' },
      }),
    ).toMatchObject({
      ok: false,
    });
    expect(mapEnvelopeToEvent({ type: 'TIMER_EXPIRE', draftId: 'D1' })).toMatchObject({
      ok: false,
    });
    expect(mapEnvelopeToEvent({ type: 'NONSENSE', draftId: 'D1' })).toMatchObject({ ok: false });
  });
});
