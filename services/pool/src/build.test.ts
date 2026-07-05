import type { Player, PoolSnapshot, Position } from '@opendraft/shared';
import { describe, expect, it } from 'vitest';
import { buildSnapshot } from './build.js';
import { TEAM_BYE, byeForTeam } from './byes.js';
import type { SnapshotConfig } from './config.js';
import { SLEEPER_FIXTURE } from './fixtures.js';

const CONFIG: SnapshotConfig = {
  snapshotId: '2026-07-03',
  keepPerPosition: { QB: 2, RB: 2, WR: 2, TE: 1, K: 1, DEF: 1, DL: 2, LB: 2, DB: 2 },
};

/** Same grouping order the builder emits; used to verify the sort independently. */
const POSITION_ORDER: Position[] = ['QB', 'RB', 'WR', 'TE', 'K', 'DEF', 'DL', 'LB', 'DB'];

/**
 * Every ranking/ADP-ish or non-Player field that must NEVER reach a client
 * (AD-6). `team`/`bye` are deliberately ABSENT — they are factual identity /
 * schedule data, not a value signal, and are allowed on `Player`.
 */
const BANNED_FIELDS = [
  'search_rank',
  'depth_chart_order',
  'adp',
  'rank',
  'projection',
  'fantasy_positions',
  'active',
  'status',
  'full_name',
];

/** Keys a served `Player` may carry — nothing outside this set may leak (AD-6). */
const ALLOWED_KEYS = ['bye', 'firstName', 'id', 'lastName', 'position', 'team'];

function build(): PoolSnapshot {
  return buildSnapshot(SLEEPER_FIXTURE, CONFIG);
}

function byId(snapshot: PoolSnapshot, id: string): Player | undefined {
  return snapshot.players.find((p) => p.id === id);
}

describe('ordering invariant (CONVENTIONS §5, AD-6)', () => {
  it('ships NO ranking signal — banned fields appear nowhere in the output', () => {
    const json = JSON.stringify(build());
    for (const field of BANNED_FIELDS) {
      expect(json).not.toContain(`"${field}"`);
    }
  });

  it('each player object carries only allowed keys (id/name/position + team/bye)', () => {
    for (const player of build().players) {
      for (const key of Object.keys(player)) {
        expect(ALLOWED_KEYS).toContain(key);
      }
    }
  });

  it('is pre-sorted by (position group, lastName, firstName)', () => {
    const players = build().players;
    for (let i = 1; i < players.length; i++) {
      const prev = players[i - 1];
      const cur = players[i];
      if (!prev || !cur) throw new Error('unexpected sparse array');
      const posDelta = POSITION_ORDER.indexOf(prev.position) - POSITION_ORDER.indexOf(cur.position);
      expect(posDelta).toBeLessThanOrEqual(0);
      if (posDelta === 0) {
        const nameDelta =
          prev.lastName.localeCompare(cur.lastName, 'en') ||
          prev.firstName.localeCompare(cur.firstName, 'en');
        expect(nameDelta).toBeLessThanOrEqual(0);
      }
    }
  });
});

describe('schema normalization', () => {
  it('maps id/name parts/position/team from a standard Sleeper record', () => {
    expect(byId(build(), 'qbMahomes')).toEqual({
      id: 'qbMahomes',
      firstName: 'Patrick',
      lastName: 'Mahomes',
      position: 'QB',
      team: 'KC',
      bye: 10,
    });
  });

  it('splits full_name when first/last are missing', () => {
    expect(byId(build(), 'qbCaleb')).toMatchObject({ firstName: 'Caleb', lastName: 'Williams' });
  });

  it('falls back to the map key when player_id is absent', () => {
    // qbCaleb has no player_id field; the map key is used as the id.
    expect(byId(build(), 'qbCaleb')?.id).toBe('qbCaleb');
  });

  it('collapses granular IDP positions to DL/LB/DB (position field)', () => {
    expect(byId(build(), 'dlGarrett')?.position).toBe('DL'); // DE → DL
    expect(byId(build(), 'dlDonald')?.position).toBe('DL'); // DT → DL
    expect(byId(build(), 'lbSmith')?.position).toBe('LB'); // ILB → LB
    expect(byId(build(), 'dbGardner')?.position).toBe('DB'); // CB → DB
  });

  it('resolves position via fantasy_positions when position is null', () => {
    expect(byId(build(), 'dbJames')?.position).toBe('DB');
  });
});

describe('position-aware top-N and filtering (AD-5)', () => {
  it('excludes inactive, retired, and undraftable-position players', () => {
    const s = build();
    expect(byId(s, 'inactiveWR')).toBeUndefined();
    expect(byId(s, 'retiredRB')).toBeUndefined();
    expect(byId(s, 'punter1')).toBeUndefined();
  });

  it('does not starve IDP — DL/LB/DB survive at their caps', () => {
    const counts = countByPosition(build());
    expect(counts.DL).toBe(2);
    expect(counts.LB).toBe(2);
    expect(counts.DB).toBe(2);
  });

  it('respects per-position caps, keeping the best search_rank', () => {
    const s = build();
    expect(countByPosition(s).RB).toBe(2);
    expect(byId(s, 'rbMoss')).toBeUndefined(); // worst RB rank, dropped by the cap
    // QB cap keeps the two best ranks (Williams=1, Mahomes=5); Allen=10 is dropped.
    expect(byId(s, 'qbAllen')).toBeUndefined();
  });

  it('treats a null search_rank as least-relevant (sorted last, dropped by cap)', () => {
    expect(byId(build(), 'wrNoRank')).toBeUndefined();
  });

  it('omits positions absent from the config entirely', () => {
    const s = buildSnapshot(SLEEPER_FIXTURE, { snapshotId: 'x', keepPerPosition: { QB: 5 } });
    expect(new Set(s.players.map((p) => p.position))).toEqual(new Set(['QB']));
  });

  it('carries snapshotId and source attribution', () => {
    const s = build();
    expect(s.snapshotId).toBe('2026-07-03');
    expect(s.source).toBe('sleeper');
  });
});

describe('team + bye attachment (factual, allowed under AD-6)', () => {
  it('carries the NFL team abbr from Sleeper onto the player', () => {
    expect(byId(build(), 'wrJefferson')?.team).toBe('MIN');
    expect(byId(build(), 'wrChase')?.team).toBe('CIN');
  });

  it('attaches the bye week for the player’s team from TEAM_BYE', () => {
    expect(byId(build(), 'wrJefferson')?.bye).toBe(6); // MIN
    expect(byId(build(), 'wrChase')?.bye).toBe(10); // CIN
  });

  it('drops a player with no current team — even a top-ranked one', () => {
    const s = build();
    // faTopWR is active and rank 0 (the best), but has no NFL team → excluded.
    expect(byId(s, 'faTopWR')).toBeUndefined();
    // the teamed WRs fill the cap in its place (no team-less player displaces them).
    expect(byId(s, 'wrJefferson')).toBeDefined();
    expect(byId(s, 'wrChase')).toBeDefined();
  });
});

describe('byeForTeam', () => {
  it('resolves a known team to its bye week', () => {
    expect(byeForTeam('BUF')).toBe(TEAM_BYE.BUF);
    expect(byeForTeam('KC')).toBe(10);
  });

  it('returns undefined for unknown, empty, or missing teams', () => {
    expect(byeForTeam('ZZZ')).toBeUndefined();
    expect(byeForTeam('')).toBeUndefined();
    expect(byeForTeam(null)).toBeUndefined();
    expect(byeForTeam(undefined)).toBeUndefined();
  });
});

function countByPosition(snapshot: PoolSnapshot): Record<string, number> {
  return snapshot.players.reduce<Record<string, number>>((acc, p) => {
    acc[p.position] = (acc[p.position] ?? 0) + 1;
    return acc;
  }, {});
}
