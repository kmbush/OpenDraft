/**
 * The board's sound.
 *
 * Two constraints shape this, and both are the browser's, not ours:
 *
 * 1. **Audio needs a user gesture.** A board opened and left alone cannot start
 *    an AudioContext by itself, exactly as it cannot enter fullscreen by itself.
 *    So sound is opt-in by construction — the click that turns it on *is* the
 *    gesture. A remembered preference still needs one gesture after a reload, so
 *    we arm a one-shot listener and resume on the first interaction of any kind.
 * 2. **A suspended context silently swallows everything.** Browsers suspend on
 *    tab hide and sometimes on their own, so every play attempts a resume first
 *    rather than assuming the context that worked a minute ago still does.
 *
 * Beyond that: sound in a room full of people is the one thing that can actively
 * ruin the event if it misfires, so it is off until asked for, and one control
 * silences everything instantly.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { DEFAULT_PACK_ID, type SoundEvent, packById } from '../lib/audio/packs.js';
import { playSound } from '../lib/audio/synth.js';

const ENABLED_KEY = 'opendraft.sound.enabled';
const PACK_KEY = 'opendraft.sound.pack';
const VOLUME_KEY = 'opendraft.sound.volume';

/** Comfortable default for a room; the board is usually the loudest thing in it. */
const DEFAULT_VOLUME = 0.7;

function readStored<T>(key: string, parse: (raw: string) => T, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? fallback : parse(raw);
  } catch {
    // Private mode, blocked storage: preferences just don't persist.
    return fallback;
  }
}

function store(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* not fatal */
  }
}

export interface Soundboard {
  enabled: boolean;
  /** False where Web Audio is unavailable — the control hides rather than lying. */
  supported: boolean;
  packId: string;
  volume: number;
  toggle(): void;
  setPack(id: string): void;
  setVolume(v: number): void;
  /** Fire an event. A no-op when disabled, so callers never have to check. */
  play(event: SoundEvent, velocity?: number): void;
}

export function useSoundboard(): Soundboard {
  const supported =
    typeof window !== 'undefined' &&
    typeof (
      window.AudioContext ?? (window as { webkitAudioContext?: unknown }).webkitAudioContext
    ) !== 'undefined';

  const [enabled, setEnabled] = useState(() => readStored(ENABLED_KEY, (v) => v === 'true', false));
  const [packId, setPackIdState] = useState(() => readStored(PACK_KEY, (v) => v, DEFAULT_PACK_ID));
  const [volume, setVolumeState] = useState(() =>
    readStored(VOLUME_KEY, (v) => Number.parseFloat(v) || DEFAULT_VOLUME, DEFAULT_VOLUME),
  );

  const ctxRef = useRef<AudioContext | null>(null);
  const masterRef = useRef<GainNode | null>(null);

  const ensureContext = useCallback((): AudioContext | null => {
    if (!supported) return null;
    if (!ctxRef.current) {
      const Ctor =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new Ctor();
      const master = ctx.createGain();
      master.gain.value = volume;
      master.connect(ctx.destination);
      ctxRef.current = ctx;
      masterRef.current = master;
    }
    return ctxRef.current;
  }, [supported, volume]);

  // Keep the master in step with the slider without rebuilding the graph.
  useEffect(() => {
    if (masterRef.current) masterRef.current.gain.value = volume;
  }, [volume]);

  // A remembered preference still needs one gesture after a reload. Arm a
  // one-shot listener rather than leaving the board silently muted.
  useEffect(() => {
    if (!enabled || !supported) return;
    const wake = () => {
      const ctx = ensureContext();
      void ctx?.resume().catch(() => {});
    };
    const opts = { once: true, passive: true } as const;
    window.addEventListener('pointerdown', wake, opts);
    window.addEventListener('keydown', wake, opts);
    return () => {
      window.removeEventListener('pointerdown', wake);
      window.removeEventListener('keydown', wake);
    };
  }, [enabled, supported, ensureContext]);

  // Release the hardware when sound is switched off; a suspended context left
  // open keeps an audio device claimed for no reason.
  useEffect(() => {
    if (enabled) return;
    const ctx = ctxRef.current;
    if (!ctx) return;
    ctxRef.current = null;
    masterRef.current = null;
    void ctx.close().catch(() => {});
  }, [enabled]);

  useEffect(() => {
    return () => {
      void ctxRef.current?.close().catch(() => {});
      ctxRef.current = null;
    };
  }, []);

  const toggle = useCallback(() => {
    setEnabled((was) => {
      const next = !was;
      store(ENABLED_KEY, String(next));
      // This call is inside the click, which is what makes the context startable.
      if (next) {
        const ctx = ensureContext();
        void ctx?.resume().catch(() => {});
      }
      return next;
    });
  }, [ensureContext]);

  const setPack = useCallback((id: string) => {
    setPackIdState(id);
    store(PACK_KEY, id);
  }, []);

  const setVolume = useCallback((v: number) => {
    const clamped = Math.max(0, Math.min(1, v));
    setVolumeState(clamped);
    store(VOLUME_KEY, String(clamped));
  }, []);

  const play = useCallback(
    (event: SoundEvent, velocity = 1) => {
      if (!enabled) return;
      const ctx = ensureContext();
      const master = masterRef.current;
      if (!ctx || !master) return;
      // Cheap and idempotent; a context can be suspended out from under us.
      if (ctx.state === 'suspended') void ctx.resume().catch(() => {});
      playSound(ctx, master, packById(packId).sounds[event], velocity);
    },
    [enabled, packId, ensureContext],
  );

  return useMemo(
    () => ({ enabled, supported, packId, volume, toggle, setPack, setVolume, play }),
    [enabled, supported, packId, volume, toggle, setPack, setVolume, play],
  );
}
