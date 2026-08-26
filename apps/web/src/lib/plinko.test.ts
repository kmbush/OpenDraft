import { describe, expect, it } from 'vitest';
import { PEG_ROWS, pegOffset, plinkoPath, puckAt } from './plinko.js';

describe('plinkoPath', () => {
  it('always lands exactly on the target slot', () => {
    for (const cols of [8, 10, 12, 14]) {
      for (let target = 0; target < cols; target++) {
        const path = plinkoPath(target + 7, target, cols);
        expect(path.at(-1)).toBeCloseTo(target, 6);
      }
    }
  });

  it('starts centred', () => {
    expect(plinkoPath(1, 0, 11)[0]).toBe(5);
  });

  it('has one x per peg row boundary', () => {
    expect(plinkoPath(1, 3, 10)).toHaveLength(PEG_ROWS + 1);
  });

  it('never leaves the board', () => {
    for (let target = 0; target < 12; target++) {
      for (const x of plinkoPath(target, target, 12)) {
        expect(x).toBeGreaterThanOrEqual(0);
        expect(x).toBeLessThanOrEqual(11);
      }
    }
  });

  it('deflects half a column per peg, so the fall reads as bouncing', () => {
    const path = plinkoPath(3, 6, 12);
    // Every step except the final landing correction is a half-column hop.
    for (let i = 1; i < path.length - 1; i++) {
      expect(Math.abs((path[i] ?? 0) - (path[i - 1] ?? 0))).toBeCloseTo(0.5, 6);
    }
  });

  it('gives different pucks different bounce patterns', () => {
    expect(plinkoPath(1, 5, 12)).not.toEqual(plinkoPath(2, 5, 12));
  });

  it('is deterministic — the same puck always falls the same way', () => {
    expect(plinkoPath(9, 4, 12)).toEqual(plinkoPath(9, 4, 12));
  });
});

describe('puckAt', () => {
  const path = plinkoPath(5, 8, 12);

  it('starts at the top on the centre line', () => {
    const pos = puckAt(path, 0);
    expect(pos.y).toBe(0);
    expect(pos.x).toBeCloseTo(5.5, 6);
  });

  it('finishes in the target slot at the bottom', () => {
    const pos = puckAt(path, 1);
    expect(pos.y).toBeCloseTo(1, 6);
    expect(pos.x).toBeCloseTo(8, 6);
  });

  it('falls monotonically and accelerates', () => {
    const early = puckAt(path, 0.2).y;
    const mid = puckAt(path, 0.5).y;
    const late = puckAt(path, 0.8).y;
    expect(early).toBeLessThan(mid);
    expect(mid).toBeLessThan(late);
    expect(mid - early).toBeLessThan(late - mid); // gravity, not a constant slide
  });

  it('clamps outside 0..1 rather than flying off the board', () => {
    expect(puckAt(path, -3).y).toBe(0);
    expect(puckAt(path, 9).y).toBeCloseTo(1, 6);
  });
});

describe('peg alignment', () => {
  // The realism bug this guards: a puck deflects half a column per row, so its x
  // always has a fixed fractional part per row. If the peg grid doesn't share it,
  // the puck ricochets off empty space.
  it('puts a peg exactly where the puck bounces, on every row', () => {
    for (const cols of [8, 10, 11, 12]) {
      const path = plinkoPath(4, 3, cols);
      for (let r = 0; r < path.length - 1; r++) {
        const frac = (((path[r] ?? 0) % 1) + 1) % 1;
        expect(frac).toBeCloseTo(pegOffset(r, cols), 6);
      }
    }
  });

  it('reaches each peg row exactly as it deflects there', () => {
    const cols = 12;
    const path = plinkoPath(3, 7, cols);
    const rows = path.length - 1;
    for (let r = 0; r < rows; r++) {
      // Invert the gravity curve to find when the puck crosses row r.
      const p = ((r + 1) / (rows + 1)) ** (1 / 1.6);
      const pos = puckAt(path, p);
      expect(pos.y).toBeCloseTo((r + 1) / (rows + 1), 2);
      expect(pos.x).toBeCloseTo(path[r] ?? 0, 2);
    }
  });

  it('still enters at the top and finishes in the slot', () => {
    const path = plinkoPath(5, 8, 12);
    expect(puckAt(path, 0).y).toBe(0);
    expect(puckAt(path, 1).y).toBeCloseTo(1, 6);
    expect(puckAt(path, 1).x).toBeCloseTo(8, 6);
  });
});
