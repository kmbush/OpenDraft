import { REVEAL_PER_PICK_MS } from '@opendraft/shared';
import { describe, expect, it } from 'vitest';
import { DEFAULT_PACK_ID, SOUND_EVENTS, SOUND_PACKS, packById } from './packs.js';
import { soundDurationMs } from './synth.js';

describe('sound packs', () => {
  it('every pack covers every event — a missing cue is silence nobody notices', () => {
    for (const pack of SOUND_PACKS) {
      for (const event of SOUND_EVENTS) {
        expect(pack.sounds[event], `${pack.id} is missing ${event}`).toBeDefined();
        expect(pack.sounds[event].layers.length).toBeGreaterThan(0);
      }
    }
  });

  it('has unique pack ids', () => {
    expect(new Set(SOUND_PACKS.map((p) => p.id)).size).toBe(SOUND_PACKS.length);
  });

  it('resolves a known id, and falls back rather than throwing on a bad one', () => {
    expect(packById('arcade').id).toBe('arcade');
    expect(packById('does-not-exist').id).toBe(DEFAULT_PACK_ID);
    expect(packById(null).id).toBe(DEFAULT_PACK_ID);
    expect(packById(undefined).id).toBe(DEFAULT_PACK_ID);
  });

  it('keeps the per-second tick short — it fires ten times in a row', () => {
    for (const pack of SOUND_PACKS) {
      expect(soundDurationMs(pack.sounds['timer-tick'])).toBeLessThan(250);
    }
  });

  it('gives the finale more room than a routine pick', () => {
    for (const pack of SOUND_PACKS) {
      expect(soundDurationMs(pack.sounds['reveal-finale'])).toBeGreaterThan(
        soundDurationMs(pack.sounds['pick-made']),
      );
    }
  });

  it('fits every repeating cue inside the cadence it actually fires at', () => {
    // The bound that matters is per-cue, not global: a cue must finish before the
    // next one of its kind starts, or they stack. Terminal one-shots
    // (draft-complete, reveal-finale) are deliberately allowed to ring on.
    const cadenceMs: Partial<Record<(typeof SOUND_EVENTS)[number], number>> = {
      'timer-tick': 1000, // once a second through the urgent band
      'reveal-beat': REVEAL_PER_PICK_MS, // one per reveal beat
    };
    for (const pack of SOUND_PACKS) {
      for (const [event, cadence] of Object.entries(cadenceMs)) {
        const dur = soundDurationMs(pack.sounds[event as (typeof SOUND_EVENTS)[number]]);
        expect(dur, `${pack.id}/${event}`).toBeLessThan(cadence as number);
      }
    }
  });

  it('keeps the terminal swells long enough to feel like an ending', () => {
    for (const pack of SOUND_PACKS) {
      expect(soundDurationMs(pack.sounds['draft-complete'])).toBeGreaterThan(500);
    }
  });

  it('keeps layer gains in range, so a pack cannot clip the master', () => {
    for (const pack of SOUND_PACKS) {
      for (const event of SOUND_EVENTS) {
        const total = pack.sounds[event].layers.reduce((sum, l) => sum + l.gain, 0);
        expect(total, `${pack.id}/${event}`).toBeLessThanOrEqual(1.6);
        for (const l of pack.sounds[event].layers) {
          expect(l.gain).toBeGreaterThan(0);
          expect(l.gain).toBeLessThanOrEqual(1);
        }
      }
    }
  });

  it('gives every pitched layer a frequency, and noise a filter to shape it', () => {
    for (const pack of SOUND_PACKS) {
      for (const event of SOUND_EVENTS) {
        for (const l of pack.sounds[event].layers) {
          if (l.wave === 'noise') continue;
          expect(l.freq, `${pack.id}/${event}`).toBeGreaterThan(0);
          expect(l.freq).toBeLessThan(20_000);
        }
      }
    }
  });

  it('never schedules a zero-length envelope', () => {
    for (const pack of SOUND_PACKS) {
      for (const event of SOUND_EVENTS) {
        for (const l of pack.sounds[event].layers) {
          expect(l.attackMs).toBeGreaterThan(0);
          expect(l.decayMs).toBeGreaterThan(0);
        }
      }
    }
  });
});

describe('soundDurationMs', () => {
  it('spans the longest layer, delay included', () => {
    expect(
      soundDurationMs({
        layers: [
          { wave: 'sine', freq: 440, gain: 0.5, attackMs: 10, decayMs: 100 },
          { wave: 'sine', freq: 660, gain: 0.5, attackMs: 10, decayMs: 100, delayMs: 300 },
        ],
      }),
    ).toBe(410);
  });

  it('is zero for a sound with no layers', () => {
    expect(soundDurationMs({ layers: [] })).toBe(0);
  });
});
