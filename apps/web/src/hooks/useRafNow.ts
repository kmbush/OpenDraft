/**
 * A clock that ticks every animation frame.
 *
 * The board runs on `useTicker`'s 250ms cadence, which is right for an `m:ss`
 * label and far too coarse for anything mechanical: at 4fps a split-flap drum
 * skips several letters between frames (so it reads as noise rather than a
 * spinning drum) and a falling puck teleports between positions.
 *
 * Reveal shows opt into this instead. Unlike `useCountdownSweep` — which writes
 * one style property on a ref to avoid re-rendering at all — a reveal has dozens
 * of independently moving elements, so it re-renders, and it can afford to: the
 * show is full-screen and short-lived, with nothing else on the board competing.
 *
 * Pass `active: false` to park the loop; the pre-show countdown doesn't need it.
 */
import { useEffect, useState } from 'react';

export function useRafNow(active = true): number {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!active) return;
    let frame = requestAnimationFrame(function tick() {
      setNow(Date.now());
      frame = requestAnimationFrame(tick);
    });
    return () => cancelAnimationFrame(frame);
  }, [active]);

  return now;
}
