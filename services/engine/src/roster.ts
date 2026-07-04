/**
 * Roster legality helpers (DESIGN AD-11). Per-team position counts are derived
 * from the append-only pick log — never stored separately — so undo/edit stay
 * correct for free. A position absent from `positionMax` is treated as uncapped.
 */
import type { DraftState, PlayerRef, Position, RosterFormat } from '@opendraft/shared';

/** Count of players already drafted by a team, keyed by position. */
export function rosterCounts(
  state: DraftState,
  teamSlot: number,
): Partial<Record<Position, number>> {
  const counts: Partial<Record<Position, number>> = {};
  for (const pick of state.picks) {
    if (pick.teamSlot === teamSlot) {
      counts[pick.position] = (counts[pick.position] ?? 0) + 1;
    }
  }
  return counts;
}

/** True iff the team can still add a player at `position` under its caps. */
export function hasCapacity(
  counts: Partial<Record<Position, number>>,
  position: Position,
  format: RosterFormat,
): boolean {
  const max = format.positionMax[position];
  if (max === undefined) return true;
  return (counts[position] ?? 0) < max;
}

/**
 * The legal auto-pick candidates: available players whose position still has
 * roster capacity for the team on the clock. If every candidate is capped
 * (total roster capacity reached — shouldn't happen mid-draft) the caller falls
 * back to the full available set (AD-11 edge case).
 */
export function legalCandidates(
  available: PlayerRef[],
  counts: Partial<Record<Position, number>>,
  format: RosterFormat,
): PlayerRef[] {
  return available.filter((player) => hasCapacity(counts, player.position, format));
}
