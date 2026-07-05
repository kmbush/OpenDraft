/**
 * Shared timings for "The Reveal" — the draft-order reveal show. Single source
 * of truth imported by BOTH the engine (to schedule REVEAL_DONE at the end) and
 * the board (to drive the envelope animation), so the show and its end can never
 * drift apart. Everything is client-derivable from `reveal.revealAt` + these
 * numbers, so a reconnecting board renders the correct frame.
 */

/** Fixed pre-show countdown ("THE REVEAL BEGINS IN 0:30…"). Not configurable. */
export const REVEAL_COUNTDOWN_MS = 30_000;

/** Beat after the show opens before the first envelope flips. */
export const REVEAL_LEAD_IN_MS = 1_500;
/** Time each non-finale envelope holds the stage (revealed last pick → #2). */
export const REVEAL_PER_PICK_MS = 1_500;
/** The #1-overall finale — longer, for the flourish. */
export const REVEAL_FINALE_MS = 5_000;
/** "THE ORDER IS SET" full-board hold before flipping to ORDER_SET. */
export const REVEAL_OUTRO_MS = 3_500;

/**
 * Total animation length for a `teams`-slot reveal, measured from `revealAt`.
 * The engine schedules REVEAL_DONE at `revealAt + revealAnimationMs(teams)`.
 */
export function revealAnimationMs(teams: number): number {
  const picks = Math.max(1, teams);
  return REVEAL_LEAD_IN_MS + (picks - 1) * REVEAL_PER_PICK_MS + REVEAL_FINALE_MS + REVEAL_OUTRO_MS;
}

/**
 * Elapsed-ms (from `revealAt`) at which the envelope for a given 1-based overall
 * pick flips open. Reveal runs last pick → first, so #1 opens last (the finale).
 */
export function pickRevealAtMs(pickNo: number, teams: number): number {
  return REVEAL_LEAD_IN_MS + (Math.max(1, teams) - pickNo) * REVEAL_PER_PICK_MS;
}
