import { describe, expect, it } from 'vitest';
import { STALE_AFTER_DAYS, poolAge } from './poolAge.js';

/** Fixed "today" so these never drift with the wall clock. */
const TODAY = new Date('2026-08-26T12:00:00Z');

describe('poolAge', () => {
  it('reports a same-day snapshot as built today', () => {
    expect(poolAge('2026-08-26', TODAY)).toMatchObject({
      days: 0,
      stale: false,
      label: 'built today',
    });
  });

  it('says yesterday rather than "1 days ago"', () => {
    expect(poolAge('2026-08-25', TODAY)?.label).toBe('built yesterday');
  });

  it('counts whole days back', () => {
    expect(poolAge('2026-08-14', TODAY)).toMatchObject({ days: 12, label: 'built 12 days ago' });
  });

  it(`flags stale at ${STALE_AFTER_DAYS} days, not before`, () => {
    expect(poolAge('2026-08-20', TODAY)?.stale).toBe(false); // 6 days
    expect(poolAge('2026-08-19', TODAY)?.stale).toBe(true); // 7 days
  });

  it('flags the real-world case this was written for — a July pool in late August', () => {
    const age = poolAge('2026-07-05', TODAY);
    expect(age).toMatchObject({ days: 52, stale: true });
  });

  it('tolerates surrounding whitespace', () => {
    expect(poolAge('  2026-08-26  ', TODAY)?.days).toBe(0);
  });

  it('never reports a negative age for a future id', () => {
    expect(poolAge('2026-09-01', TODAY)).toMatchObject({ days: 0, stale: false });
  });

  it.each(['bundled', '', 'latest', '2026-8-6', 'not-a-date', '20260826'])(
    'returns null for the non-date id %o',
    (id) => {
      expect(poolAge(id, TODAY)).toBeNull();
    },
  );

  it('is unaffected by a local clock sitting near midnight', () => {
    // Same UTC date, opposite ends of the day — the day count must not move.
    const early = poolAge('2026-08-20', new Date('2026-08-26T00:00:01Z'))?.days;
    const late = poolAge('2026-08-20', new Date('2026-08-26T23:59:59Z'))?.days;
    expect(early).toBe(late);
  });
});
