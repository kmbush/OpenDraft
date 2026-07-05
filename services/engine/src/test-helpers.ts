/** Deterministic fixtures + seeded RNG for the engine tests. Not a test file. */
import type {
  DraftMode,
  DraftSettings,
  DraftState,
  PlayerRef,
  Position,
  RosterFormat,
  Team,
} from '@opendraft/shared';
import { newDraft } from './draft.js';

/** mulberry32 — a tiny deterministic PRNG so auto-pick tests are reproducible. */
export function seededRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function makeTeams(count: number): Team[] {
  return Array.from({ length: count }, (_, i) => ({ slot: i + 1, name: `Team ${i + 1}` }));
}

const TEST_ROSTER: RosterFormat = {
  starters: { QB: 1, RB: 2, WR: 2, TE: 1, K: 1, DEF: 1 },
  flex: [{ kind: 'FLEX', eligible: ['RB', 'WR', 'TE'], count: 1 }],
  bench: 6,
  positionMax: { QB: 4, RB: 8, WR: 8, TE: 3, K: 3, DEF: 3 },
};

export function makeSettings(overrides: Partial<DraftSettings> = {}): DraftSettings {
  return {
    teams: 4,
    rounds: 3,
    mode: 'snake',
    timerSec: 90,
    waitingSec: 8,
    goLiveCountdownSec: 0,
    rosterFormat: TEST_ROSTER,
    ...overrides,
  };
}

/** Build a draft already in ORDER_SET with the given order (default identity). */
export function setupDraft(settings: DraftSettings, order?: number[]): DraftState {
  const teams = makeTeams(settings.teams);
  const base = newDraft({ leagueId: 'L1', draftId: 'D1', settings, teams });
  return {
    ...base,
    order: order ?? teams.map((t) => t.slot),
    status: 'ORDER_SET',
  };
}

/** A pool of PlayerRefs for auto-pick tests. */
export function pool(refs: Array<[string, Position]>): PlayerRef[] {
  return refs.map(([id, position]) => ({ id, position }));
}

export const MODES: DraftMode[] = ['snake', 'linear'];
