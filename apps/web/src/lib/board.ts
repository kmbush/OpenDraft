/**
 * Post-draft board grid: fold the append-only pick log into a teams×rounds
 * recap grid for the /export view. Columns are team slots in draft-order; each
 * cell is the pick that team made in that round. Derived purely from each pick's
 * `teamSlot` + `round`, so snake direction never scrambles a column (a cell is
 * "team T's pick in round R" regardless of which seat picked when). Empty cells
 * (an in-progress draft) are `null`.
 */
import type { Pick } from '@opendraft/shared';

export interface BoardGrid {
  /** Team slots in column order: draft-order, falling back to 1..teams. */
  columns: number[];
  /** rows[r][c] = the pick `columns[c]` made in round r+1, or null. */
  rows: (Pick | null)[][];
}

export function buildBoardGrid(
  picks: Pick[],
  teams: number,
  rounds: number,
  order: number[],
): BoardGrid {
  const columns =
    order.length === teams ? [...order] : Array.from({ length: teams }, (_, i) => i + 1);
  const columnOf = new Map(columns.map((slot, i) => [slot, i]));
  const rows: (Pick | null)[][] = Array.from({ length: rounds }, () =>
    Array.from({ length: teams }, () => null),
  );
  for (const pick of picks) {
    const c = columnOf.get(pick.teamSlot);
    const row = rows[pick.round - 1];
    if (c !== undefined && row) row[c] = pick;
  }
  return { columns, rows };
}
