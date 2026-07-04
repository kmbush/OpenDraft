import type { Player } from '@opendraft/shared';
import { describe, expect, it } from 'vitest';
import { groupAvailable } from './pool.js';

const players: Player[] = [
  // Deliberately out of any "value" order — output must be purely alphabetical.
  { id: 'wr2', firstName: 'Amon-Ra', lastName: 'St. Brown', position: 'WR' },
  { id: 'rb1', firstName: 'Saquon', lastName: 'Barkley', position: 'RB' },
  { id: 'wr1', firstName: 'Ja’Marr', lastName: 'Chase', position: 'WR' },
  { id: 'qb1', firstName: 'Josh', lastName: 'Allen', position: 'QB' },
  { id: 'lb1', firstName: 'Fred', lastName: 'Warner', position: 'LB' },
  { id: 'rb2', firstName: 'Bijan', lastName: 'Robinson', position: 'RB' },
];

describe('groupAvailable (ordering invariant — CONVENTIONS §5)', () => {
  it('groups by POSITION_ORDER and sorts alphabetically within a group', () => {
    const groups = groupAvailable(players, new Set());
    expect(groups.map((g) => g.position)).toEqual(['QB', 'RB', 'WR', 'LB']);
    // RB group alphabetical by last name (Barkley before Robinson), NOT by value.
    expect(groups[1]?.players.map((p) => p.lastName)).toEqual(['Barkley', 'Robinson']);
    // WR group: Chase before St. Brown.
    expect(groups[2]?.players.map((p) => p.lastName)).toEqual(['Chase', 'St. Brown']);
  });

  it('excludes taken players', () => {
    const groups = groupAvailable(players, new Set(['rb1']));
    const rb = groups.find((g) => g.position === 'RB');
    expect(rb?.players.map((p) => p.id)).toEqual(['rb2']);
  });

  it('filters by case-insensitive name substring', () => {
    const groups = groupAvailable(players, new Set(), 'bar');
    expect(groups).toHaveLength(1);
    expect(groups[0]?.players[0]?.id).toBe('rb1'); // Barkley
  });

  it('has no ranking data to sort by — Player carries only id/name/position', () => {
    const keys = new Set(Object.keys(players[0] as object));
    expect(keys).toEqual(new Set(['id', 'firstName', 'lastName', 'position']));
  });
});
