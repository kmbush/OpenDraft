/**
 * Drives a countdown ring's stroke-dashoffset straight from the deadline on every
 * animation frame, bypassing React entirely.
 *
 * The 250ms `useTicker` re-render is the right cadence for an `m:ss` label but far
 * too coarse for a sweeping ring. A CSS transition papering over that gap drifts
 * against `setInterval`'s own jitter — each late tick restarts an interrupted
 * transition — and the ring reads as a stutter. rAF is the sweep's natural cadence
 * and costs no re-renders: the effect writes one style property on a ref.
 *
 * Still deadline-derived (AD-1) — the frame loop only decides *when* to sample.
 */
import { type RefObject, useEffect, useRef } from 'react';
import { clockFraction } from '../lib/clock.js';

export function useCountdownSweep(
  deadline: number | undefined,
  offsetMs: number,
  timerMs: number,
  circumference: number,
): RefObject<SVGCircleElement | null> {
  const ref = useRef<SVGCircleElement | null>(null);
  useEffect(() => {
    let frame = requestAnimationFrame(function draw() {
      const el = ref.current;
      if (el) {
        const fraction = clockFraction(deadline, offsetMs, Date.now(), timerMs);
        el.style.strokeDashoffset = String(circumference * (1 - fraction));
      }
      frame = requestAnimationFrame(draw);
    });
    return () => cancelAnimationFrame(frame);
  }, [deadline, offsetMs, timerMs, circumference]);
  return ref;
}
