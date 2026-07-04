/**
 * Shared constants (UPPER_SNAKE, CONVENTIONS §3).
 */
import type { Position, RosterFormat } from './domain.js';

/** Flex eligibility sets — data, not code (DESIGN §4). */
export const FLEX_ELIGIBILITY: readonly Position[] = ['RB', 'WR', 'TE'];
export const SUPERFLEX_ELIGIBILITY: readonly Position[] = ['QB', 'RB', 'WR', 'TE'];
export const IDP_FLEX_ELIGIBILITY: readonly Position[] = ['DL', 'LB', 'DB'];

/** Position groups used by pool selection and roster config. */
export const OFFENSE_POSITIONS: readonly Position[] = ['QB', 'RB', 'WR', 'TE', 'K', 'DEF'];
export const IDP_POSITIONS: readonly Position[] = ['DL', 'LB', 'DB'];

export const DEFAULT_TIMER_SEC = 90;
export const DEFAULT_WAITING_SEC = 8;

/**
 * A sensible standard-redraft roster preset (1QB, 2RB, 2WR, 1TE, 1FLEX, K, DEF,
 * 6 bench). `positionMax` caps keep auto-pick sane. Admin-editable; IDP/SUPERFLEX
 * presets are just different data (DESIGN §4, §14 open question on defaults).
 */
export const DEFAULT_ROSTER_PRESET: RosterFormat = {
  starters: { QB: 1, RB: 2, WR: 2, TE: 1, K: 1, DEF: 1 },
  flex: [{ kind: 'FLEX', eligible: [...FLEX_ELIGIBILITY], count: 1 }],
  bench: 6,
  positionMax: { QB: 4, RB: 8, WR: 8, TE: 3, K: 3, DEF: 3 },
};
