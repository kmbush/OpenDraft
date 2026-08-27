import { describe, expect, it } from 'vitest';
import {
  FLAP_MS,
  GLYPHS,
  SETTLE_MS,
  boardRow,
  boardWidth,
  flapGlyph,
  flapLockAtMs,
  flapPhase,
} from './splitflap.js';

const LOCK = 10_000;

describe('flapLockAtMs', () => {
  it('lands the last column exactly on the row beat', () => {
    expect(flapLockAtMs(LOCK, 3, 4)).toBe(LOCK);
  });

  it('settles left to right', () => {
    const times = [0, 1, 2, 3].map((c) => flapLockAtMs(LOCK, c, 4));
    expect(times).toEqual([...times].sort((a, b) => a - b));
    expect(times[0]).toBe(LOCK - SETTLE_MS + SETTLE_MS / 4);
  });
});

describe('flapGlyph', () => {
  it('shows the final character once its own flap has locked', () => {
    expect(flapGlyph('K', LOCK, LOCK, 3, 4)).toBe('K');
  });

  it('arrives at its letter rather than jumping to it', () => {
    // A real drum only turns one way: one flap out, it must be showing the glyph
    // immediately before the answer.
    const target = GLYPHS.indexOf('K');
    const oneOut = flapGlyph('K', LOCK - 1, LOCK, 3, 4);
    expect(oneOut).toBe(GLYPHS[target - 1]);
  });

  it('counts back one glyph per flap step', () => {
    const target = GLYPHS.indexOf('K');
    expect(flapGlyph('K', LOCK - FLAP_MS - 1, LOCK, 3, 4)).toBe(GLYPHS[target - 2]);
    expect(flapGlyph('K', LOCK - 2 * FLAP_MS - 1, LOCK, 3, 4)).toBe(GLYPHS[target - 3]);
  });

  it('wraps around the drum rather than running off the end', () => {
    // ' ' is the first glyph; counting back from it must wrap to the last.
    expect(flapGlyph(' ', LOCK - 1, LOCK, 3, 4)).toBe(GLYPHS.at(-1));
  });

  it('only ever shows glyphs from the flap alphabet', () => {
    for (let t = 0; t < LOCK; t += 37) {
      expect(GLYPHS).toContain(flapGlyph('K', t, LOCK, 1, 6));
    }
  });

  it('is a pure function of time — the same instant always renders the same frame', () => {
    const at = (t: number) => flapGlyph('K', t, LOCK, 2, 5);
    expect(at(4321)).toBe(at(4321));
  });

  it('staggers columns, so a row does not stop all at once', () => {
    const t = LOCK - 200;
    // Column 3 locks at LOCK; column 0 locked earlier, so they differ.
    expect(flapGlyph('K', t, LOCK, 0, 4)).not.toBe(flapGlyph('K', t, LOCK, 3, 4));
  });
});

describe('flapPhase', () => {
  it('is 1 once the flap has locked', () => {
    expect(flapPhase(LOCK, LOCK, 3, 4)).toBe(1);
  });

  it('runs 0 to 1 within a single flip', () => {
    for (let t = LOCK - 4 * FLAP_MS; t < LOCK; t += 7) {
      const phase = flapPhase(t, LOCK, 3, 4);
      expect(phase).toBeGreaterThanOrEqual(0);
      expect(phase).toBeLessThanOrEqual(1);
    }
  });

  it('resets each flap step, so the squash repeats per card', () => {
    const justBefore = flapPhase(LOCK - 1, LOCK, 3, 4);
    const aStepEarlier = flapPhase(LOCK - FLAP_MS - 1, LOCK, 3, 4);
    expect(justBefore).toBeCloseTo(aStepEarlier, 6);
  });
});

describe('boardRow / boardWidth', () => {
  it('pads and uppercases to a fixed width', () => {
    expect(boardRow('Sharks', 10)).toBe('SHARKS    ');
  });

  it('clips a name too long for the board', () => {
    expect(boardRow('The Unstoppables', 8)).toBe('THE UNST');
  });

  it('sizes the board to the longest name, within bounds', () => {
    expect(boardWidth(['AB', 'ABCDEFGHIJKL'])).toBe(12);
    expect(boardWidth(['AB'])).toBe(10); // floor
    expect(boardWidth(['A'.repeat(40)])).toBe(18); // ceiling
  });
});
