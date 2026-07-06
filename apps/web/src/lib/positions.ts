/**
 * Display ordering for positions (grouping only — NOT draft value). The station
 * groups the available pool by position and sorts alphabetically within a group;
 * there is no ranking/ADP anywhere and no control to sort by it (CONVENTIONS §5).
 */
import type { Position } from '@opendraft/shared';

// Position ordering + rank live in `@opendraft/shared` (single-sourced with the
// pool builder's output sort); re-exported here so local imports stay stable.
export { POSITION_ORDER, positionRank } from '@opendraft/shared';

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

/**
 * Broadcast position color-coding for badges (board §7). Hex so callers can
 * derive tinted fills/borders (e.g. `${c}22`) inline — NOT a value/ranking
 * signal, purely a category cue. Offense reads warm→cool, IDP in teal/cyan.
 */
export const POSITION_COLOR: Readonly<Record<Position, string>> = {
  QB: '#ef4444', // red
  RB: '#22c55e', // green
  WR: '#3b82f6', // blue
  TE: '#f97316', // orange
  K: '#a855f7', // purple
  DEF: '#64748b', // slate
  DL: '#14b8a6', // teal
  LB: '#22d3ee', // cyan
  DB: '#38bdf8', // sky/cyan
};
