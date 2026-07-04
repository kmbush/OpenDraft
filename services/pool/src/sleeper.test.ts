import { describe, expect, it } from 'vitest';
import { isPlaying, normalizePosition } from './sleeper.js';

describe('normalizePosition', () => {
  it('prefers the position field, then fantasy_positions', () => {
    expect(normalizePosition({ position: 'RB' })).toBe('RB');
    expect(normalizePosition({ position: 'OLB' })).toBe('LB');
    expect(normalizePosition({ position: null, fantasy_positions: ['DB'] })).toBe('DB');
  });

  it('returns null for undraftable / unknown positions', () => {
    expect(normalizePosition({ position: 'P' })).toBeNull();
    expect(normalizePosition({ position: null, fantasy_positions: null })).toBeNull();
    expect(normalizePosition({})).toBeNull();
  });
});

describe('isPlaying', () => {
  it('drops active:false, retired, and inactive; keeps everyone else (incl. injured)', () => {
    expect(isPlaying({ active: false })).toBe(false);
    expect(isPlaying({ status: 'Retired' })).toBe(false);
    expect(isPlaying({ status: 'Inactive' })).toBe(false);
    expect(isPlaying({ active: true })).toBe(true);
    expect(isPlaying({ status: 'Injured Reserve' })).toBe(true);
    expect(isPlaying({})).toBe(true);
  });
});
