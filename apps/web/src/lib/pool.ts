/**
 * Pool grouping/filtering for the station — pure and rank-free. Available
 * players are grouped by position and sorted `(position, lastName, firstName)`
 * ONLY (CONVENTIONS §5, AD-6). There is deliberately no value/ADP sort option.
 */
import type { Player, Position } from '@opendraft/shared';
import { positionRank } from './positions.js';

export interface PositionGroup {
  position: Position;
  players: Player[];
}

function matches(player: Player, query: string): boolean {
  if (!query) return true;
  return `${player.firstName} ${player.lastName}`.toLowerCase().includes(query);
}

function byName(a: Player, b: Player): number {
  return a.lastName.localeCompare(b.lastName, 'en') || a.firstName.localeCompare(b.firstName, 'en');
}

/**
 * Group the available players (pool minus `takenIds`, minus an optional
 * optimistic pick) by position, alphabetical within each group, groups in
 * `POSITION_ORDER`. `filter` is a case-insensitive name substring.
 */
export function groupAvailable(
  players: Player[],
  takenIds: ReadonlySet<string>,
  filter = '',
): PositionGroup[] {
  const query = filter.trim().toLowerCase();
  const buckets = new Map<Position, Player[]>();
  for (const player of players) {
    if (takenIds.has(player.id)) continue;
    if (!matches(player, query)) continue;
    const bucket = buckets.get(player.position);
    if (bucket) bucket.push(player);
    else buckets.set(player.position, [player]);
  }
  return [...buckets.entries()]
    .map(([position, group]) => ({ position, players: group.sort(byName) }))
    .sort((a, b) => positionRank(a.position) - positionRank(b.position));
}
