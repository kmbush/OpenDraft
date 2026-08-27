/**
 * A countdown label that changes exactly when the second changes.
 *
 * A free-running `setInterval` samples the clock on its own cadence, unaligned to
 * the countdown's second boundaries — so the displayed second flips up to a full
 * interval late, and the lateness varies as the interval drifts. On a small
 * timer nobody notices. On a board-sized clock the digits visibly stick and then
 * jump, which reads as lag even when every frame is being delivered on time.
 *
 * This schedules each update *at* the next boundary instead, so the digits change
 * on the beat, and the component re-renders once per second rather than four
 * times. Still deadline-derived (AD-1): the deadline remains the only source of
 * truth, and this only decides when to look at it.
 */
import { useEffect, useState } from 'react';
import { remainingMs } from '../lib/clock.js';

/** A hair past the boundary, so the tick lands after the second has actually turned. */
const OVERSHOOT_MS = 12;

export function useDeadlineClock(deadline: number | undefined, serverOffsetMs: number): number {
  const [remaining, setRemaining] = useState(() =>
    remainingMs(deadline, serverOffsetMs, Date.now()),
  );

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;

    const tick = () => {
      const rem = remainingMs(deadline, serverOffsetMs, Date.now());
      setRemaining(rem);
      if (rem <= 0) return; // Expired: nothing left to count down to.
      // Time until the displayed second turns over. A remainder of exactly 0 means
      // we are on the boundary, so the next change is a whole second away.
      const untilFlip = rem % 1000 || 1000;
      timer = setTimeout(tick, untilFlip + OVERSHOOT_MS);
    };

    tick();
    return () => clearTimeout(timer);
  }, [deadline, serverOffsetMs]);

  return remaining;
}
