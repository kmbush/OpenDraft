import type { DraftState, LeagueMeta } from '@opendraft/shared';
import { describe, expect, it } from 'vitest';
import { DEFAULT_ROSTER_SPEC, buildRosterFormat } from './roster.js';
import { DEFAULT_SETUP_SEED, draftToSetupSeed } from './setupSeed.js';
import { teamColorForSlot } from './teams.js';

const baseDraft: DraftState = {
  leagueId: 'dev-league',
  draftId: 'd1',
  status: 'COMPLETE',
  settings: {
    teams: 2,
    rounds: 12,
    mode: 'linear',
    timerSec: 60,
    waitingSec: 5,
    goLiveCountdownSec: 0,
    showByeWeeks: false,
    rosterFormat: buildRosterFormat({ ...DEFAULT_ROSTER_SPEC, superflex: 1 }),
  },
  teams: [
    { slot: 2, name: 'Second', color: '#123456', ownerLabel: 'Bob' },
    { slot: 1, name: 'First' },
  ],
  order: [1, 2],
  picks: [],
  pointer: 25,
  poolSnapshotId: '2026-07-03',
  version: 5,
};

const league: LeagueMeta = {
  leagueId: 'dev-league',
  name: 'The Gridiron',
  theme: { colors: { accent: '#00ff00' }, logo: 'https://cdn/logo.png' },
  createdAt: 0,
};

describe('draftToSetupSeed', () => {
  it('maps settings, pool, and slot-sorted teams with color fallback', () => {
    const seed = draftToSetupSeed(baseDraft, league);
    expect(seed.teams).toBe(2);
    expect(seed.rounds).toBe(12);
    expect(seed.mode).toBe('linear');
    expect(seed.timerSec).toBe(60);
    expect(seed.waitingSec).toBe(5);
    expect(seed.goLiveCountdownSec).toBe(0);
    expect(seed.showByeWeeks).toBe(false);
    expect(seed.poolSnapshotId).toBe('2026-07-03');
    expect(seed.roster.superflex).toBe(1);
    // Rows are ordered by slot; a team with no color falls back to its slot color.
    expect(seed.teamRows).toEqual([
      { name: 'First', color: teamColorForSlot(1), ownerLabel: '' },
      { name: 'Second', color: '#123456', ownerLabel: 'Bob' },
    ]);
  });

  it('pulls branding from the league META', () => {
    const seed = draftToSetupSeed(baseDraft, league);
    expect(seed.name).toBe('The Gridiron');
    expect(seed.accent).toBe('#00ff00');
    expect(seed.logoUrl).toBe('https://cdn/logo.png');
    expect(seed.logoData).toBe('');
  });

  it('routes a data-URL logo to logoData, not logoUrl', () => {
    const seed = draftToSetupSeed(baseDraft, {
      ...league,
      theme: { logo: 'data:image/png;base64,AAAA' },
    });
    expect(seed.logoData).toBe('data:image/png;base64,AAAA');
    expect(seed.logoUrl).toBe('');
  });

  it('falls back to ship defaults when no league META is available', () => {
    const seed = draftToSetupSeed(baseDraft);
    expect(seed.name).toBe(DEFAULT_SETUP_SEED.name);
    expect(seed.accent).toBe(DEFAULT_SETUP_SEED.accent);
    expect(seed.logoUrl).toBe('');
    expect(seed.logoData).toBe('');
  });
});
