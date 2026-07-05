import { describe, expect, it } from 'vitest';
import {
  DEFAULT_ROSTER_SPEC,
  ROSTER_PRESETS,
  type RosterSpec,
  type SlotPick,
  assignRosterSlots,
  buildRosterFormat,
  rosterFormatToSpec,
  rosterPositions,
} from './roster.js';

const specOf = (key: string): RosterSpec =>
  ROSTER_PRESETS.find((p) => p.key === key)?.spec ?? DEFAULT_ROSTER_SPEC;

const standard = buildRosterFormat(specOf('standard'));
const superflex = buildRosterFormat(specOf('superflex'));
const idp = buildRosterFormat(specOf('idp'));

describe('buildRosterFormat', () => {
  it('drops zero-count starters and flex slots', () => {
    expect(standard.starters).toEqual({ QB: 1, RB: 2, WR: 2, TE: 1, K: 1, DEF: 1 });
    expect(standard.flex.map((f) => f.kind)).toEqual(['FLEX']);
    expect(standard.bench).toBe(6);
  });

  it('caps positionMax at starters + eligible flex + bench allowance', () => {
    // QB: 1 starter, no flex, +3 allowance.
    expect(standard.positionMax.QB).toBe(4);
    // RB: 2 starters + 1 FLEX + 3 = 6.
    expect(standard.positionMax.RB).toBe(6);
    // Superflex adds a QB-eligible slot: 1 + 1 + 3 = 5.
    expect(superflex.positionMax.QB).toBe(5);
    // A position with no slot is left uncapped (absent).
    expect(standard.positionMax.DL).toBeUndefined();
  });

  it('bounds the bench allowance by the actual bench size', () => {
    const tight: RosterSpec = { ...specOf('standard'), bench: 1 };
    // allowance = min(1, 3) = 1, so QB max = 1 + 1.
    expect(buildRosterFormat(tight).positionMax.QB).toBe(2);
  });
});

describe('rosterFormatToSpec', () => {
  it('round-trips every preset back to its editor spec', () => {
    for (const preset of ROSTER_PRESETS) {
      expect(rosterFormatToSpec(buildRosterFormat(preset.spec))).toEqual(preset.spec);
    }
  });

  it('recovers flex counts and zero-fills unused starters', () => {
    const spec = rosterFormatToSpec(superflex);
    expect(spec.flex).toBe(1);
    expect(spec.superflex).toBe(1);
    expect(spec.starters.DL).toBe(0);
    expect(spec.bench).toBe(6);
  });
});

describe('rosterPositions', () => {
  it('includes starter and flex-eligible positions only', () => {
    expect(rosterPositions(standard)).toEqual(new Set(['QB', 'RB', 'WR', 'TE', 'K', 'DEF']));
  });

  it('excludes IDP for a standard roster but includes it when IDP slots exist', () => {
    expect(rosterPositions(standard).has('DL')).toBe(false);
    for (const pos of ['DL', 'LB', 'DB'] as const) {
      expect(rosterPositions(idp).has(pos)).toBe(true);
    }
  });

  it('a kicker/defense-free roster hides K and DEF', () => {
    const format = buildRosterFormat({
      ...specOf('standard'),
      starters: { QB: 1, RB: 2, WR: 2, TE: 1, K: 0, DEF: 0, DL: 0, LB: 0, DB: 0 },
    });
    expect(format.positionMax.K).toBeUndefined();
    expect(rosterPositions(format).has('K')).toBe(false);
    expect(rosterPositions(format).has('DEF')).toBe(false);
  });
});

const pk = (playerId: string, position: SlotPick['position']): SlotPick => ({ playerId, position });

describe('assignRosterSlots', () => {
  it('lays out every empty slot in display order for an empty roster', () => {
    const slots = assignRosterSlots([], standard);
    expect(slots.map((s) => s.label)).toEqual([
      'QB',
      'RB',
      'RB',
      'WR',
      'WR',
      'TE',
      'FLEX',
      'K',
      'DEF',
      'BN',
      'BN',
      'BN',
      'BN',
      'BN',
      'BN',
    ]);
    expect(slots.every((s) => s.pick === null)).toBe(true);
  });

  it('fills exact-position starters before the flex', () => {
    const slots = assignRosterSlots([pk('a', 'RB'), pk('b', 'RB'), pk('c', 'RB')], standard);
    const filled = slots.filter((s) => s.pick);
    expect(filled.map((s) => s.label)).toEqual(['RB', 'RB', 'FLEX']);
    expect(filled.map((s) => s.pick?.playerId)).toEqual(['a', 'b', 'c']);
  });

  it('routes a QB into the superflex once the QB starter is filled', () => {
    const slots = assignRosterSlots([pk('a', 'QB'), pk('b', 'QB')], superflex);
    const filled = slots.filter((s) => s.pick);
    expect(filled.map((s) => s.label)).toEqual(['QB', 'SUPERFLEX']);
  });

  it('overflows extra players into bench, growing it past all slots', () => {
    // 1 QB starter, no QB-eligible flex, bench 6 → the 8th QB grows bench.
    const picks = Array.from({ length: 8 }, (_, i) => pk(`q${i}`, 'QB'));
    const slots = assignRosterSlots(picks, standard);
    const qbHome = slots.filter((s) => s.pick && s.pick.position === 'QB');
    expect(qbHome).toHaveLength(8);
    // First to a QB slot, the rest to bench; total bench slots grew to 7.
    expect(slots.filter((s) => s.label === 'BN')).toHaveLength(7);
    expect(qbHome[0]?.label).toBe('QB');
    expect(qbHome.slice(1).every((s) => s.label === 'BN')).toBe(true);
  });

  it('places an IDP flex pick for an IDP roster', () => {
    const slots = assignRosterSlots([pk('a', 'DL'), pk('b', 'LB')], idp);
    const filled = slots.filter((s) => s.pick);
    // DL → DL starter, LB → LB starter (both exact before the IDP flex).
    expect(filled.map((s) => s.label)).toEqual(['DL', 'LB']);
  });
});
