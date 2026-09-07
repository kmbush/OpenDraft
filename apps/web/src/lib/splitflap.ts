/**
 * Split-flap (airport departure board) character math.
 *
 * Pure and time-derived, like every reveal show: the glyph on any flap at any
 * moment is a function of `(row, column, elapsed)` alone. Nothing accumulates, so
 * a board that reconnects halfway through the show renders the exact right frame
 * rather than restarting the clatter.
 */

/** The flap alphabet. Space first so short names settle to blanks, not letters. */
export const GLYPHS = " ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789.-'&";

/** How long one flap card takes to swap. Fast enough to blur, slow enough to read. */
export const FLAP_MS = 55;

/**
 * How fast one column's drum turns.
 *
 * Every flap in a row now stops on the same beat, which is what a rack of them
 * driven off one shaft actually does. Left alone they would also *turn* in
 * lockstep, and two columns landing on the same letter would show the same glyph
 * the whole way down — a row of twins. Varying the rate a few percent per column
 * keeps the drums independent while still arriving exactly on the row's beat.
 */
export function flapMs(col: number): number {
  return FLAP_MS * (1 + ((col * 7) % 5) * 0.06);
}

/**
 * The glyph showing on one flap at `elapsed`.
 *
 * A real board's drum only turns one way and **arrives** at its letter — it never
 * jumps there. So this counts backwards from the target: with `n` flaps left
 * before lock, the drum shows the glyph `n` places before the answer. Columns
 * stay decorrelated because each turns at its own rate (`flapMs`), not because
 * each stops at its own moment — they all stop together.
 */
export function flapGlyph(finalChar: string, elapsed: number, lockAt: number, col: number): string {
  if (elapsed >= lockAt) return finalChar;
  const stepsLeft = Math.ceil((lockAt - elapsed) / flapMs(col));
  const target = Math.max(0, GLYPHS.indexOf(finalChar));
  const idx = (((target - stepsLeft) % GLYPHS.length) + GLYPHS.length) % GLYPHS.length;
  return GLYPHS[idx] ?? ' ';
}

/**
 * How far through its current flip a flap is, 0 → 1. Drives the card's squash so
 * the motion is mechanical rather than a bare character swap; only meaningful
 * while the flap is still turning.
 */
export function flapPhase(elapsed: number, lockAt: number, col: number): number {
  if (elapsed >= lockAt) return 1;
  const step = flapMs(col);
  const intoStep = (lockAt - elapsed) % step;
  return 1 - intoStep / step;
}

/** Uppercase, clipped to the board's fixed width, padded so every row is one length. */
export function boardRow(text: string, cols: number): string {
  return text.toUpperCase().slice(0, cols).padEnd(cols, ' ');
}

/**
 * Width of the flap board, in tiles: enough for the longest name in the league.
 *
 * Fixed for the whole show so every row is the same length and the board reads as
 * one machine rather than a ragged stack. The old ceiling of 18 quietly *clipped*
 * longer names — `boardRow` slices to fit — which is the one thing a board with a
 * team's name on it must not do.
 *
 * A ceiling still exists, because tiles shrink to keep a wide board on screen and
 * past some width they stop being readable from a couch. It sits far enough out
 * that a real team name reaches it only by trying to.
 */
export function boardWidth(names: string[], min = 10, max = 28): number {
  const longest = names.reduce((n, s) => Math.max(n, s.length), 0);
  return Math.min(max, Math.max(min, longest));
}
