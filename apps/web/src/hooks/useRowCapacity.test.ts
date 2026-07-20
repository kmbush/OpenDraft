import { describe, expect, it } from 'vitest';
import { rowCapacity } from './useRowCapacity.js';

describe('rowCapacity', () => {
  it('fits as many whole rows as the container allows', () => {
    expect(rowCapacity(800, 75)).toBe(10);
    // A partial row is dropped rather than clipped mid-text.
    expect(rowCapacity(799, 100)).toBe(7);
  });

  it('always leaves at least one row when there is any space', () => {
    expect(rowCapacity(40, 75)).toBe(1);
  });

  it('reports zero when it has nothing to measure', () => {
    expect(rowCapacity(0, 75)).toBe(0);
    expect(rowCapacity(800, 0)).toBe(0);
  });
});
