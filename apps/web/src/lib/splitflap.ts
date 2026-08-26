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

/** How long a row spends settling, left to right, before it locks. */
export const SETTLE_MS = 700;

/**
 * When the flap at `col` locks, given the row's lock time. Columns settle
 * left-to-right across `SETTLE_MS` so the last character lands exactly on the
 * row's beat — the row reads as one gesture rather than a ragged stop.
 */
export function flapLockAtMs(rowLockAtMs: number, col: number, cols: number): number {
  const span = SETTLE_MS / Math.max(1, cols);
  return rowLockAtMs - SETTLE_MS + (col + 1) * span;
}

/**
 * The glyph showing on one flap at `elapsed`.
 *
 * A real board's drum only turns one way and **arrives** at its letter — it never
 * jumps there. So this counts backwards from the target: with `n` flaps left
 * before lock, the drum shows the glyph `n` places before the answer. Rows stay
 * decorrelated for free, because each column locks at its own moment on its own
 * letter.
 */
export function flapGlyph(
  finalChar: string,
  elapsed: number,
  rowLockAtMs: number,
  col: number,
  cols: number,
): string {
  const lockAt = flapLockAtMs(rowLockAtMs, col, cols);
  if (elapsed >= lockAt) return finalChar;
  const stepsLeft = Math.ceil((lockAt - elapsed) / FLAP_MS);
  const target = Math.max(0, GLYPHS.indexOf(finalChar));
  const idx = (((target - stepsLeft) % GLYPHS.length) + GLYPHS.length) % GLYPHS.length;
  return GLYPHS[idx] ?? ' ';
}

/**
 * How far through its current flip a flap is, 0 → 1. Drives the card's squash so
 * the motion is mechanical rather than a bare character swap; only meaningful
 * while the flap is still turning.
 */
export function flapPhase(elapsed: number, rowLockAtMs: number, col: number, cols: number): number {
  const lockAt = flapLockAtMs(rowLockAtMs, col, cols);
  if (elapsed >= lockAt) return 1;
  const intoStep = (lockAt - elapsed) % FLAP_MS;
  return 1 - intoStep / FLAP_MS;
}

/** Uppercase, clipped to the board's fixed width, padded so every row is one length. */
export function boardRow(text: string, cols: number): string {
  return text.toUpperCase().slice(0, cols).padEnd(cols, ' ');
}

/**
 * Width of the flap board: the longest name, clamped. Fixed for the whole show so
 * rows stay in a column and the board reads as one machine.
 */
export function boardWidth(names: string[], min = 10, max = 18): number {
  const longest = names.reduce((n, s) => Math.max(n, s.length), 0);
  return Math.min(max, Math.max(min, longest));
}
