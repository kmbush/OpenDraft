/**
 * Roster-format helpers — pure and rank-free. Three concerns:
 *   1. `buildRosterFormat` turns the admin's stepper spec into a valid
 *      `RosterFormat` (+ sane `positionMax` caps so engine auto-pick stays sane).
 *   2. `rosterPositions` derives the positions a roster can actually use, so the
 *      station hides players it could never draft (e.g. IDP in a standard league).
 *   3. `assignRosterSlots` lays a team's picks into labeled starter/flex/bench
 *      slots for the station's "Roster so far" panel.
 * None of this carries a value/ADP signal (CONVENTIONS §5).
 */
import {
  FLEX_ELIGIBILITY,
  type FlexKind,
  type FlexSlot,
  IDP_FLEX_ELIGIBILITY,
  IDP_POSITIONS,
  OFFENSE_POSITIONS,
  type Position,
  type RosterFormat,
  SUPERFLEX_ELIGIBILITY,
} from '@opendraft/shared';

/** Every draftable position — used as the bench slot's eligibility (bench takes anyone). */
const ALL_POSITIONS: readonly Position[] = [...OFFENSE_POSITIONS, ...IDP_POSITIONS];

/**
 * Per-position bench headroom above starters+flex. Bounds auto-pick so it can't
 * stack a fringe position (e.g. 8 kickers); capped by the actual bench size.
 */
const BENCH_ALLOWANCE = 3;

/** The admin roster editor's flat, stepper-friendly shape. */
export interface RosterSpec {
  /** Fixed starter counts for every position (0 = no slot). */
  starters: Record<Position, number>;
  flex: number;
  superflex: number;
  idpFlex: number;
  bench: number;
}

const zeroStarters = (): Record<Position, number> => ({
  QB: 0,
  RB: 0,
  WR: 0,
  TE: 0,
  K: 0,
  DEF: 0,
  DL: 0,
  LB: 0,
  DB: 0,
});

/** The standard-redraft roster — the editor's default and the "Standard" preset. */
export const DEFAULT_ROSTER_SPEC: RosterSpec = {
  starters: { ...zeroStarters(), QB: 1, RB: 2, WR: 2, TE: 1, K: 1, DEF: 1 },
  flex: 1,
  superflex: 0,
  idpFlex: 0,
  bench: 6,
};

/** One-click starting points that populate the editor (admin can then adjust). */
export const ROSTER_PRESETS: { key: string; label: string; spec: RosterSpec }[] = [
  { key: 'standard', label: 'Standard', spec: DEFAULT_ROSTER_SPEC },
  { key: 'superflex', label: 'Superflex', spec: { ...DEFAULT_ROSTER_SPEC, superflex: 1 } },
  {
    key: 'idp',
    label: 'IDP',
    spec: {
      ...DEFAULT_ROSTER_SPEC,
      starters: { ...DEFAULT_ROSTER_SPEC.starters, DL: 1, LB: 1, DB: 1 },
      idpFlex: 1,
    },
  },
  {
    key: '2qb',
    label: '2-QB',
    spec: { ...DEFAULT_ROSTER_SPEC, starters: { ...DEFAULT_ROSTER_SPEC.starters, QB: 2 } },
  },
];

/**
 * Build a valid `RosterFormat` from the editor spec. Starters/flex slots with a
 * zero count are dropped; `positionMax` = starters + eligible-flex + a bench
 * allowance, for every position the roster can hold.
 */
export function buildRosterFormat(spec: RosterSpec): RosterFormat {
  const starters: Partial<Record<Position, number>> = {};
  for (const pos of ALL_POSITIONS) {
    if (spec.starters[pos] > 0) starters[pos] = spec.starters[pos];
  }

  const flex: FlexSlot[] = [];
  if (spec.flex > 0) flex.push({ kind: 'FLEX', eligible: [...FLEX_ELIGIBILITY], count: spec.flex });
  if (spec.superflex > 0) {
    flex.push({ kind: 'SUPERFLEX', eligible: [...SUPERFLEX_ELIGIBILITY], count: spec.superflex });
  }
  if (spec.idpFlex > 0) {
    flex.push({ kind: 'IDP_FLEX', eligible: [...IDP_FLEX_ELIGIBILITY], count: spec.idpFlex });
  }

  // base = starters + every flex slot the position is eligible for.
  const base: Partial<Record<Position, number>> = { ...starters };
  for (const slot of flex) {
    for (const pos of slot.eligible) base[pos] = (base[pos] ?? 0) + slot.count;
  }
  const allowance = Math.min(spec.bench, BENCH_ALLOWANCE);
  const positionMax: Partial<Record<Position, number>> = {};
  for (const pos of Object.keys(base) as Position[]) {
    positionMax[pos] = (base[pos] ?? 0) + allowance;
  }

  return { starters, flex, bench: spec.bench, positionMax };
}

/**
 * Invert `buildRosterFormat`: recover the editor spec from a stored `RosterFormat`
 * so a finished draft's roster can pre-fill the setup form. Round-trips the fields
 * the editor owns (starter counts, flex counts, bench); the derived `positionMax`
 * is recomputed by `buildRosterFormat`, not read back here.
 */
export function rosterFormatToSpec(format: RosterFormat): RosterSpec {
  const starters = zeroStarters();
  for (const [pos, count] of Object.entries(format.starters)) {
    if (count) starters[pos as Position] = count;
  }
  const flexCount = (kind: FlexKind) =>
    format.flex.filter((f) => f.kind === kind).reduce((n, f) => n + f.count, 0);
  return {
    starters,
    flex: flexCount('FLEX'),
    superflex: flexCount('SUPERFLEX'),
    idpFlex: flexCount('IDP_FLEX'),
    bench: format.bench,
  };
}

/** Every position the roster can use: any starter slot, or flex/superflex/idp-flex eligible. */
export function rosterPositions(format: RosterFormat): Set<Position> {
  const positions = new Set<Position>();
  for (const [pos, count] of Object.entries(format.starters)) {
    if ((count ?? 0) > 0) positions.add(pos as Position);
  }
  for (const slot of format.flex) {
    if (slot.count > 0) for (const pos of slot.eligible) positions.add(pos);
  }
  return positions;
}

/** A drafted (or optimistic) player to place into a slot. */
export interface SlotPick {
  playerId: string;
  position: Position;
  /** Optimistic pick awaiting server confirmation (styled distinctly). */
  pending?: boolean;
}

/** A labeled roster slot: what it accepts, and the player filling it (or empty). */
export interface RosterSlot {
  label: string;
  eligible: Position[];
  pick: SlotPick | null;
}

interface SlotTemplate {
  label: string;
  eligible: Position[];
}

/** Empty slot templates in display order: QB→flex→K/DEF→IDP→idp-flex→bench. */
function slotTemplates(format: RosterFormat): SlotTemplate[] {
  const templates: SlotTemplate[] = [];
  const starter = (pos: Position) => {
    for (let i = 0; i < (format.starters[pos] ?? 0); i++) {
      templates.push({ label: pos, eligible: [pos] });
    }
  };
  const flexOf = (kind: FlexSlot['kind'], label: string) => {
    for (const slot of format.flex) {
      if (slot.kind !== kind) continue;
      for (let i = 0; i < slot.count; i++) templates.push({ label, eligible: slot.eligible });
    }
  };
  starter('QB');
  starter('RB');
  starter('WR');
  starter('TE');
  flexOf('FLEX', 'FLEX');
  flexOf('SUPERFLEX', 'SUPERFLEX');
  starter('K');
  starter('DEF');
  starter('DL');
  starter('LB');
  starter('DB');
  flexOf('IDP_FLEX', 'IDP FLEX');
  for (let i = 0; i < format.bench; i++)
    templates.push({ label: 'BN', eligible: [...ALL_POSITIONS] });
  return templates;
}

/**
 * Deterministically place `picks` (draft order) into roster slots: exact-position
 * starters first, then flex/superflex/idp-flex by eligibility, then bench. Anything
 * that overflows every slot appends an extra bench slot so nothing is dropped.
 */
export function assignRosterSlots(picks: SlotPick[], format: RosterFormat): RosterSlot[] {
  const slots: RosterSlot[] = slotTemplates(format).map((t) => ({ ...t, pick: null }));
  for (const pick of picks) {
    const slot = slots.find((s) => s.pick === null && s.eligible.includes(pick.position));
    if (slot) slot.pick = pick;
    else slots.push({ label: 'BN', eligible: [...ALL_POSITIONS], pick });
  }
  return slots;
}
