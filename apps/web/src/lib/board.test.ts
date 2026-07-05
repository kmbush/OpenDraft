import { roundForOverall, slotForOverallPick } from '@opendraft/engine';
import type { DraftMode, Pick } from '@opendraft/shared';
import { describe, expect, it } from 'vitest';
import { buildBoardGrid } from './board.js';

/** Build the pick log a real draft would produce for `order`/`mode`. */
function draftPicks(order: number[], rounds: number, mode: DraftMode): Pick[] {
  const teams = order.length;
  return Array.from({ length: teams * rounds }, (_, i) => {
    const overall = i + 1;
    const teamSlot = slotForOverallPick(overall, teams, order, mode);
    return {
      overall,
      round: roundForOverall(overall, teams),
      pickInRound: ((overall - 1) % teams) + 1,
      teamSlot,
      playerId: `p${overall}`,
      position: 'RB',
      madeAt: overall,
      auto: false,
    };
  });
}

describe('buildBoardGrid', () => {
  it('columns follow draft order; linear cells land under their team', () => {
    const order = [3, 1, 2];
    const grid = buildBoardGrid(draftPicks(order, 2, 'linear'), 3, 2, order);
    expect(grid.columns).toEqual([3, 1, 2]);
    // Column 0 is team 3: it picked overall 1 (round 1) and overall 4 (round 2).
    expect(grid.rows[0]?.[0]?.overall).toBe(1);
    expect(grid.rows[1]?.[0]?.overall).toBe(4);
    // Every cell belongs to its column's team, regardless of overall number.
    for (const row of grid.rows) {
      row.forEach((cell, c) => expect(cell?.teamSlot).toBe(order[c]));
    }
  });

  it('snake reversal never scrambles a column (keyed by team+round, not seat)', () => {
    const order = [1, 2, 3];
    const grid = buildBoardGrid(draftPicks(order, 2, 'snake'), 3, 2, order);
    // Round 2 seats reverse (overall 4,5,6 → teams 3,2,1), but team 1 stays in
    // column 0: its round-2 pick is overall 6.
    expect(grid.rows[0]?.[0]?.overall).toBe(1); // team 1, round 1
    expect(grid.rows[1]?.[0]?.overall).toBe(6); // team 1, round 2 (snake)
    expect(grid.rows[1]?.[2]?.overall).toBe(4); // team 3, round 2 (snake)
  });

  it('leaves cells null for an in-progress draft', () => {
    const order = [1, 2, 3];
    const partial = draftPicks(order, 3, 'snake').slice(0, 4); // 1.5 rounds
    const grid = buildBoardGrid(partial, 3, 3, order);
    expect(grid.rows).toHaveLength(3);
    expect(grid.rows[0]?.every((c) => c !== null)).toBe(true); // round 1 full
    expect(grid.rows[1]?.filter((c) => c !== null)).toHaveLength(1); // only overall 4
    expect(grid.rows[2]?.every((c) => c === null)).toBe(true); // round 3 empty
  });

  it('falls back to slot order when the draft order is unset', () => {
    const grid = buildBoardGrid([], 4, 1, []);
    expect(grid.columns).toEqual([1, 2, 3, 4]);
    expect(grid.rows[0]).toEqual([null, null, null, null]);
  });
});
