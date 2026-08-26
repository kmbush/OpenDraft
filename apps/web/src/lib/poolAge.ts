/**
 * How old a pool snapshot is, read from its id.
 *
 * Published snapshot ids are build dates (`YYYY-MM-DD`), so the id itself carries
 * the age — no extra field and no server round trip. Ids that aren't dates (the
 * `bundled` fallback, a hand-typed name) simply have no age to report.
 *
 * This exists because the admin used to show only a player count, and a pool built
 * in July reads exactly like one built this morning: "444 players" either way.
 */

/** A pool this old or older is called out — rosters move through preseason. */
export const STALE_AFTER_DAYS = 7;

export interface PoolAge {
  /** Whole days between the snapshot date and today. Negative ids are treated as 0. */
  days: number;
  stale: boolean;
  /** Short human label: "built today", "built 12 days ago". */
  label: string;
}

const DATE_ID = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * Age of a snapshot id, or `null` when the id is not a date.
 * `today` is injected so this stays pure and testable.
 */
export function poolAge(snapshotId: string, today: Date = new Date()): PoolAge | null {
  const m = DATE_ID.exec(snapshotId.trim());
  if (!m) return null;

  const [, y, mo, d] = m;
  const built = Date.UTC(Number(y), Number(mo) - 1, Number(d));
  if (Number.isNaN(built)) return null;
  // Compare date-to-date in UTC so a local clock near midnight can't shift the count.
  const now = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());

  const days = Math.max(0, Math.round((now - built) / 86_400_000));
  return {
    days,
    stale: days >= STALE_AFTER_DAYS,
    label: days === 0 ? 'built today' : days === 1 ? 'built yesterday' : `built ${days} days ago`,
  };
}
