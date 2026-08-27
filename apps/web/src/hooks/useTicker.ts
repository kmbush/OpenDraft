/**
 * Re-renders on an interval so a client-side countdown updates (no server tick).
 *
 * `active` matters more than it looks: a ticker at the top of a big view re-renders
 * *everything* under it on every tick, whether or not anything on screen depends
 * on the time. Park it when the current phase has no countdown to show.
 */
import { useEffect, useState } from 'react';

export function useTicker(intervalMs = 250, active = true): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    // Land on the current time immediately, so a ticker that wakes up doesn't
    // render one stale frame first.
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs, active]);
  return now;
}
