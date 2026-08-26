import { describe, expect, it } from 'vitest';
import {
  FLAP_MS,
  GLYPHS,
  SETTLE_MS,
  boardRow,
  boardWidth,
  flapGlyph,
  flapLockAtMs,
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
    expect(flapGlyph('K', LOCK, LOCK, 0, 3, 4)).toBe('K');
  });

  it('is still cycling before the flap locks', () => {
    // Column 0 locks earliest; sample well before even that.
    expect(flapGlyph('K', LOCK - SETTLE_MS - 500, LOCK, 0, 0, 4)).not.toBe('K');
  });

  it('only cycles glyphs from the flap alphabet', () => {
    for (let t = 0; t < 2000; t += 37) {
      expect(GLYPHS).toContain(flapGlyph('K', t, LOCK, 2, 1, 6));
    }
  });

  it('is a pure function of time — the same instant always renders the same frame', () => {
    const at = (t: number) => flapGlyph('K', t, LOCK, 1, 2, 5);
    expect(at(4321)).toBe(at(4321));
  });

  it('advances one glyph per FLAP_MS', () => {
    const t = 3000;
    const a = flapGlyph('K', t, LOCK, 1, 2, 5);
    const b = flapGlyph('K', t + FLAP_MS, LOCK, 1, 2, 5);
    expect(a).not.toBe(b);
  });

  it('decorrelates rows so the board clatters rather than pulses in unison', () => {
    const row0 = flapGlyph('K', 3000, LOCK, 0, 0, 5);
    const row1 = flapGlyph('K', 3000, LOCK, 1, 0, 5);
    expect(row0).not.toBe(row1);
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
