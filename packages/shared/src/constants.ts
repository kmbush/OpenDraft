/**
 * Shared constants (UPPER_SNAKE, CONVENTIONS §3).
 */
import type { Position } from './domain.js';

/** Flex eligibility sets — data, not code (DESIGN §4). */
export const FLEX_ELIGIBILITY: readonly Position[] = ['RB', 'WR', 'TE'];
export const SUPERFLEX_ELIGIBILITY: readonly Position[] = ['QB', 'RB', 'WR', 'TE'];
export const IDP_FLEX_ELIGIBILITY: readonly Position[] = ['DL', 'LB', 'DB'];

/** Position groups used by pool selection and roster config. */
export const OFFENSE_POSITIONS: readonly Position[] = ['QB', 'RB', 'WR', 'TE', 'K', 'DEF'];
export const IDP_POSITIONS: readonly Position[] = ['DL', 'LB', 'DB'];

/**
 * Position grouping order (offense, then IDP) shared by the served-pool sort and
 * the client's position grouping. Grouping only — NEVER a draft-value/ADP signal
 * (DESIGN AD-6, CONVENTIONS §5). Within a group, callers sort alphabetically.
 */
export const POSITION_ORDER: readonly Position[] = [
  'QB',
  'RB',
  'WR',
  'TE',
  'K',
  'DEF',
  'DL',
  'LB',
  'DB',
];

export function positionRank(position: Position): number {
  const idx = POSITION_ORDER.indexOf(position);
  return idx === -1 ? POSITION_ORDER.length : idx;
}
