import { describe, expect, it } from 'vitest';
import { CONFETTI_COLORS, type ConfettiVariant, confettiPiece, rand } from './confetti.js';

const COUNT = 240;
const pieces = (variant: ConfettiVariant = 'cannon') =>
  Array.from({ length: COUNT }, (_, i) => confettiPiece(i, variant));

describe('rand', () => {
  it('is deterministic — a burst never reshuffles on re-render', () => {
    expect(rand(17, 3)).toBe(rand(17, 3));
  });

  it('stays within 0..1', () => {
    for (let i = 0; i < 500; i++) {
      const v = rand(i, i % 7);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('decorrelates salts, so a piece varies independently per property', () => {
    expect(rand(9, 1)).not.toBe(rand(9, 2));
  });

  it('scatters rather than banding', () => {
    // The old `(i * 37) % 100` laid pieces on an even lattice repeating every
    // 100. Spread across ten buckets, no bucket should hold a third of them.
    const buckets = new Array(10).fill(0);
    for (let i = 0; i < 1000; i++) buckets[Math.floor(rand(i, 0) * 10)]++;
    for (const b of buckets) expect(b).toBeLessThan(333);
    expect(Math.min(...buckets)).toBeGreaterThan(20);
  });
});

describe('confettiPiece', () => {
  it('is idempotent for a given index', () => {
    expect(confettiPiece(12)).toEqual(confettiPiece(12));
  });

  it('spreads pieces across all three depth layers', () => {
    const layers = new Set(pieces().map((p) => p.layer));
    expect(layers).toEqual(new Set([0, 1, 2]));
  });

  it('makes near pieces bigger and further ones hazier', () => {
    const near = pieces().filter((p) => p.layer === 2);
    const far = pieces().filter((p) => p.layer === 0);
    const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
    expect(avg(near.map((p) => p.w))).toBeGreaterThan(avg(far.map((p) => p.w)));
    expect(avg(near.map((p) => p.opacity))).toBeGreaterThan(avg(far.map((p) => p.opacity)));
    expect(far.every((p) => p.blur > 0)).toBe(true);
    expect(near.every((p) => p.blur === 0)).toBe(true);
  });

  it('never gives a piece matched spin axes — that spins like a wheel', () => {
    for (const p of pieces()) {
      // Each axis must be clearly slower than the last, so the piece keeps
      // presenting a different face rather than rotating about one.
      expect(p.spinYS / p.spinXS).toBeGreaterThan(1.3);
      expect(p.spinZS / p.spinYS).toBeGreaterThan(1.25);
    }
  });

  it('keeps every tumble period in a plausible range', () => {
    for (const p of pieces()) {
      expect(p.spinXS).toBeGreaterThan(0.5);
      expect(p.spinZS).toBeLessThan(6);
    }
  });

  it('flutters both ways, so the burst does not drift as a body', () => {
    const sways = pieces().map((p) => p.swayPx);
    expect(sways.some((s) => s > 0)).toBe(true);
    expect(sways.some((s) => s < 0)).toBe(true);
  });

  it('produces a mix of shapes, including streamers', () => {
    const shapes = new Set(pieces().map((p) => p.shape));
    expect(shapes).toEqual(new Set(['rect', 'ribbon', 'disc']));
    // Ribbons are long and thin; that is what makes them read as streamers.
    for (const p of pieces().filter((x) => x.shape === 'ribbon')) {
      expect(p.h).toBeGreaterThan(p.w * 2);
    }
    for (const p of pieces().filter((x) => x.shape === 'disc')) {
      expect(p.h).toBeCloseTo(p.w, 6);
    }
  });

  describe('cannon', () => {
    it('fires from both lower corners', () => {
      const xs = new Set(pieces('cannon').map((p) => p.x));
      expect(xs).toEqual(new Set([-2, 102]));
      expect(pieces('cannon').every((p) => p.y > 100)).toBe(true);
    });

    it('aims inward — left corner rightwards, right corner leftwards', () => {
      for (const p of pieces('cannon')) {
        expect(p.x < 50 ? p.dx > 0 : p.dx < 0).toBe(true);
      }
    });

    it('arcs up before gravity wins', () => {
      expect(pieces('cannon').every((p) => p.apexY < 0)).toBe(true);
    });

    it('fires nearly at once rather than trickling', () => {
      expect(Math.max(...pieces('cannon').map((p) => p.delayS))).toBeLessThan(0.35);
    });
  });

  describe('fall', () => {
    it('starts above the top edge, across the full width', () => {
      const p = pieces('fall');
      expect(p.every((x) => x.y < 0)).toBe(true);
      expect(Math.min(...p.map((x) => x.x))).toBeLessThan(10);
      expect(Math.max(...p.map((x) => x.x))).toBeGreaterThan(90);
    });

    it('travels down past the bottom edge', () => {
      expect(pieces('fall').every((p) => p.dy > 100)).toBe(true);
    });

    it('staggers, so it drifts rather than arriving as a sheet', () => {
      expect(Math.max(...pieces('fall').map((p) => p.delayS))).toBeGreaterThan(0.6);
    });
  });

  it('uses the house palette by default and a team palette when given one', () => {
    expect(CONFETTI_COLORS).toContain(confettiPiece(4).color);
    expect(confettiPiece(4, 'cannon', ['#123456']).color).toBe('#123456');
  });

  it('falls back to the house palette rather than rendering colourless pieces', () => {
    expect(CONFETTI_COLORS).toContain(confettiPiece(4, 'cannon', []).color);
  });
});
