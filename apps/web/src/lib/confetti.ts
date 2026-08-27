/**
 * Per-piece confetti physics.
 *
 * Everything here is derived from the piece index, so a burst is identical on
 * every client and a re-render never reshuffles it mid-show — the same rule the
 * reveal shows follow. What changed is *what* gets derived: the old burst gave
 * every piece the same straight-down fall and a flat `rotate(720deg)`, which
 * never presents an edge, so it read as spinning stickers rather than paper.
 *
 * Real confetti does four things this now models: it **tumbles** on all three
 * axes (catching the light broad-on, vanishing edge-on), it **flutters**
 * sideways instead of falling plumb, it has **depth** (near pieces bigger,
 * faster and sharper than far ones), and — from a cannon — it **launches** up
 * and outward before gravity takes it.
 */

/** Fixed palette for a neutral burst. A team-coloured burst overrides it. */
export const CONFETTI_COLORS = ['#f59e0b', '#ef4444', '#22c55e', '#3b82f6', '#a855f7', '#f8fafc'];

export type ConfettiVariant =
  /** Fired up and outward from the lower corners. The celebration burst. */
  | 'cannon'
  /** Drifting down from above the top edge. Ambient, for a longer hold. */
  | 'fall';

export type PieceShape = 'rect' | 'ribbon' | 'disc';

export interface ConfettiPiece {
  /** Start position, in percent of the container. */
  x: number;
  y: number;
  /** Net travel, in viewport units — the CSS keyframes read these. */
  dx: number;
  dy: number;
  /** Cannon only: how far up and out the piece gets before gravity wins. */
  apexX: number;
  apexY: number;
  w: number;
  h: number;
  shape: PieceShape;
  color: string;
  /** 0 far → 2 near. Drives size, blur, speed and opacity together. */
  layer: number;
  opacity: number;
  blur: number;
  durationS: number;
  delayS: number;
  /** Sideways flutter, independent of the travel arc. */
  swayPx: number;
  swayS: number;
  /** Tumble periods per axis. Different rates are what stop it looking like a wheel. */
  spinXS: number;
  spinYS: number;
  spinZS: number;
}

/**
 * Deterministic 0..1 from a piece index and a salt.
 *
 * The old burst used `(i * 37) % 100` for position, which lays pieces on an even
 * lattice that repeats every 100 — visible as banding in a big burst. A hash
 * scatters them while staying perfectly reproducible.
 */
export function rand(i: number, salt: number): number {
  let h = Math.imul(i + 1, 0x27d4eb2d) ^ Math.imul(salt + 1, 0x165667b1);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h ^= h >>> 13;
  return ((h >>> 0) % 100_000) / 100_000;
}

/** Pick from `list` deterministically. */
function pick<T>(list: readonly T[], i: number, salt: number): T {
  return list[Math.floor(rand(i, salt) * list.length) % list.length] as T;
}

const SHAPES: PieceShape[] = ['rect', 'rect', 'ribbon', 'ribbon', 'disc'];

/**
 * Build one piece. `i` is its index, `variant` decides whether it is launched or
 * dropped, and `colors` lets a burst take the drafting team's colour.
 */
export function confettiPiece(
  i: number,
  variant: ConfettiVariant = 'cannon',
  colors: readonly string[] = CONFETTI_COLORS,
): ConfettiPiece {
  // Depth first: it scales almost everything else.
  const layer = Math.floor(rand(i, 1) * 3);
  const depth = 0.62 + layer * 0.28; // 0.62 far → 1.18 near

  const shape = pick(SHAPES, i, 2);
  // Streamers are long and thin; discs are square so they stay round.
  const base = (6 + rand(i, 3) * 6) * depth;
  const w = shape === 'ribbon' ? base * 0.45 : base;
  const h = shape === 'ribbon' ? base * 2.1 : base;

  // Near pieces fall faster and arrive sooner — the parallax that reads as depth.
  const durationS = (variant === 'cannon' ? 2.1 : 2.9) + rand(i, 4) * 1.5 - layer * 0.22;
  const delayS =
    variant === 'cannon'
      ? // A cannon fires nearly at once; a light stagger keeps it from looking like one object.
        rand(i, 5) * 0.28
      : rand(i, 5) * 1.1;

  const spread = rand(i, 6);
  let x: number;
  let y: number;
  let dx: number;
  let apexX: number;
  let apexY: number;

  if (variant === 'cannon') {
    // Alternate corners so both fire, and aim up and inward across the screen.
    const fromLeft = i % 2 === 0;
    x = fromLeft ? -2 : 102;
    y = 104;
    const reach = 45 + spread * 70;
    dx = fromLeft ? reach : -reach;
    apexX = dx * 0.55;
    // How high this piece gets before gravity wins.
    apexY = -(55 + rand(i, 7) * 40);
  } else {
    x = rand(i, 6) * 104 - 2;
    y = -12;
    dx = (rand(i, 7) - 0.5) * 26;
    apexX = dx * 0.5;
    apexY = 0;
  }
  const dy = variant === 'cannon' ? 8 : 118;

  return {
    x,
    y,
    dx,
    dy,
    apexX,
    apexY,
    w,
    h,
    shape,
    color: pick(colors.length ? colors : CONFETTI_COLORS, i, 8),
    layer,
    // Far pieces sit back in the haze rather than competing with the near ones.
    opacity: 0.55 + layer * 0.22,
    blur: layer === 0 ? 1.1 : 0,
    durationS,
    delayS,
    swayPx: (18 + rand(i, 9) * 46) * depth * (i % 2 ? 1 : -1),
    swayS: 0.55 + rand(i, 10) * 0.85,
    ...spins(i),
  };
}

/**
 * Tumble periods, guaranteed distinct.
 *
 * Each axis is derived from the one before it with an enforced multiplier, rather
 * than drawn from an independent range where two could coincide. A piece whose
 * axes share a period doesn't tumble — it spins like a wheel, which is the exact
 * failure the flat `rotate(720deg)` had.
 */
function spins(i: number): { spinXS: number; spinYS: number; spinZS: number } {
  const spinXS = 0.7 + rand(i, 11) * 1.1;
  const spinYS = spinXS * (1.35 + rand(i, 12) * 0.45);
  const spinZS = spinYS * (1.3 + rand(i, 13) * 0.55);
  return { spinXS, spinYS, spinZS };
}
