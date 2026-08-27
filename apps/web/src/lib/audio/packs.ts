/**
 * Sound packs: what the board plays, and when.
 *
 * The registry is the point. Board moments are named events, packs map every
 * event to a sound, and the pack is a plain object — so theming the room is data,
 * never a code change at the call site. `SoundPack` is a total record over
 * `SOUND_EVENTS`, which makes a pack that forgets an event a compile error rather
 * than a silence nobody notices until draft night.
 */
import type { Sound } from './synth.js';

export const SOUND_EVENTS = [
  /** A pick has landed on the board. */
  'pick-made',
  /** A new team is up — the moment someone needs to look at the screen. */
  'on-the-clock',
  /** The pick clock has crossed into its warning band. */
  'timer-warning',
  /** One second gone inside the urgent band. Rises as the clock runs out. */
  'timer-tick',
  /** The clock expired and the engine picked for them. Should not sound like a chime. */
  'auto-pick',
  /** The whole draft is over. */
  'draft-complete',
  /** One beat of a reveal show — a flap locking, a puck landing. */
  'reveal-beat',
  /** First overall. */
  'reveal-finale',
] as const;

export type SoundEvent = (typeof SOUND_EVENTS)[number];

export interface SoundPack {
  id: string;
  label: string;
  blurb: string;
  sounds: Record<SoundEvent, Sound>;
}

/** Equal-temperament helper, so packs read as notes rather than magic numbers. */
const note = (semitonesFromA4: number) => 440 * 2 ** (semitonesFromA4 / 12);

// --- Broadcast: the default. Warm, restrained, TV-desk. ---------------------

const BROADCAST: SoundPack = {
  id: 'broadcast',
  label: 'Broadcast',
  blurb: 'Warm bells and a soft desk chime. Restrained.',
  sounds: {
    // A struck bell: fundamental plus a bright, faster-decaying partial.
    'pick-made': {
      layers: [
        { wave: 'sine', freq: note(7), gain: 0.5, attackMs: 4, decayMs: 620 },
        { wave: 'sine', freq: note(19), gain: 0.22, attackMs: 4, decayMs: 380 },
        { wave: 'triangle', freq: note(26), gain: 0.08, attackMs: 2, decayMs: 180 },
      ],
    },
    // Rising two-note call — it reads as a question, which is what "you're up" is.
    'on-the-clock': {
      layers: [
        { wave: 'sine', freq: note(4), gain: 0.42, attackMs: 6, decayMs: 300 },
        { wave: 'sine', freq: note(11), gain: 0.42, attackMs: 6, decayMs: 520, delayMs: 150 },
        { wave: 'sine', freq: note(23), gain: 0.12, attackMs: 6, decayMs: 420, delayMs: 150 },
      ],
    },
    'timer-warning': {
      layers: [{ wave: 'triangle', freq: note(-5), gain: 0.3, attackMs: 6, decayMs: 340 }],
    },
    // Dry and small: this fires once a second and must never become annoying.
    'timer-tick': {
      layers: [
        {
          wave: 'noise',
          gain: 0.16,
          attackMs: 1,
          decayMs: 45,
          filter: { type: 'bandpass', freq: 2600, q: 6 },
        },
        { wave: 'square', freq: note(12), gain: 0.06, attackMs: 1, decayMs: 40 },
      ],
    },
    // Falling and slightly sour — nobody should mistake this for a real pick.
    'auto-pick': {
      layers: [
        {
          wave: 'sawtooth',
          freq: note(-2),
          freqEnd: note(-14),
          gain: 0.26,
          attackMs: 8,
          decayMs: 460,
          filter: { type: 'lowpass', freq: 1400 },
        },
      ],
    },
    'draft-complete': {
      layers: [
        { wave: 'sine', freq: note(0), gain: 0.4, attackMs: 6, decayMs: 700 },
        { wave: 'sine', freq: note(4), gain: 0.4, attackMs: 6, decayMs: 700, delayMs: 130 },
        { wave: 'sine', freq: note(7), gain: 0.4, attackMs: 6, decayMs: 800, delayMs: 260 },
        { wave: 'sine', freq: note(12), gain: 0.34, attackMs: 6, decayMs: 1100, delayMs: 390 },
      ],
    },
    // The split-flap clack: a filtered noise transient with a woody thump under it.
    'reveal-beat': {
      layers: [
        {
          wave: 'noise',
          gain: 0.3,
          attackMs: 1,
          decayMs: 55,
          filter: { type: 'bandpass', freq: 1800, q: 2.4 },
        },
        { wave: 'triangle', freq: 180, freqEnd: 90, gain: 0.16, attackMs: 1, decayMs: 70 },
      ],
    },
    'reveal-finale': {
      layers: [
        { wave: 'sine', freq: note(12), gain: 0.42, attackMs: 6, decayMs: 900 },
        { wave: 'sine', freq: note(16), gain: 0.3, attackMs: 6, decayMs: 900, delayMs: 90 },
        { wave: 'sine', freq: note(19), gain: 0.3, attackMs: 6, decayMs: 1200, delayMs: 180 },
        {
          wave: 'noise',
          gain: 0.12,
          attackMs: 40,
          decayMs: 900,
          filter: { type: 'highpass', freq: 5200 },
        },
      ],
    },
  },
};

// --- Arcade: loud, square-wave, unapologetic. -------------------------------

const ARCADE: SoundPack = {
  id: 'arcade',
  label: 'Arcade',
  blurb: 'Square waves and coin-op blips. Loud and silly.',
  sounds: {
    'pick-made': {
      layers: [
        { wave: 'square', freq: note(7), gain: 0.24, attackMs: 2, decayMs: 90 },
        { wave: 'square', freq: note(19), gain: 0.24, attackMs: 2, decayMs: 140, delayMs: 80 },
      ],
    },
    'on-the-clock': {
      layers: [
        { wave: 'square', freq: note(0), gain: 0.22, attackMs: 2, decayMs: 80 },
        { wave: 'square', freq: note(7), gain: 0.22, attackMs: 2, decayMs: 80, delayMs: 90 },
        { wave: 'square', freq: note(12), gain: 0.24, attackMs: 2, decayMs: 200, delayMs: 180 },
      ],
    },
    'timer-warning': {
      layers: [{ wave: 'square', freq: note(-7), gain: 0.2, attackMs: 2, decayMs: 220 }],
    },
    'timer-tick': {
      layers: [{ wave: 'square', freq: note(14), gain: 0.12, attackMs: 1, decayMs: 55 }],
    },
    'auto-pick': {
      layers: [
        {
          wave: 'sawtooth',
          freq: note(-2),
          freqEnd: note(-24),
          gain: 0.24,
          attackMs: 2,
          decayMs: 420,
        },
      ],
    },
    'draft-complete': {
      layers: [
        { wave: 'square', freq: note(0), gain: 0.2, attackMs: 2, decayMs: 110 },
        { wave: 'square', freq: note(4), gain: 0.2, attackMs: 2, decayMs: 110, delayMs: 110 },
        { wave: 'square', freq: note(7), gain: 0.2, attackMs: 2, decayMs: 110, delayMs: 220 },
        { wave: 'square', freq: note(12), gain: 0.22, attackMs: 2, decayMs: 420, delayMs: 330 },
      ],
    },
    'reveal-beat': {
      layers: [{ wave: 'square', freq: note(9), gain: 0.14, attackMs: 1, decayMs: 60 }],
    },
    'reveal-finale': {
      layers: [
        { wave: 'square', freq: note(12), gain: 0.2, attackMs: 2, decayMs: 120 },
        { wave: 'square', freq: note(16), gain: 0.2, attackMs: 2, decayMs: 120, delayMs: 110 },
        { wave: 'square', freq: note(24), gain: 0.24, attackMs: 2, decayMs: 700, delayMs: 220 },
      ],
    },
  },
};

// --- Stadium: low, physical, PA-system. -------------------------------------

const STADIUM: SoundPack = {
  id: 'stadium',
  label: 'Stadium',
  blurb: 'Low horns and a drum thump. Fills a room.',
  sounds: {
    'pick-made': {
      layers: [
        { wave: 'sine', freq: 70, freqEnd: 58, gain: 0.5, attackMs: 2, decayMs: 260 },
        {
          wave: 'noise',
          gain: 0.12,
          attackMs: 1,
          decayMs: 120,
          filter: { type: 'lowpass', freq: 900 },
        },
      ],
    },
    'on-the-clock': {
      layers: [
        {
          wave: 'sawtooth',
          freq: note(-12),
          gain: 0.2,
          attackMs: 40,
          decayMs: 620,
          filter: { type: 'lowpass', freq: 1100 },
        },
        {
          wave: 'sawtooth',
          freq: note(-5),
          gain: 0.18,
          attackMs: 40,
          decayMs: 700,
          filter: { type: 'lowpass', freq: 1200 },
        },
      ],
    },
    'timer-warning': {
      layers: [
        {
          wave: 'sawtooth',
          freq: note(-17),
          gain: 0.22,
          attackMs: 30,
          decayMs: 560,
          filter: { type: 'lowpass', freq: 800 },
        },
      ],
    },
    'timer-tick': {
      layers: [
        { wave: 'sine', freq: 120, freqEnd: 96, gain: 0.2, attackMs: 1, decayMs: 90 },
        {
          wave: 'noise',
          gain: 0.07,
          attackMs: 1,
          decayMs: 40,
          filter: { type: 'lowpass', freq: 600 },
        },
      ],
    },
    'auto-pick': {
      layers: [
        {
          wave: 'sawtooth',
          freq: note(-14),
          freqEnd: note(-26),
          gain: 0.26,
          attackMs: 10,
          decayMs: 620,
          filter: { type: 'lowpass', freq: 700 },
        },
      ],
    },
    'draft-complete': {
      layers: [
        {
          wave: 'sawtooth',
          freq: note(-12),
          gain: 0.22,
          attackMs: 40,
          decayMs: 1200,
          filter: { type: 'lowpass', freq: 1400 },
        },
        {
          wave: 'sawtooth',
          freq: note(-5),
          gain: 0.2,
          attackMs: 40,
          decayMs: 1200,
          filter: { type: 'lowpass', freq: 1400 },
          delayMs: 180,
        },
        {
          wave: 'sawtooth',
          freq: note(0),
          gain: 0.2,
          attackMs: 40,
          decayMs: 1600,
          filter: { type: 'lowpass', freq: 1600 },
          delayMs: 360,
        },
      ],
    },
    'reveal-beat': {
      layers: [
        { wave: 'sine', freq: 150, freqEnd: 70, gain: 0.3, attackMs: 1, decayMs: 110 },
        {
          wave: 'noise',
          gain: 0.14,
          attackMs: 1,
          decayMs: 60,
          filter: { type: 'bandpass', freq: 700, q: 1.5 },
        },
      ],
    },
    'reveal-finale': {
      layers: [
        { wave: 'sine', freq: 80, freqEnd: 62, gain: 0.5, attackMs: 2, decayMs: 900 },
        {
          wave: 'sawtooth',
          freq: note(0),
          gain: 0.2,
          attackMs: 60,
          decayMs: 1400,
          filter: { type: 'lowpass', freq: 1800 },
        },
        {
          wave: 'noise',
          gain: 0.1,
          attackMs: 120,
          decayMs: 1200,
          filter: { type: 'highpass', freq: 4000 },
        },
      ],
    },
  },
};

export const SOUND_PACKS: SoundPack[] = [BROADCAST, ARCADE, STADIUM];

export const DEFAULT_PACK_ID = BROADCAST.id;

export function packById(id: string | null | undefined): SoundPack {
  return SOUND_PACKS.find((p) => p.id === id) ?? BROADCAST;
}
