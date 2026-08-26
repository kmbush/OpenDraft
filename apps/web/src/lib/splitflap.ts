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

/** Cheap deterministic hash — decorrelates rows and columns so they don't clatter in step. */
function seed(row: number, col: number): number {
  const h = Math.imul((row * 73_856_093) ^ (col * 19_349_663), 0x45d9f3b);
  return (h ^ (h >>> 15)) >>> 0;
}

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
 * The glyph showing on one flap at `elapsed`. Locked flaps show their final
 * character; unlocked ones cycle deterministically.
 */
export function flapGlyph(
  finalChar: string,
  elapsed: number,
  rowLockAtMs: number,
  row: number,
  col: number,
  cols: number,
): string {
  if (elapsed >= flapLockAtMs(rowLockAtMs, col, cols)) return finalChar;
  const step = Math.floor(elapsed / FLAP_MS);
  return GLYPHS[(seed(row, col) + step) % GLYPHS.length] ?? ' ';
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
