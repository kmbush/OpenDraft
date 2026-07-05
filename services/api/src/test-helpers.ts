/** Shared fixtures for the api core tests. Not a test file. */
import { newDraft, reduce } from '@opendraft/engine';
import type { DraftSettings, DraftState, PoolSnapshot, Team } from '@opendraft/shared';
import {
  FakePersistence,
  FakePoolLoader,
  FakeScheduler,
  FakeSecrets,
  SpyBroadcaster,
  fakeEnv,
} from './fakes.js';
import type { Deps } from './ports.js';

const SETTINGS: DraftSettings = {
  teams: 2,
  rounds: 2,
  mode: 'linear',
  timerSec: 90,
  waitingSec: 8,
  goLiveCountdownSec: 0,
  rosterFormat: {
    starters: { QB: 1, RB: 2, WR: 2 },
    flex: [],
    bench: 2,
    positionMax: { QB: 2, RB: 8, WR: 8, TE: 2 },
  },
};

const TEAMS: Team[] = [
  { slot: 1, name: 'Alpha' },
  { slot: 2, name: 'Bravo' },
];

/** A draft started and ON_CLOCK for team 1 (linear). version = 2 (SET_ORDER, START). */
export function liveDraft(): DraftState {
  let s = newDraft({ leagueId: 'L1', draftId: 'D1', settings: SETTINGS, teams: TEAMS });
  s = reduce(s, { type: 'SET_ORDER', order: [1, 2] }, { now: 0 }).state;
  s = reduce(s, { type: 'START' }, { now: 0 }).state;
  return { ...s, poolSnapshotId: '2026-07-03' };
}

export const POOL: PoolSnapshot = {
  snapshotId: '2026-07-03',
  source: 'sleeper',
  players: [
    { id: 'rb1', firstName: 'A', lastName: 'Back', position: 'RB' },
    { id: 'wr1', firstName: 'B', lastName: 'Wide', position: 'WR' },
    { id: 'qb1', firstName: 'C', lastName: 'Quarter', position: 'QB' },
  ],
};

export interface Harness {
  deps: Deps;
  persistence: FakePersistence;
  broadcaster: SpyBroadcaster;
  scheduler: FakeScheduler;
  secrets: FakeSecrets;
}

/** Build a Deps wired to fakes, with two connections (station c1, board c2). */
export function harness(options: { hash?: string; key?: string } = {}): Harness {
  const persistence = new FakePersistence();
  const broadcaster = new SpyBroadcaster();
  const scheduler = new FakeScheduler();
  const secrets = new FakeSecrets(options.hash ?? 'unused-hash', options.key ?? 'hmac-key');
  const pool = new FakePoolLoader(POOL);

  persistence.connections.push(
    { connectionId: 'c1', leagueId: 'L1', role: 'station', connectedAt: 0 },
    { connectionId: 'c2', leagueId: 'L1', role: 'board', connectedAt: 0 },
  );

  const deps: Deps = { persistence, broadcaster, scheduler, pool, secrets, env: fakeEnv() };
  return { deps, persistence, broadcaster, scheduler, secrets };
}
