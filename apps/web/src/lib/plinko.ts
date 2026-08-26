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
  /** True on the frames right after a peg strike — drives the squash. */
  striking: boolean;
  /** Degrees. A real puck spins as it ricochets; direction follows the deflection. */
  spin: number;
  /** Peg row the puck is currently falling past, for lighting the struck peg. */
  row: number;
}

/**
 * Which slot each pick lands in, as a permutation of the columns.
 *
 * Filling the board strictly left to right telegraphs the whole show: once you
 * see two pucks land side by side you know where every remaining one is going,
 * including the finale. Scattering the slots means each drop is genuinely in
 * question until it lands.
 *
 * Seeded rather than random, because every client must agree and a board that
 * reconnects mid-show has to rebuild the same arrangement. `reveal.revealAt` is
 * the natural seed: identical everywhere, and different for every show.
 *
 * Returns column-by-pick — index 0 is first overall.
 */
export function slotColumns(seed: number, teams: number): number[] {
  const cols = Array.from({ length: teams }, (_, i) => i);
  // A small LCG; quality doesn't matter here, agreement between clients does.
  let state = seed >>> 0 || 1;
  const next = () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state;
  };
  for (let i = cols.length - 1; i > 0; i--) {
    const j = next() % (i + 1);
    const a = cols[i] as number;
    cols[i] = cols[j] as number;
    cols[j] = a;
  }
  return cols;
}

/**
 * Where the pegs sit on row `r`, as a fractional column offset.
 *
 * This is not decoration: a puck deflects half a column per row, so after `r`
 * bounces its x always has the same fractional part. Line the peg grid up with
 * that and every bounce lands on a peg; get it wrong by half a column and the
 * puck visibly ricochets off empty space, which is what gives a plinko board
 * away as a graphic.
 */
export function pegOffset(r: number, cols: number): number {
  const centre = (cols - 1) / 2;
  return (((centre - r / 2) % 1) + 1) % 1;
}

/**
 * Sample a puck mid-fall. `p` is 0..1 across the whole drop.
 *
 * Gravity is applied to *time*, not to the vertical position: the puck advances
 * through the peg rows faster and faster, while its height stays linear in row
 * index. That is what keeps each deflection exactly on a peg — a quadratic height
 * curve against an evenly spaced peg grid means the two only agree by accident.
 *
 * Between pegs it behaves like a little projectile: fast off the peg sideways,
 * arcing slightly before gravity wins.
 */
export function puckAt(path: number[], p: number): PuckPos {
  const clamped = Math.max(0, Math.min(1, p));
  const rows = path.length - 1;

  // Accelerate through the rows. `t` runs -1 → rows, so the puck enters at the
  // top of the field and reaches peg row r exactly as t crosses r.
  const t = clamped ** 1.6 * (rows + 1) - 1;
  const row = Math.max(0, Math.min(rows - 1, Math.floor(t)));
  const within = Math.max(0, Math.min(1, t - row));

  const from = path[row] ?? 0;
  const to = path[row + 1] ?? from;
  // Ease-out sideways: quick off the peg, slowing as the next one arrives.
  const eased = 1 - (1 - within) ** 2;

  // The hop. Tiny — a puck that visibly levitates reads as a balloon.
  const hop = Math.sin(within * Math.PI) * 0.018 * (1 - clamped * 0.6);

  return {
    x: from + (to - from) * eased,
    y: Math.max(0, (t + 1) / (rows + 1) - hop),
    striking: within < 0.14,
    // Spin accumulates with the fall and leans into the deflection.
    spin: (clamped * 900 + (to > from ? within : -within) * 120) % 360,
    row,
  };
}
