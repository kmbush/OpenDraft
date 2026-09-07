/**
 * Sound packs: what the board plays, and when.
 *
 * The registry is the point. Board moments are named events, packs map every
 * event to a sound, and the pack is a plain object — so theming the room is data,
 * never a code change at the call site. `SoundPack` is a total record over
 * `SOUND_EVENTS`, which makes a pack that forgets an event a compile error rather
 * than a silence nobody notices until draft night.
 *
 * The vocabulary is deliberately the vocabulary of a game, not of an app: a
 * referee's whistle when someone is up, a shot-clock tick running down, a buzzer
 * when the clock beats them, an air horn and a crowd when it's over. A chime is
 * what software does; this is a draft.
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
  /** The clock beat them and the engine picked instead. Must not sound like a pick. */
  'auto-pick',
  /** The whole draft is over. */
  'draft-complete',
  /**
   * The machine still running between beats — a rack of flaps mid-turn. This
   * repeats every `REVEAL_FLUTTER_MS` for as long as anything is still moving,
   * so it has to be tiny, and it has to sit well under the beat that interrupts
   * it: the lock is only audible as a lock against this.
   */
  'reveal-flutter',
  /** One beat of a reveal show — a flap locking, a puck landing. */
  'reveal-beat',
  /** First overall. */
  'reveal-finale',
] as const;

export type SoundEvent = (typeof SOUND_EVENTS)[number];

/**
 * How often `reveal-flutter` repeats while a show is still turning. Near the
 * split-flap's own 55ms drum step — fast enough to read as a rack of flaps
 * rather than a metronome, and the ceiling on how long that cue may last.
 */
export const REVEAL_FLUTTER_MS = 70;

export interface SoundPack {
  id: string;
  label: string;
  blurb: string;
  sounds: Record<SoundEvent, Sound>;
}

/** Equal-temperament helper, so brass and organ voicings read as notes. */
const note = (semitonesFromA4: number) => 440 * 2 ** (semitonesFromA4 / 12);

// --- Shared instruments -----------------------------------------------------
// Building blocks rather than one-off layer soup: the same whistle should sound
// like the same whistle wherever it turns up.

/** Referee's whistle. The fast, deep warble is the pea rattling — without it, a beep. */
const whistle = (gain: number, holdMs: number, freq = 3150): Sound['layers'] => [
  {
    wave: 'sine',
    freq,
    gain,
    attackMs: 14,
    holdMs,
    decayMs: 70,
    vibrato: { rateHz: 42, depthCents: 190 },
  },
  {
    wave: 'sine',
    freq: freq * 1.5,
    gain: gain * 0.34,
    attackMs: 14,
    holdMs,
    decayMs: 60,
    vibrato: { rateHz: 42, depthCents: 190 },
  },
  // Breath: the air behind the tone.
  {
    wave: 'noise',
    gain: gain * 0.3,
    attackMs: 14,
    holdMs,
    decayMs: 80,
    filter: { type: 'bandpass', freq: freq * 0.95, q: 3 },
  },
];

/** Stadium air horn — stacked, slightly detuned reeds under a lowpass. */
const airHorn = (gain: number, holdMs: number, root = 233): Sound['layers'] => [
  {
    wave: 'sawtooth',
    freq: root,
    gain,
    attackMs: 22,
    holdMs,
    decayMs: 280,
    filter: { type: 'lowpass', freq: 2400 },
  },
  {
    wave: 'sawtooth',
    freq: root * 1.006, // beating against the root is what makes it a horn, not a synth
    gain: gain * 0.9,
    attackMs: 22,
    holdMs,
    decayMs: 280,
    filter: { type: 'lowpass', freq: 2400 },
  },
  {
    wave: 'square',
    freq: root * 1.5,
    gain: gain * 0.3,
    attackMs: 26,
    holdMs,
    decayMs: 240,
    filter: { type: 'lowpass', freq: 3000 },
  },
];

/** Arena buzzer. Harsh on purpose — this is the sound of being beaten by the clock. */
const buzzer = (gain: number, holdMs: number): Sound['layers'] => [
  { wave: 'sawtooth', freq: 172, gain, attackMs: 4, holdMs, decayMs: 130 },
  { wave: 'square', freq: 86, gain: gain * 0.7, attackMs: 4, holdMs, decayMs: 130 },
  { wave: 'sawtooth', freq: 259, gain: gain * 0.4, attackMs: 4, holdMs, decayMs: 120 },
];

/** Crowd swell — broadband noise with a slow attack. Reads as a roar behind the hit. */
const crowd = (gain: number, attackMs: number, decayMs: number, delayMs = 0): Sound['layers'] => [
  {
    wave: 'noise',
    gain,
    attackMs,
    decayMs,
    delayMs,
    filter: { type: 'bandpass', freq: 1250, q: 0.7 },
  },
  {
    wave: 'noise',
    gain: gain * 0.6,
    attackMs: attackMs * 1.2,
    decayMs: decayMs * 1.1,
    delayMs,
    filter: { type: 'highpass', freq: 2600 },
  },
];

/**
 * Rising flourish — the sound of an announcement landing, not a klaxon going
 * off. Three notes up into a held top interval, so it resolves rather than just
 * stopping. `wave` is what separates a broadcast brass desk from an arena organ
 * playing the same figure.
 */
const fanfare = (gain: number, wave: OscillatorType = 'sawtooth', root = -8): Sound['layers'] => [
  {
    wave,
    freq: note(root),
    gain,
    attackMs: 10,
    holdMs: 80,
    decayMs: 200,
    filter: { type: 'lowpass', freq: 3200 },
  },
  {
    wave,
    freq: note(root + 5),
    gain,
    attackMs: 10,
    holdMs: 80,
    decayMs: 220,
    delayMs: 150,
    filter: { type: 'lowpass', freq: 3200 },
  },
  {
    wave,
    freq: note(root + 12),
    gain: gain * 1.15,
    attackMs: 12,
    holdMs: 520,
    decayMs: 700,
    delayMs: 300,
    filter: { type: 'lowpass', freq: 3600 },
  },
  {
    wave,
    freq: note(root + 16),
    gain: gain * 0.7,
    attackMs: 14,
    holdMs: 500,
    decayMs: 700,
    delayMs: 310,
    filter: { type: 'lowpass', freq: 3600 },
  },
];

/** Kick drum: a pitch drop is the whole trick. */
const kick = (gain: number, delayMs = 0): Sound['layers'] => [
  { wave: 'sine', freq: 155, freqEnd: 45, gain, attackMs: 2, decayMs: 160, delayMs },
];

/** Snare: noise crack over a short body tone. */
const snare = (gain: number, delayMs = 0): Sound['layers'] => [
  {
    wave: 'noise',
    gain,
    attackMs: 1,
    decayMs: 120,
    delayMs,
    filter: { type: 'highpass', freq: 1500 },
  },
  {
    wave: 'triangle',
    freq: 210,
    freqEnd: 170,
    gain: gain * 0.5,
    attackMs: 1,
    decayMs: 90,
    delayMs,
  },
];

// --- Gameday: the TV broadcast desk. Default. -------------------------------

const GAMEDAY: SoundPack = {
  id: 'gameday',
  label: 'Gameday',
  blurb: 'Broadcast brass, a ref whistle and a shot-clock tick.',
  sounds: {
    // Brass stab over a kick — the sting a broadcast drops on a highlight.
    'pick-made': {
      layers: [
        ...kick(0.42),
        {
          wave: 'sawtooth',
          freq: note(4),
          gain: 0.2,
          attackMs: 8,
          holdMs: 60,
          decayMs: 220,
          filter: { type: 'lowpass', freq: 2600 },
        },
        {
          wave: 'sawtooth',
          freq: note(11),
          gain: 0.18,
          attackMs: 8,
          holdMs: 60,
          decayMs: 260,
          filter: { type: 'lowpass', freq: 2800 },
        },
        ...crowd(0.09, 60, 420),
      ],
    },
    // Two whistle chirps: the universal "you're up".
    'on-the-clock': {
      layers: [...whistle(0.2, 90), ...whistle(0.2, 150).map((l) => ({ ...l, delayMs: 190 }))],
    },
    'timer-warning': { layers: airHorn(0.16, 220) },
    // Dry mechanical shot-clock tick. Fires ten times running, so it stays small.
    'timer-tick': {
      layers: [
        {
          wave: 'noise',
          gain: 0.34,
          attackMs: 1,
          decayMs: 42,
          filter: { type: 'bandpass', freq: 3200, q: 9 },
        },
        { wave: 'square', freq: 1180, gain: 0.15, attackMs: 1, decayMs: 30 },
      ],
    },
    'auto-pick': { layers: buzzer(0.22, 340) },
    'draft-complete': {
      layers: [
        ...airHorn(0.2, 620),
        ...airHorn(0.16, 520, note(4)).map((l) => ({ ...l, delayMs: 180 })),
        ...crowd(0.16, 260, 1200, 120),
        ...kick(0.4),
      ],
    },
    // One flap mid-turn — the dry tick under the clatter, never the lock. Loud
    // enough to be a machine running in a full room, not a hint of one.
    'reveal-flutter': {
      layers: [
        {
          wave: 'noise',
          gain: 0.2,
          attackMs: 1,
          decayMs: 34,
          filter: { type: 'bandpass', freq: 2400, q: 3.2 },
        },
        { wave: 'triangle', freq: 340, freqEnd: 190, gain: 0.1, attackMs: 1, decayMs: 30 },
      ],
    },
    // A row locking: the whole rack stopping at once. Deliberately far bigger
    // than the flutter it interrupts — that contrast is what a lock sounds like.
    'reveal-beat': {
      layers: [
        {
          wave: 'noise',
          gain: 0.34,
          attackMs: 1,
          decayMs: 78,
          filter: { type: 'bandpass', freq: 1700, q: 1.8 },
        },
        { wave: 'triangle', freq: 210, freqEnd: 84, gain: 0.22, attackMs: 1, decayMs: 150 },
        ...kick(0.26),
      ],
    },
    // The order is set. A celebration, not an air horn: the fanfare goes up and
    // the room goes up with it.
    'reveal-finale': {
      layers: [...fanfare(0.15), ...crowd(0.2, 300, 1800, 240), ...kick(0.38), ...kick(0.26, 300)],
    },
  },
};

// --- Arena: the building itself. Organ, horn, buzzer, roar. -----------------

const ARENA: SoundPack = {
  id: 'arena',
  label: 'Arena',
  blurb: 'Organ charge, air horns and a crowd that fills a room.',
  sounds: {
    // "Da-da-da-DAA" charge, compressed into two notes so it fits a pick.
    'pick-made': {
      layers: [
        {
          wave: 'square',
          freq: note(0),
          gain: 0.14,
          attackMs: 6,
          holdMs: 70,
          decayMs: 90,
          filter: { type: 'lowpass', freq: 3200 },
        },
        {
          wave: 'square',
          freq: note(5),
          gain: 0.15,
          attackMs: 6,
          holdMs: 110,
          decayMs: 220,
          delayMs: 150,
          filter: { type: 'lowpass', freq: 3200 },
        },
        ...crowd(0.1, 90, 480, 150),
      ],
    },
    'on-the-clock': { layers: airHorn(0.2, 340, note(-3)) },
    'timer-warning': { layers: airHorn(0.17, 260, note(-10)) },
    'timer-tick': {
      layers: [
        { wave: 'sine', freq: 128, freqEnd: 98, gain: 0.2, attackMs: 1, decayMs: 82 },
        {
          wave: 'noise',
          gain: 0.08,
          attackMs: 1,
          decayMs: 34,
          filter: { type: 'lowpass', freq: 900 },
        },
      ],
    },
    'auto-pick': { layers: buzzer(0.26, 460) },
    'draft-complete': {
      layers: [
        ...airHorn(0.22, 700),
        ...airHorn(0.17, 640, note(7)).map((l) => ({ ...l, delayMs: 220 })),
        ...crowd(0.2, 320, 1400, 100),
      ],
    },
    'reveal-flutter': {
      layers: [
        {
          wave: 'noise',
          gain: 0.19,
          attackMs: 1,
          decayMs: 30,
          filter: { type: 'bandpass', freq: 1500, q: 2.6 },
        },
        { wave: 'triangle', freq: 260, freqEnd: 150, gain: 0.08, attackMs: 1, decayMs: 28 },
      ],
    },
    'reveal-beat': {
      layers: [
        ...kick(0.4),
        {
          wave: 'noise',
          gain: 0.26,
          attackMs: 1,
          decayMs: 90,
          filter: { type: 'bandpass', freq: 900, q: 1.4 },
        },
        { wave: 'square', freq: 128, freqEnd: 64, gain: 0.12, attackMs: 2, decayMs: 120 },
      ],
    },
    // The organ takes the flourish and the building answers it.
    'reveal-finale': {
      layers: [
        ...fanfare(0.13, 'square', -5),
        ...crowd(0.24, 340, 2000, 260),
        ...kick(0.4),
        ...kick(0.28, 320),
      ],
    },
  },
};

// --- Sideline: the drumline. Percussive, marching, no synth. -----------------

const SIDELINE: SoundPack = {
  id: 'sideline',
  label: 'Sideline',
  blurb: 'Drumline hits, rim clicks and a coach’s whistle.',
  sounds: {
    'pick-made': { layers: [...kick(0.44), ...snare(0.24, 90), ...snare(0.2, 175)] },
    'on-the-clock': { layers: whistle(0.22, 220) },
    'timer-warning': {
      layers: [...snare(0.2), ...snare(0.18, 110), ...snare(0.16, 220)],
    },
    // Rim click: tight, woody, unmistakably a stick.
    'timer-tick': {
      layers: [
        {
          wave: 'noise',
          gain: 0.3,
          attackMs: 1,
          decayMs: 34,
          filter: { type: 'bandpass', freq: 2100, q: 7 },
        },
        { wave: 'triangle', freq: 620, freqEnd: 430, gain: 0.17, attackMs: 1, decayMs: 38 },
      ],
    },
    'auto-pick': { layers: buzzer(0.2, 300) },
    'draft-complete': {
      layers: [
        ...kick(0.44),
        ...snare(0.24, 120),
        ...snare(0.24, 240),
        ...kick(0.44, 360),
        ...crowd(0.16, 240, 1100, 300),
      ],
    },
    // Rim tick under the roll; the lock is the full drum behind it.
    'reveal-flutter': {
      layers: [
        {
          wave: 'noise',
          gain: 0.2,
          attackMs: 1,
          decayMs: 26,
          filter: { type: 'bandpass', freq: 2800, q: 6 },
        },
        { wave: 'triangle', freq: 620, freqEnd: 430, gain: 0.09, attackMs: 1, decayMs: 28 },
      ],
    },
    'reveal-beat': { layers: [...snare(0.3), ...kick(0.3)] },
    // A roll building into a crash — the drumline's version of a celebration.
    // No whistle: a whistle stops play, and this is the opposite of that.
    'reveal-finale': {
      layers: [
        ...snare(0.16),
        ...snare(0.16, 90),
        ...snare(0.18, 170),
        ...snare(0.2, 240),
        ...kick(0.4, 310),
        {
          wave: 'noise',
          gain: 0.26,
          attackMs: 3,
          decayMs: 1600,
          delayMs: 310,
          filter: { type: 'highpass', freq: 3200 },
        },
        ...crowd(0.22, 320, 1900, 300),
      ],
    },
  },
};

export const SOUND_PACKS: SoundPack[] = [GAMEDAY, ARENA, SIDELINE];

export const DEFAULT_PACK_ID = GAMEDAY.id;

export function packById(id: string | null | undefined): SoundPack {
  return SOUND_PACKS.find((p) => p.id === id) ?? GAMEDAY;
}
