import { describe, expect, it } from 'vitest';
import { clockFraction, clockOffset, formatClock, remainingMs } from './clock.js';

describe('clock offset math (DESIGN §5.5)', () => {
  it('derives remaining time from the deadline and the sync offset', () => {
    // Client clock runs 400ms ahead of the server.
    const offset = clockOffset(5_400, 5_000);
    expect(offset).toBe(400);
    // Deadline is server-time 100_000; at client 96_400 → est server 96_000 → 4s left.
    expect(remainingMs(100_000, offset, 96_400)).toBe(4_000);
  });

  it('never goes negative and treats a missing deadline as zero', () => {
    expect(remainingMs(100_000, 0, 200_000)).toBe(0);
    expect(remainingMs(undefined, 0, 0)).toBe(0);
  });
});

describe('formatClock', () => {
  it('formats milliseconds as m:ss (rounding up)', () => {
    expect(formatClock(90_000)).toBe('1:30');
    expect(formatClock(4_200)).toBe('0:05');
    expect(formatClock(0)).toBe('0:00');
  });
});

describe('clockFraction', () => {
  it('is the share of the pick clock still remaining', () => {
    // 30s left on a 60s clock → the ring is half swept.
    expect(clockFraction(30_000, 0, 0, 60_000)).toBe(0.5);
    expect(clockFraction(60_000, 0, 0, 60_000)).toBe(1);
  });

  it('clamps to [0,1] so an expired or nudged clock never overdraws the ring', () => {
    expect(clockFraction(0, 0, 10_000, 60_000)).toBe(0);
    // A deadline further out than one full clock (e.g. after a timer nudge).
    expect(clockFraction(90_000, 0, 0, 60_000)).toBe(1);
  });

  it('treats a missing deadline or zero-length clock as empty', () => {
    expect(clockFraction(undefined, 0, 0, 60_000)).toBe(0);
    expect(clockFraction(60_000, 0, 0, 0)).toBe(0);
  });
});
