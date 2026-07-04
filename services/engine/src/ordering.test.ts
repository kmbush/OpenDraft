import { describe, expect, it } from 'vitest';
import {
  indexInRound,
  isValidOrder,
  pickInRound,
  roundForOverall,
  slotForOverallPick,
} from './ordering.js';

describe('slotForOverallPick', () => {
  const order = [1, 2, 3, 4];
  const teams = 4;

  it('linear: every round follows the order', () => {
    const linear = (o: number) => slotForOverallPick(o, teams, order, 'linear');
    // Round 1
    expect([1, 2, 3, 4].map((_, i) => linear(i + 1))).toEqual([1, 2, 3, 4]);
    // Round 2 repeats the order (no reversal)
    expect([5, 6, 7, 8].map(linear)).toEqual([1, 2, 3, 4]);
    // Round 3
    expect([9, 10, 11, 12].map(linear)).toEqual([1, 2, 3, 4]);
  });

  it('snake: odd rounds forward, even rounds reversed', () => {
    const snake = (o: number) => slotForOverallPick(o, teams, order, 'snake');
    expect([1, 2, 3, 4].map(snake)).toEqual([1, 2, 3, 4]); // round 1
    expect([5, 6, 7, 8].map(snake)).toEqual([4, 3, 2, 1]); // round 2 reversed
    expect([9, 10, 11, 12].map(snake)).toEqual([1, 2, 3, 4]); // round 3
  });

  it('honors a non-identity order and reverses that order on snake even rounds', () => {
    const custom = [3, 1, 4, 2];
    const snake = (o: number) => slotForOverallPick(o, teams, custom, 'snake');
    expect([1, 2, 3, 4].map(snake)).toEqual([3, 1, 4, 2]);
    expect([5, 6, 7, 8].map(snake)).toEqual([2, 4, 1, 3]); // custom reversed
  });

  it('boundary picks: first overall and last overall', () => {
    // first overall is the first seat regardless of mode
    expect(slotForOverallPick(1, teams, order, 'snake')).toBe(1);
    expect(slotForOverallPick(1, teams, order, 'linear')).toBe(1);
    // last overall (12, round 3 odd) is the last seat in both modes here
    expect(slotForOverallPick(12, teams, order, 'snake')).toBe(4);
    expect(slotForOverallPick(12, teams, order, 'linear')).toBe(4);
    // with an even final round, snake flips the last seat
    expect(slotForOverallPick(8, teams, order, 'snake')).toBe(1); // round 2 last seat
    expect(slotForOverallPick(8, teams, order, 'linear')).toBe(4);
  });

  it('throws on a malformed order shorter than the team count (programming error)', () => {
    expect(() => slotForOverallPick(4, teams, [1, 2], 'snake')).toThrow(RangeError);
  });
});

describe('round / index helpers', () => {
  it('computes 1-based round and pick-in-round', () => {
    expect(roundForOverall(1, 4)).toBe(1);
    expect(roundForOverall(4, 4)).toBe(1);
    expect(roundForOverall(5, 4)).toBe(2);
    expect(indexInRound(5, 4)).toBe(0);
    expect(pickInRound(5, 4)).toBe(1);
    expect(pickInRound(8, 4)).toBe(4);
  });
});

describe('isValidOrder', () => {
  it('accepts a permutation of the team slots', () => {
    expect(isValidOrder([3, 1, 4, 2], 4)).toBe(true);
  });
  it('rejects wrong length, duplicates, or missing slots', () => {
    expect(isValidOrder([1, 2, 3], 4)).toBe(false);
    expect(isValidOrder([1, 2, 3, 3], 4)).toBe(false);
    expect(isValidOrder([1, 2, 3, 5], 4)).toBe(false);
  });
});
