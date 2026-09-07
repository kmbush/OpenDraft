/**
 * Turns board state changes into sound events.
 *
 * Every cue fires on a *transition*, never on a render, and never on the first
 * observation: a board joining a draft already in progress must not machine-gun
 * a chime for each of the forty picks it just learned about. The first pass only
 * records where things stand.
 */
import type { DraftState } from '@opendraft/shared';
import { useEffect, useRef } from 'react';
import type { SoundEvent } from '../lib/audio/packs.js';

export function useBoardSounds(
  draft: DraftState | null | undefined,
  onClockSlot: number | null,
  play: (event: SoundEvent, velocity?: number) => void,
): void {
  // `null` until the first observation — that pass arms without firing.
  const seenPicks = useRef<number | null>(null);
  const seenSlot = useRef<number | null | undefined>(undefined);
  const seenStatus = useRef<string | null>(null);

  useEffect(() => {
    if (!draft) return;
    const picks = draft.picks.length;

    if (seenPicks.current === null) {
      seenPicks.current = picks;
      seenSlot.current = onClockSlot;
      seenStatus.current = draft.status;
      return;
    }

    if (picks > seenPicks.current) {
      const last = draft.picks.at(-1);
      // An auto-pick is a failure to pick in time; it must not sound like a chime.
      play(last?.auto ? 'auto-pick' : 'pick-made');
    }
    seenPicks.current = picks;

    // Only announce a live clock — the pointer also moves through PICK_IN, where
    // the takeover is mid-flight and a second cue would tread on it.
    if (draft.status === 'ON_CLOCK' && onClockSlot !== null && onClockSlot !== seenSlot.current) {
      play('on-the-clock');
    }
    seenSlot.current = onClockSlot;

    if (draft.status !== seenStatus.current) {
      if (draft.status === 'COMPLETE') play('draft-complete');
      seenStatus.current = draft.status;
    }
  }, [draft, onClockSlot, play]);
}

/**
 * The pick-clock cues, driven by the remaining time.
 *
 * Lives apart from the transition cues because it belongs wherever the clock is
 * — which, since the performance pass, is inside the countdown ring rather than
 * the top of the board.
 */
export function useClockSounds(
  remaining: number,
  running: boolean,
  play: (event: SoundEvent, velocity?: number) => void,
  warningMs = 30_000,
  urgentMs = 10_000,
): void {
  const warned = useRef(false);
  const lastTickSecond = useRef<number | null>(null);

  useEffect(() => {
    if (!running || remaining <= 0) {
      warned.current = false;
      lastTickSecond.current = null;
      return;
    }

    if (!warned.current && remaining <= warningMs) {
      warned.current = true;
      play('timer-warning');
    }

    if (remaining <= urgentMs) {
      const second = Math.ceil(remaining / 1000);
      if (second !== lastTickSecond.current) {
        lastTickSecond.current = second;
        // Rise into the deadline: the last tick is the loudest.
        const closeness = 1 - Math.max(0, remaining) / urgentMs;
        play('timer-tick', 0.55 + closeness * 0.65);
      }
    }
  }, [remaining, running, play, warningMs, urgentMs]);
}

/**
 * Fire a cue over and over while `active` — the clatter of a rack still turning,
 * as against the single beat of one row stopping.
 *
 * The level stays put for as long as the machine is running. A rack of flaps
 * doesn't get quieter as it empties: it clatters at one volume and then stops.
 */
export function useRepeatCue(
  active: boolean,
  event: SoundEvent,
  play: (event: SoundEvent, velocity?: number) => void,
  intervalMs: number,
): void {
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => {
      // Real flaps are never quite in unison, and identical hits read as a
      // machine gun. This is texture on a fixed level, not a fade.
      play(event, 0.92 + Math.random() * 0.16);
    }, intervalMs);
    return () => clearInterval(id);
  }, [active, event, play, intervalMs]);
}

/**
 * Fire a cue each time a counter advances — one flap locking, one puck landing.
 *
 * Reveal shows re-render every frame, so this guards on the value rather than the
 * render, and stays silent on the first observation so a board joining a show
 * mid-flight doesn't replay every beat it missed.
 */
export function useStepCue(
  count: number,
  event: SoundEvent,
  play: (event: SoundEvent, velocity?: number) => void,
): void {
  const seen = useRef<number | null>(null);
  useEffect(() => {
    if (seen.current === null) {
      seen.current = count;
      return;
    }
    if (count > seen.current) play(event);
    seen.current = count;
  }, [count, event, play]);
}
