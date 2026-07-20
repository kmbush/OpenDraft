/**
 * How many fixed-height rows fit in a list without clipping — so a rail renders
 * to the viewport it actually has instead of a hard-coded count (a 4K board wastes
 * half its rail; a laptop clips the last row mid-text).
 *
 * Row height is measured from the first rendered row rather than assumed, so font
 * scaling and style changes stay honest. Until a row exists (empty list, first
 * paint) the caller's fallback stands in.
 */
import { type RefCallback, useCallback, useRef, useState } from 'react';

export function rowCapacity(containerPx: number, rowPx: number): number {
  if (containerPx <= 0 || rowPx <= 0) return 0;
  return Math.max(1, Math.floor(containerPx / rowPx));
}

/**
 * Returns a ref callback to put on the list element, plus how many rows fit.
 *
 * A ref callback rather than a ref object because the list is mounted lazily —
 * a rail with nothing in it yet renders an empty state instead, so there is no
 * element to observe until the first row arrives. The callback fires on that
 * mount; an effect with a dependency array would either miss it or need a
 * synthetic "contents changed" dependency it never actually reads.
 */
export function useRowCapacity<T extends HTMLElement>(fallback: number): [RefCallback<T>, number] {
  const [capacity, setCapacity] = useState(fallback);
  const detach = useRef<(() => void) | null>(null);

  const attach = useCallback((el: T | null) => {
    detach.current?.();
    detach.current = null;
    if (!el) return;
    const measure = () => {
      const row = el.firstElementChild;
      if (!row) return;
      const next = rowCapacity(el.clientHeight, row.getBoundingClientRect().height);
      // Only commit real changes: this runs from a ResizeObserver, and a state
      // write on every observation would re-render in a loop.
      if (next > 0) setCapacity((prev) => (prev === next ? prev : next));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    detach.current = () => observer.disconnect();
  }, []);

  return [attach, capacity];
}
