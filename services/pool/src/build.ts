/**
 * The pure snapshot builder (DESIGN AD-5/AD-6, the crown jewel).
 *
 * `buildSnapshot(raw, config) => PoolSnapshot`. No I/O, no clock — deterministic
 * given its inputs, so it is exhaustively unit-testable against a fixture.
 *
 * Pipeline: normalize → drop non-playing → drop team-less (retired/unsigned) →
 * keep top-N per position by `search_rank` → DISCARD rank → sort
 * `(position, lastName, firstName)`.
 * Rank is read only here to select/order the top-N and is never emitted (AD-6):
 * the output objects are plain `Player`s, so no ranking signal can exist in them
 * by construction. Team abbr + bye week ARE carried — they are factual identity /
 * schedule data, not a value signal (AD-6).
 */
import type { Player, PoolSnapshot, Position } from '@opendraft/shared';
import { positionRank } from '@opendraft/shared';
import { byeForTeam } from './byes.js';
import type { SnapshotConfig } from './config.js';
import {
  type SleeperPlayer,
  type SleeperPlayerMap,
  isPlaying,
  normalizePosition,
} from './sleeper.js';

function normalizeName(sp: SleeperPlayer): { firstName: string; lastName: string } {
  const first = (sp.first_name ?? '').trim();
  const last = (sp.last_name ?? '').trim();
  if (first || last) return { firstName: first, lastName: last };
  const full = (sp.full_name ?? '').trim();
  if (!full) return { firstName: '', lastName: '' };
  const parts = full.split(/\s+/);
  return { firstName: parts.slice(0, -1).join(' '), lastName: parts.at(-1) ?? '' };
}

function compareByName(a: Player, b: Player): number {
  return a.lastName.localeCompare(b.lastName, 'en') || a.firstName.localeCompare(b.firstName, 'en');
}

/** Final served order: (position group, lastName, firstName). No ranking (AD-6). */
function compareForOutput(a: Player, b: Player): number {
  return positionRank(a.position) - positionRank(b.position) || compareByName(a, b);
}

interface Ranked {
  player: Player;
  /** Sleeper search_rank; lower = more relevant. Build-time only, never emitted. */
  rank: number;
}

export function buildSnapshot(raw: SleeperPlayerMap, config: SnapshotConfig): PoolSnapshot {
  const byPosition = new Map<Position, Ranked[]>();

  for (const [key, sp] of Object.entries(raw)) {
    if (!isPlaying(sp)) continue;
    const position = normalizePosition(sp);
    if (position === null) continue;
    if (config.keepPerPosition[position] === undefined) continue; // position not drafted
    const id = sp.player_id ?? key;
    if (!id) continue;
    const { firstName, lastName } = normalizeName(sp);
    const team = sp.team?.trim();
    // Drop players with no current NFL team — retired players and unsigned free
    // agents (Sleeper keeps them with a rank but no team). Team defenses and active
    // players always carry a team, so this only removes the ones you'd never draft.
    if (!team) continue;
    const bye = byeForTeam(team);
    const player: Player = {
      id,
      firstName,
      lastName,
      position,
      team,
      ...(bye !== undefined ? { bye } : {}),
    };
    const rank = typeof sp.search_rank === 'number' ? sp.search_rank : Number.POSITIVE_INFINITY;
    const bucket = byPosition.get(position);
    if (bucket) bucket.push({ player, rank });
    else byPosition.set(position, [{ player, rank }]);
  }

  const players: Player[] = [];
  for (const [position, keep] of Object.entries(config.keepPerPosition) as [Position, number][]) {
    const bucket = byPosition.get(position);
    if (!bucket) continue;
    // Top-N by search_rank; name tiebreak keeps selection deterministic.
    bucket.sort((a, b) => a.rank - b.rank || compareByName(a.player, b.player));
    for (const { player } of bucket.slice(0, keep)) players.push(player);
  }

  players.sort(compareForOutput);
  return { snapshotId: config.snapshotId, source: 'sleeper', players };
}
