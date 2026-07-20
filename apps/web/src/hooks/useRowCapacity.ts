/**
 * How many fixed-height rows fit in a list without clipping — so a rail renders
 * to the viewport it actually has instead of a hard-coded count (a 4K board wastes
 * half its rail; a laptop clips the last row mid-text).
 *
 * Row height is measured from the first rendered row rather than assumed, so font
 * scaling and style changes stay honest. Until a row exists (empty list, first
 * paint) the caller's fallback stands in; the observer corrects it on the next frame.
 */
import { type RefObject, useEffect, useRef, useState } from 'react';

export function rowCapacity(containerPx: number, rowPx: number): number {
  if (containerPx <= 0 || rowPx <= 0) return 0;
  return Math.max(1, Math.floor(containerPx / rowPx));
}

/**
 * `revision` should change whenever the list's contents do — the observer alone
 * can't see the first row arriving into an empty list, because the list box
 * itself never changes size when a child is added to it.
 */
export function useRowCapacity<T extends HTMLElement>(
  fallback: number,
  revision: unknown,
): [RefObject<T | null>, number] {
  const ref = useRef<T | null>(null);
  const [capacity, setCapacity] = useState(fallback);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      const row = el.firstElementChild;
      if (!row) return;
      const rowPx = row.getBoundingClientRect().height;
      const next = rowCapacity(el.clientHeight, rowPx);
      // Only commit real changes — this runs inside a ResizeObserver, and writing
      // an identical value every observation would loop.
      if (next > 0) setCapacity((prev) => (prev === next ? prev : next));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [revision]);

  return [ref, capacity];
}
