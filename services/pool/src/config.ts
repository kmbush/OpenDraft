/**
 * Snapshot build configuration.
 */
import type { Position } from '@opendraft/shared';

export interface SnapshotConfig {
  /** Opaque id stamped onto the snapshot (e.g. a build date). Passed in — the
   * builder never reads the clock, so it stays pure. */
  snapshotId: string;
  /** Top-N players to keep per position group, by Sleeper `search_rank`. A
   * position omitted here is not drafted and produces no players. */
  keepPerPosition: Partial<Record<Position, number>>;
}

/**
 * Position-aware keep counts (AD-5). Top-N is per position group, NOT global,
 * so IDP (DL/LB/DB) is never starved by offense-heavy Sleeper ranks.
 *
 * Sized to fill max-size rosters across a large league with headroom: WR/RB
 * deepest (flex demand), QB/TE generous enough for SUPERFLEX/2QB, K/DEF near the
 * number that actually exist (~1 per team), IDP deep enough for full IDP formats.
 * Total ≈ 444, within the ~300–500 target.
 */
export const DEFAULT_KEEP_PER_POSITION: Partial<Record<Position, number>> = {
  QB: 40,
  RB: 70,
  WR: 80,
  TE: 40,
  K: 32,
  DEF: 32,
  DL: 50,
  LB: 50,
  DB: 50,
};
