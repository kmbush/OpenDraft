import type { Player } from '@opendraft/shared';
import { describe, expect, it } from 'vitest';
import { groupAvailable, playerMeta } from './pool.js';

const players: Player[] = [
  // Deliberately out of any "value" order — output must be purely alphabetical.
  { id: 'wr2', firstName: 'Amon-Ra', lastName: 'St. Brown', position: 'WR', team: 'DET', bye: 8 },
  { id: 'rb1', firstName: 'Saquon', lastName: 'Barkley', position: 'RB', team: 'PHI', bye: 9 },
  { id: 'wr1', firstName: 'Ja’Marr', lastName: 'Chase', position: 'WR', team: 'CIN', bye: 10 },
  { id: 'qb1', firstName: 'Josh', lastName: 'Allen', position: 'QB', team: 'BUF', bye: 7 },
  { id: 'lb1', firstName: 'Fred', lastName: 'Warner', position: 'LB', team: 'SF', bye: 14 },
  { id: 'rb2', firstName: 'Bijan', lastName: 'Robinson', position: 'RB', team: 'ATL', bye: 5 },
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

  it('filters by team abbr (type "BUF" → Bills players)', () => {
    const groups = groupAvailable(players, new Set(), 'buf');
    expect(groups).toHaveLength(1);
    expect(groups[0]?.players[0]?.id).toBe('qb1'); // Josh Allen, BUF
  });

  it('carries no ranking signal — only factual team/bye beyond id/name/position', () => {
    const allowed = new Set(['id', 'firstName', 'lastName', 'position', 'team', 'bye']);
    for (const p of players) {
      for (const key of Object.keys(p)) expect(allowed.has(key)).toBe(true);
    }
  });
});

describe('playerMeta (factual secondary line — CONVENTIONS §5, AD-6)', () => {
  const allen = players[3] as Player; // Josh Allen, BUF, bye 7

  it('shows team and bye when byes are enabled', () => {
    expect(playerMeta(allen, true)).toBe('BUF · Bye 7');
  });

  it('hides the bye when byes are disabled', () => {
    expect(playerMeta(allen, false)).toBe('BUF');
  });

  it('returns an empty string when there is no team or bye', () => {
    expect(playerMeta({ id: 'x', firstName: 'A', lastName: 'B', position: 'QB' }, true)).toBe('');
  });
});
