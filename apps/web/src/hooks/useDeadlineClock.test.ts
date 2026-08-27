import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { remainingMs } from '../lib/clock.js';

/**
 * The scheduling rule under test, extracted so it can be checked without a
 * renderer: given the remaining ms, how long until the displayed second turns?
 */
function untilFlip(rem: number): number {
  return rem % 1000 || 1000;
}

describe('second-boundary scheduling', () => {
  it('waits only until the next boundary, not a fixed interval', () => {
    expect(untilFlip(90_000)).toBe(1000);
    expect(untilFlip(89_400)).toBe(400);
    expect(untilFlip(89_001)).toBe(1);
  });

  it('never schedules a zero-delay tick', () => {
    for (let rem = 1; rem <= 5000; rem++) {
      expect(untilFlip(rem)).toBeGreaterThan(0);
      expect(untilFlip(rem)).toBeLessThanOrEqual(1000);
    }
  });

  it('lands the displayed second one lower after each wait', () => {
    // This is the property that matters: after waiting untilFlip, the label must
    // have changed by exactly one. A free-running interval cannot guarantee it.
    for (const rem of [90_000, 89_999, 45_500, 12_345, 1001]) {
      const before = Math.ceil(rem / 1000);
      const after = Math.ceil((rem - untilFlip(rem)) / 1000);
      expect(before - after).toBe(1);
    }
  });
});

describe('what a 250ms interval actually did', () => {
  it('flips evenly, not raggedly — 250 divides 1000, so lateness is constant', () => {
    // Worth pinning: the first theory for the board's choppy clock was that a
    // free-running interval flipped the digits by a varying amount. It doesn't.
    // Because 250 divides 1000 exactly, every flip is late by the *same* amount,
    // so the digits turn over evenly. That theory is dead, and this test is what
    // killed it.
    const PHASE = 137;
    const lateness: number[] = [];
    for (let sec = 1; sec < 60; sec++) {
      const boundary = sec * 1000;
      const firstSample = Math.ceil((boundary - PHASE) / 250) * 250 + PHASE;
      lateness.push(firstSample - boundary);
    }
    expect(Math.max(...lateness) - Math.min(...lateness)).toBe(0);
  });

  it('was late by up to a quarter second, which boundary scheduling removes', () => {
    // The real (smaller) win: the label was consistently behind the deadline, and
    // re-rendered four times a second to achieve it.
    const PHASE = 137;
    const boundary = 5000;
    const firstSample = Math.ceil((boundary - PHASE) / 250) * 250 + PHASE;
    expect(firstSample - boundary).toBeGreaterThan(0);
    expect(firstSample - boundary).toBeLessThan(250);
  });

  it('boundary scheduling ticks once per second instead of four times', () => {
    let ticks = 0;
    let rem = 10_000;
    while (rem > 0) {
      rem -= untilFlip(rem);
      ticks++;
    }
    expect(ticks).toBe(10);
  });
});

describe('remainingMs contract the clock relies on', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('clamps at zero rather than going negative', () => {
    expect(remainingMs(1000, 0, 5000)).toBe(0);
  });

  it('is undefined-safe, so an expired or absent deadline stops the loop', () => {
    expect(remainingMs(undefined, 0, 5000)).toBe(0);
  });
});
