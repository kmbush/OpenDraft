/**
 * Display ordering for positions (grouping only — NOT draft value). The station
 * groups the available pool by position and sorts alphabetically within a group;
 * there is no ranking/ADP anywhere and no control to sort by it (CONVENTIONS §5).
 */
import type { Position } from '@opendraft/shared';

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

export const POSITION_LABEL: Readonly<Record<Position, string>> = {
  QB: 'Quarterbacks',
  RB: 'Running Backs',
  WR: 'Wide Receivers',
  TE: 'Tight Ends',
  K: 'Kickers',
  DEF: 'Team Defense',
  DL: 'Defensive Line',
  LB: 'Linebackers',
  DB: 'Defensive Backs',
};

export function positionRank(position: Position): number {
  const idx = POSITION_ORDER.indexOf(position);
  return idx === -1 ? POSITION_ORDER.length : idx;
}
