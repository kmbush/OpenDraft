/**
 * Plinko puck geometry.
 *
 * Real Plinko is a physics simulation, and a simulation cannot be resumed: a
 * board reconnecting eight seconds into the show has no accumulated state to
 * resume from. So the bounce is *precomputed* instead — a deterministic sequence
 * of left/right peg deflections chosen to land on the slot the draft order
 * already decided, then sampled by elapsed time.
 *
 * It looks like physics and behaves like a pure function.
 */

/** Peg rows the puck falls through. More rows = more bounces, denser field. */
export const PEG_ROWS = 10;

/** Deterministic hash for one puck's bounce pattern. */
function hash(n: number): number {
  const h = Math.imul(n ^ 0x2545f491, 0x45d9f3b);
  return (h ^ (h >>> 16)) >>> 0;
}

/**
 * Left/right deflections landing a puck on `targetCol`, in half-column units.
 *
 * The puck starts centred and deflects ±0.5 columns per peg row, so after
 * `PEG_ROWS` rows its net displacement must equal `targetCol - centre`. We pick
 * how many rights that needs, then choose *which* rows are rights from a hash —
 * the path is unpredictable to a viewer but fixed for a given puck.
 *
 * Returns one x offset (in columns, from the left edge) per row boundary,
 * `PEG_ROWS + 1` values long, starting at centre and ending exactly on target.
 */
export function plinkoPath(puckSeed: number, targetCol: number, cols: number): number[] {
  const centre = (cols - 1) / 2;
  // Each row moves ±0.5 columns; net displacement fixes the count of rights.
  const needed = (targetCol - centre) / 0.5;
  const rights = Math.round((PEG_ROWS + needed) / 2);
  const clamped = Math.max(0, Math.min(PEG_ROWS, rights));

  // Deal `clamped` rights across the rows deterministically, so the bounce reads
  // as random while still summing to the required displacement.
  const order = Array.from({ length: PEG_ROWS }, (_, i) => i).sort(
    (a, b) => (hash(puckSeed * 31 + a) % 1000) - (hash(puckSeed * 31 + b) % 1000),
  );
  const isRight = new Array<boolean>(PEG_ROWS).fill(false);
  for (let i = 0; i < clamped; i++) {
    const row = order[i];
    if (row !== undefined) isRight[row] = true;
  }

  const xs = [centre];
  let x = centre;
  for (let r = 0; r < PEG_ROWS; r++) {
    x += isRight[r] ? 0.5 : -0.5;
    // Never leave the board; a bounce off the wall reads as a wall bounce.
    x = Math.max(0, Math.min(cols - 1, x));
    xs.push(x);
  }
  // Correct any drift the wall clamp introduced so the puck still lands true.
  xs[xs.length - 1] = targetCol;
  return xs;
}

export interface PuckPos {
  /** Column units from the left edge. */
  x: number;
  /** 0 at the top of the peg field, 1 at the slots. */
  y: number;
  /** True on the frames just after a peg strike — drives the squash. */
  striking: boolean;
}

/**
 * Sample a puck mid-fall. `p` is 0..1 across the whole drop.
 *
 * Vertical speed accelerates like gravity; horizontal moves peg to peg, easing
 * so the puck hangs briefly at each strike instead of sliding.
 */
export function puckAt(path: number[], p: number): PuckPos {
  const clamped = Math.max(0, Math.min(1, p));
  const rows = path.length - 1;
  const exact = clamped * rows;
  const row = Math.min(rows - 1, Math.floor(exact));
  const within = exact - row;

  const from = path[row] ?? 0;
  const to = path[row + 1] ?? from;
  // Ease-out within a row: quick off the peg, slowing into the next.
  const eased = 1 - (1 - within) ** 2;

  return {
    x: from + (to - from) * eased,
    // Quadratic fall — the puck visibly accelerates down the board.
    y: clamped ** 1.6,
    striking: within < 0.18,
  };
}
