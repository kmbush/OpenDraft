/**
 * Sleeper source adapter: the external player-object shape, position mapping, and
 * the ONE network call. Kept separate from the pure builder so tests never touch
 * the network (CONVENTIONS §6, DESIGN AD-5).
 */
import type { Position } from '@opendraft/shared';

export const SLEEPER_PLAYERS_URL = 'https://api.sleeper.app/v1/players/nfl';

/**
 * A raw player object from Sleeper's `/v1/players/nfl` map. Only the fields the
 * builder reads are typed; everything is optional/nullable because it is an
 * external, drift-prone schema (Risk R-2). `search_rank`/`depth_chart_order` are
 * read ONLY at build time and never emitted (AD-6).
 */
export interface SleeperPlayer {
  player_id?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  full_name?: string | null;
  position?: string | null;
  fantasy_positions?: string[] | null;
  active?: boolean | null;
  status?: string | null;
  search_rank?: number | null;
  depth_chart_order?: number | null;
  team?: string | null;
}

/** Sleeper returns `{ player_id: {...} }`. */
export type SleeperPlayerMap = Record<string, SleeperPlayer>;

/**
 * Map Sleeper's granular positions onto our roster position groups. IDP is
 * collapsed into DL/LB/DB so IDP formats have a complete pool (AD-5). A raw
 * position absent here (e.g. punters, offensive line) yields no group and is
 * dropped by the builder.
 */
const POSITION_GROUP: Readonly<Record<string, Position>> = {
  QB: 'QB',
  RB: 'RB',
  FB: 'RB',
  WR: 'WR',
  TE: 'TE',
  K: 'K',
  DEF: 'DEF',
  // Defensive line
  DL: 'DL',
  DE: 'DL',
  DT: 'DL',
  NT: 'DL',
  // Linebackers
  LB: 'LB',
  OLB: 'LB',
  ILB: 'LB',
  MLB: 'LB',
  // Defensive backs
  DB: 'DB',
  CB: 'DB',
  S: 'DB',
  SS: 'DB',
  FS: 'DB',
};

/** Resolve a Sleeper player's roster position group, or null if not draftable. */
export function normalizePosition(sp: SleeperPlayer): Position | null {
  const direct = sp.position ? POSITION_GROUP[sp.position] : undefined;
  if (direct) return direct;
  for (const fp of sp.fantasy_positions ?? []) {
    const mapped = POSITION_GROUP[fp];
    if (mapped) return mapped;
  }
  return null;
}

/**
 * Whether the player still plays. Retired/inactive are dropped (AD-5); injured
 * (IR, etc.) are kept because they are still rostered/draftable.
 */
export function isPlaying(sp: SleeperPlayer): boolean {
  if (sp.active === false) return false;
  const status = (sp.status ?? '').trim().toLowerCase();
  return status !== 'inactive' && status !== 'retired';
}

/**
 * The only network access in this package. Fetches the full Sleeper pool.
 * Isolated so the builder and its tests stay pure/offline.
 */
export async function fetchSleeperPlayers(
  url: string = SLEEPER_PLAYERS_URL,
): Promise<SleeperPlayerMap> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Sleeper fetch failed: ${res.status} ${res.statusText}`);
  }
  return (await res.json()) as SleeperPlayerMap;
}
