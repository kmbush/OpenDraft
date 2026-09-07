import { describe, expect, it } from 'vitest';
import { GLYPHS, boardRow, boardWidth, flapGlyph, flapMs, flapPhase } from './splitflap.js';

const LOCK = 10_000;
/** The rate of the column most tests drive. */
const STEP = flapMs(3);

describe('flapMs', () => {
  it('turns every column at its own rate, so identical letters cannot twin', () => {
    expect(flapMs(0)).not.toBe(flapMs(1));
  });

  it('stays fast enough to blur — no drum crawls', () => {
    for (let col = 0; col < 18; col++) {
      expect(flapMs(col)).toBeGreaterThanOrEqual(55);
      expect(flapMs(col)).toBeLessThan(80);
    }
  });
});

describe('flapGlyph', () => {
  it('shows the final character once its own flap has locked', () => {
    expect(flapGlyph('K', LOCK, LOCK, 3)).toBe('K');
  });

  it('arrives at its letter rather than jumping to it', () => {
    // A real drum only turns one way: one flap out, it must be showing the glyph
    // immediately before the answer.
    const target = GLYPHS.indexOf('K');
    const oneOut = flapGlyph('K', LOCK - 1, LOCK, 3);
    expect(oneOut).toBe(GLYPHS[target - 1]);
  });

  it('counts back one glyph per flap step', () => {
    const target = GLYPHS.indexOf('K');
    expect(flapGlyph('K', LOCK - STEP - 1, LOCK, 3)).toBe(GLYPHS[target - 2]);
    expect(flapGlyph('K', LOCK - 2 * STEP - 1, LOCK, 3)).toBe(GLYPHS[target - 3]);
  });

  it('wraps around the drum rather than running off the end', () => {
    // ' ' is the first glyph; counting back from it must wrap to the last.
    expect(flapGlyph(' ', LOCK - 1, LOCK, 3)).toBe(GLYPHS.at(-1));
  });

  it('only ever shows glyphs from the flap alphabet', () => {
    for (let t = 0; t < LOCK; t += 37) {
      expect(GLYPHS).toContain(flapGlyph('K', t, LOCK, 1));
    }
  });

  it('is a pure function of time — the same instant always renders the same frame', () => {
    const at = (t: number) => flapGlyph('K', t, LOCK, 2);
    expect(at(4321)).toBe(at(4321));
  });

  it('stops every column in a row on the same beat', () => {
    // The row is one machine: the whole rack lands together, on the cue.
    for (const col of [0, 1, 2, 3, 7, 11]) {
      expect(flapGlyph('K', LOCK, LOCK, col), `col ${col} at the beat`).toBe('K');
      expect(flapGlyph('K', LOCK - 1, LOCK, col), `col ${col} just before`).not.toBe('K');
    }
  });

  it('keeps columns decorrelated even when they land on the same letter', () => {
    const t = LOCK - 400;
    expect(flapGlyph('K', t, LOCK, 0)).not.toBe(flapGlyph('K', t, LOCK, 1));
  });
});

describe('flapPhase', () => {
  it('is 1 once the flap has locked', () => {
    expect(flapPhase(LOCK, LOCK, 3)).toBe(1);
  });

  it('runs 0 to 1 within a single flip', () => {
    for (let t = LOCK - 4 * STEP; t < LOCK; t += 7) {
      const phase = flapPhase(t, LOCK, 3);
      expect(phase).toBeGreaterThanOrEqual(0);
      expect(phase).toBeLessThanOrEqual(1);
    }
  });

  it('resets each flap step, so the squash repeats per card', () => {
    const justBefore = flapPhase(LOCK - 1, LOCK, 3);
    const aStepEarlier = flapPhase(LOCK - STEP - 1, LOCK, 3);
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
