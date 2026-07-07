/**
 * Setup-form seed helpers. The admin setup form is initialized from a `SetupSeed`
 * — the ship default for a first draft, or a seed derived from a just-finished
 * draft (`draftToSetupSeed`) so re-running the same league is one click + Create.
 * Pure and unit-tested; the React form only reads these values into local state.
 */
import type { DraftState, LeagueMeta } from '@opendraft/shared';
import { DEFAULT_ROSTER_SPEC, type RosterSpec, rosterFormatToSpec } from './roster.js';
import { teamColorForSlot } from './teams.js';
import { DEFAULT_ACCENT } from './theme.js';

/** Editable identity for one team in the setup form (name/color/owner). */
export interface TeamConfig {
  name: string;
  color: string;
  ownerLabel: string;
}

const newTeamConfig = (slot: number): TeamConfig => ({
  name: '',
  color: teamColorForSlot(slot),
  ownerLabel: '',
});

/** Grow/shrink the config list to `n`, preserving existing rows and their edits. */
export const resizeTeamConfigs = (rows: TeamConfig[], n: number): TeamConfig[] =>
  Array.from({ length: n }, (_, i) => rows[i] ?? newTeamConfig(i + 1));

/** Everything the setup form needs to render — one value the form seeds all state from. */
export interface SetupSeed {
  name: string;
  teams: number;
  teamRows: TeamConfig[];
  rounds: number;
  mode: 'snake' | 'linear';
  timerSec: number;
  waitingSec: number;
  goLiveCountdownSec: number;
  showByeWeeks: boolean;
  roster: RosterSpec;
  poolSnapshotId: string;
  accent: string;
  /** A typed logo URL; empty when the logo is an uploaded data-URL (see `logoData`). */
  logoUrl: string;
  /** An uploaded logo as a data-URL; empty when the logo is a plain URL. */
  logoData: string;
}

/** The ship default seed — the first-run setup form. */
export const DEFAULT_SETUP_SEED: SetupSeed = {
  name: 'My League',
  teams: 10,
  teamRows: resizeTeamConfigs([], 10),
  rounds: 15,
  mode: 'snake',
  timerSec: 90,
  waitingSec: 10,
  goLiveCountdownSec: 30,
  showByeWeeks: true,
  roster: DEFAULT_ROSTER_SPEC,
  poolSnapshotId: 'bundled',
  accent: DEFAULT_ACCENT,
  logoUrl: '',
  logoData: '',
};

/**
 * Derive a setup seed from a finished draft (+ its league META) so the admin can
 * re-run the same league. Everything unavailable falls back to the ship default.
 */
export function draftToSetupSeed(draft: DraftState, league?: LeagueMeta): SetupSeed {
  const s = draft.settings;
  const teamRows: TeamConfig[] = [...draft.teams]
    .sort((a, b) => a.slot - b.slot)
    .map((t) => ({
      name: t.name,
      color: t.color ?? teamColorForSlot(t.slot),
      ownerLabel: t.ownerLabel ?? '',
    }));
  const logo = league?.theme?.logo ?? '';
  const isData = logo.startsWith('data:');
  return {
    name: league?.name ?? DEFAULT_SETUP_SEED.name,
    teams: teamRows.length || DEFAULT_SETUP_SEED.teams,
    teamRows: teamRows.length ? teamRows : DEFAULT_SETUP_SEED.teamRows,
    rounds: s.rounds,
    mode: s.mode,
    timerSec: s.timerSec,
    waitingSec: s.waitingSec,
    goLiveCountdownSec: s.goLiveCountdownSec,
    showByeWeeks: s.showByeWeeks ?? DEFAULT_SETUP_SEED.showByeWeeks,
    roster: rosterFormatToSpec(s.rosterFormat),
    poolSnapshotId: draft.poolSnapshotId ?? DEFAULT_SETUP_SEED.poolSnapshotId,
    accent: league?.theme?.colors?.accent ?? DEFAULT_SETUP_SEED.accent,
    logoUrl: isData ? '' : logo,
    logoData: isData ? logo : '',
  };
}
