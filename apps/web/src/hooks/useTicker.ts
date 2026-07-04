/** Re-renders on an interval so a client-side countdown updates (no server tick). */
import { useEffect, useState } from 'react';

export function useTicker(intervalMs = 250): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}
