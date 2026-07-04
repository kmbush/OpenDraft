import { describe, expect, it } from 'vitest';
import { clockOffset, formatClock, remainingMs } from './clock.js';

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
