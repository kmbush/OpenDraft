/**
 * Snake / linear draft ordering — the ONE and ONLY implementation (DESIGN §5.3,
 * CONVENTIONS §10). Pure functions over 1-based overall pick numbers. The client
 * imports these to preview "who's next"; the authority imports them to validate.
 * Never reimplement ordering in a handler or component.
 */
import type { DraftMode } from '@opendraft/shared';

/** 1-based round number (round 1 covers overall 1..teams). */
export function roundForOverall(overall: number, teams: number): number {
  return Math.ceil(overall / teams);
}

/** 0-based position within the round (0..teams-1). */
export function indexInRound(overall: number, teams: number): number {
  return (overall - 1) % teams;
}

/** 1-based position within the round (1..teams). */
export function pickInRound(overall: number, teams: number): number {
  return indexInRound(overall, teams) + 1;
}

/**
 * The team slot picking at a given 1-based `overall`.
 * Linear: every round follows `order`. Snake: even rounds walk `order` reversed.
 * `order` is a permutation of the team slots (length === teams).
 */
export function slotForOverallPick(
  overall: number,
  teams: number,
  order: number[],
  mode: DraftMode,
): number {
  const round = roundForOverall(overall, teams);
  const idx = indexInRound(overall, teams);
  const seat = mode === 'snake' && round % 2 === 0 ? teams - 1 - idx : idx;
  const slot = order[seat];
  if (slot === undefined) {
    throw new RangeError(`overall ${overall} out of range for ${teams} teams`);
  }
  return slot;
}

/** True iff `order` is a permutation of the team slots 1..teams. */
export function isValidOrder(order: number[], teams: number): boolean {
  if (order.length !== teams) return false;
  const seen = new Set(order);
  if (seen.size !== teams) return false;
  for (let slot = 1; slot <= teams; slot++) {
    if (!seen.has(slot)) return false;
  }
  return true;
}
