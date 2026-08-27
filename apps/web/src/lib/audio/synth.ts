/**
 * A tiny Web Audio voice engine.
 *
 * Sounds are *synthesised*, not sampled. There are no audio files anywhere in
 * this repo and there deliberately aren't going to be: samples mean binary
 * assets in an open-source tree, licensing to answer for, and a download before
 * the room hears anything. A chime, a tick, a mechanical clack and a buzzer are
 * exactly what a couple of oscillators and an envelope do well.
 *
 * A sound is declarative data (see `packs.ts`), so a "pack" is a plain object and
 * a host can theme the room without shipping a single byte of audio.
 */

/** One scheduled voice. Layers stack to make a sound. */
export interface Layer {
  /** `noise` is a short burst of white noise — the basis of clacks and ticks. */
  wave: OscillatorType | 'noise';
  /** Hz. Ignored for noise, which is shaped by `filter` instead. */
  freq?: number;
  /** Glide to this pitch across the layer, for drops and swoops. */
  freqEnd?: number;
  /** Peak level, 0..1, before the master gain. */
  gain: number;
  attackMs: number;
  decayMs: number;
  /** Offset within the sound — this is how a chord or an arpeggio is built. */
  delayMs?: number;
  filter?: { type: BiquadFilterType; freq: number; q?: number };
}

export interface Sound {
  layers: Layer[];
}

/** Total wall time a sound occupies, for scheduling and for tests. */
export function soundDurationMs(sound: Sound): number {
  return sound.layers.reduce(
    (max, l) => Math.max(max, (l.delayMs ?? 0) + l.attackMs + l.decayMs),
    0,
  );
}

/** A short white-noise buffer, cached per context — building one per hit is wasteful. */
const noiseCache = new WeakMap<BaseAudioContext, AudioBuffer>();

function noiseBuffer(ctx: BaseAudioContext): AudioBuffer {
  const cached = noiseCache.get(ctx);
  if (cached) return cached;
  const length = Math.floor(ctx.sampleRate * 0.4);
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  // Deterministic noise: identical every run, which keeps a pack's character fixed.
  let seed = 0x2f6e2b1;
  for (let i = 0; i < length; i++) {
    seed = (Math.imul(seed, 48271) % 0x7fffffff) >>> 0;
    data[i] = (seed / 0x7fffffff) * 2 - 1;
  }
  noiseCache.set(ctx, buffer);
  return buffer;
}

/**
 * Schedule `sound` on `ctx`, starting now. Returns when the tail finishes.
 *
 * Everything is scheduled ahead on the audio clock rather than fired from
 * timers, so a busy main thread can't smear the timing — which matters on a
 * board that is also animating.
 */
export function playSound(
  ctx: AudioContext,
  destination: AudioNode,
  sound: Sound,
  velocity = 1,
): number {
  const now = ctx.currentTime;

  for (const layer of sound.layers) {
    const start = now + (layer.delayMs ?? 0) / 1000;
    const attack = Math.max(0.001, layer.attackMs / 1000);
    const decay = Math.max(0.001, layer.decayMs / 1000);
    const peak = Math.max(0.0001, layer.gain * velocity);

    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, start);
    env.gain.exponentialRampToValueAtTime(peak, start + attack);
    // Exponential decay to near-silence, then a hard zero so nothing lingers.
    env.gain.exponentialRampToValueAtTime(0.0001, start + attack + decay);
    env.gain.setValueAtTime(0, start + attack + decay);

    let node: AudioNode = env;
    if (layer.filter) {
      const biquad = ctx.createBiquadFilter();
      biquad.type = layer.filter.type;
      biquad.frequency.setValueAtTime(layer.filter.freq, start);
      if (layer.filter.q !== undefined) biquad.Q.setValueAtTime(layer.filter.q, start);
      env.connect(biquad);
      node = biquad;
    }
    node.connect(destination);

    const stop = start + attack + decay + 0.02;
    if (layer.wave === 'noise') {
      const src = ctx.createBufferSource();
      src.buffer = noiseBuffer(ctx);
      src.connect(env);
      src.start(start);
      src.stop(stop);
    } else {
      const osc = ctx.createOscillator();
      osc.type = layer.wave;
      const f = layer.freq ?? 440;
      osc.frequency.setValueAtTime(f, start);
      if (layer.freqEnd !== undefined) {
        osc.frequency.exponentialRampToValueAtTime(
          Math.max(1, layer.freqEnd),
          start + attack + decay,
        );
      }
      osc.connect(env);
      osc.start(start);
      osc.stop(stop);
    }
  }

  return soundDurationMs(sound);
}
