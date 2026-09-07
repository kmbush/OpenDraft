import { REVEAL_PER_PICK_MS } from '@opendraft/shared';
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PACK_ID,
  REVEAL_FLUTTER_MS,
  SOUND_EVENTS,
  SOUND_PACKS,
  packById,
} from './packs.js';
import { type Layer, soundDurationMs } from './synth.js';

/**
 * Loudest instant in a sound. Summing every layer would be wrong — a drum roll's
 * hits are delayed and never peak together. What matters is what overlaps, so
 * sample the timeline and take the worst moment.
 */
const peakConcurrentGain = (layers: readonly Layer[]): number => {
  const end = Math.max(
    ...layers.map((l) => (l.delayMs ?? 0) + l.attackMs + (l.holdMs ?? 0) + l.decayMs),
  );
  let worst = 0;
  for (let t = 0; t <= end; t += 5) {
    let sum = 0;
    for (const l of layers) {
      const start = l.delayMs ?? 0;
      const stop = start + l.attackMs + (l.holdMs ?? 0) + l.decayMs;
      if (t >= start && t <= stop) sum += l.gain;
    }
    worst = Math.max(worst, sum);
  }
  return worst;
};

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
    expect(packById('arena').id).toBe('arena');
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
      'reveal-flutter': REVEAL_FLUTTER_MS, // continuous while a show is turning
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

  it('keeps the flutter under the beat that interrupts it', () => {
    // The whole point of splitting the two: a row locking only reads as a lock
    // against the clatter it stops. Level them out and the show turns to mush.
    for (const pack of SOUND_PACKS) {
      const flutter = peakConcurrentGain(pack.sounds['reveal-flutter'].layers);
      const beat = peakConcurrentGain(pack.sounds['reveal-beat'].layers);
      expect(flutter, `${pack.id} flutter vs beat`).toBeLessThan(beat * 0.6);
    }
  });

  it('keeps concurrent gain in range, so a pack cannot clip the master', () => {
    for (const pack of SOUND_PACKS) {
      for (const event of SOUND_EVENTS) {
        const peak = peakConcurrentGain(pack.sounds[event].layers);
        expect(peak, `${pack.id}/${event}`).toBeLessThanOrEqual(1.6);
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

describe('audibility', () => {
  it('keeps the tick loud enough to hear over a room', () => {
    // Offline rendering caught two packs whose tick peaked six times quieter than
    // a pick — technically present, inaudible in practice.
    for (const pack of SOUND_PACKS) {
      const loudest = (e: (typeof SOUND_EVENTS)[number]) =>
        Math.max(...pack.sounds[e].layers.map((l) => l.gain));
      expect(loudest('timer-tick'), `${pack.id} tick is too quiet`).toBeGreaterThan(
        loudest('pick-made') * 0.4,
      );
    }
  });
});

describe('the vocabulary is a game, not an app', () => {
  const layersOf = (packId: string, event: (typeof SOUND_EVENTS)[number]) =>
    packById(packId).sounds[event].layers;

  it('gives every pack a whistle, horn or drum on the clock — not a chime', () => {
    for (const pack of SOUND_PACKS) {
      const layers = pack.sounds['on-the-clock'].layers;
      const sporty = layers.some(
        (l) => l.vibrato !== undefined || l.wave === 'sawtooth' || l.wave === 'noise',
      );
      expect(sporty, `${pack.id} on-the-clock is a plain tone`).toBe(true);
    }
  });

  it('warbles the whistle — a whistle without the pea is just a beep', () => {
    const layers = layersOf('gameday', 'on-the-clock');
    const warbled = layers.filter((l) => l.vibrato);
    expect(warbled.length).toBeGreaterThan(0);
    for (const l of warbled) {
      expect(l.vibrato?.rateHz).toBeGreaterThan(20);
      expect(l.vibrato?.depthCents).toBeGreaterThan(50);
    }
  });

  it('makes the auto-pick harsh, so it can never read as a successful pick', () => {
    for (const pack of SOUND_PACKS) {
      const buzz = pack.sounds['auto-pick'].layers;
      expect(buzz.every((l) => l.wave === 'sawtooth' || l.wave === 'square')).toBe(true);
      // Low and buzzing, not a bright ping.
      expect(Math.min(...buzz.map((l) => l.freq ?? 0))).toBeLessThan(200);
    }
  });

  it('sustains the horns in the packs built on them', () => {
    // Not universal: Sideline is a drumline and has nothing to sustain. Where a
    // pack does use horns, they must hold rather than being plucked.
    for (const id of ['gameday', 'arena']) {
      const held = packById(id).sounds['draft-complete'].layers.some((l) => (l.holdMs ?? 0) > 100);
      expect(held, `${id} draft-complete has no sustain`).toBe(true);
    }
  });

  it('makes the ending the biggest thing in every pack', () => {
    for (const pack of SOUND_PACKS) {
      const ending = soundDurationMs(pack.sounds['draft-complete']);
      for (const event of ['pick-made', 'on-the-clock', 'timer-tick', 'reveal-beat'] as const) {
        expect(ending, `${pack.id}: ${event} outlasts the ending`).toBeGreaterThan(
          soundDurationMs(pack.sounds[event]),
        );
      }
    }
  });

  it('puts a crowd behind the two biggest moments', () => {
    for (const pack of SOUND_PACKS) {
      for (const event of ['draft-complete', 'reveal-finale'] as const) {
        const hasCrowd = pack.sounds[event].layers.some(
          (l) => l.wave === 'noise' && l.attackMs >= 100,
        );
        expect(hasCrowd, `${pack.id}/${event} has no crowd`).toBe(true);
      }
    }
  });
});
