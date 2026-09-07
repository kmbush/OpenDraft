import { describe, expect, it } from 'vitest';
import { canEndDraft, draftLabel } from './domain.js';

describe('draftLabel', () => {
  const base = { teams: 12, rounds: 15, createdAt: Date.UTC(2026, 8, 7, 3) };

  it('uses the name when there is one', () => {
    expect(draftLabel({ ...base, name: '2026 Redraft' })).toBe('2026 Redraft');
  });

  it('trims, so a name of spaces is not a name', () => {
    expect(draftLabel({ ...base, name: '  Rookie draft  ' })).toBe('Rookie draft');
    expect(draftLabel({ ...base, name: '   ' })).toContain('12×15');
  });

  it('falls back to something a person can pick out of a list — never a bare id', () => {
    const label = draftLabel(base);
    expect(label).toContain('12×15');
    // Locale-dependent date formatting, so assert it is present, not its wording.
    expect(label.length).toBeGreaterThan('12×15'.length);
  });

  it('says so rather than inventing a date for drafts that never recorded one', () => {
    expect(draftLabel({ teams: 10, rounds: 16 })).toBe('Undated · 10×16');
  });
});

describe('canEndDraft', () => {
  it('allows ending only a draft that is underway', () => {
    expect(canEndDraft('ON_CLOCK')).toBe(true);
    expect(canEndDraft('PICK_IN')).toBe(true);
    expect(canEndDraft('PAUSED')).toBe(true);
    // The go-live countdown is running on every board; there is no other way out.
    expect(canEndDraft('STARTING')).toBe(true);
  });

  it('refuses a draft that has not started or has already finished', () => {
    expect(canEndDraft('SETUP')).toBe(false);
    expect(canEndDraft('ORDER_SET')).toBe(false);
    expect(canEndDraft('REVEALING')).toBe(false);
    expect(canEndDraft('COMPLETE')).toBe(false);
  });
});
