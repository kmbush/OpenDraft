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
  /** Epoch ms used to judge news staleness. Passed in so the builder stays pure. */
  now: number;
}

/**
 * Position-aware keep counts (AD-5). Top-N is per position group, NOT global,
 * so IDP (DL/LB/DB) is never starved by offense-heavy Sleeper ranks.
 *
 * **Offence is now deliberately uncapped in practice.** The previous counts
 * (WR 80, RB 70, QB 40, TE 40) were sized to a ~300–500 total, and the cost of
 * that target was real players: at WR 80 the cut fell mid-roster and took Cooper
 * Kupp, Darnell Mooney and Marvin Mims with it — 192 rostered receivers excluded
 * in all. A pool that is missing someone a commissioner goes looking for is
 * broken in the room, and no list length makes up for it. These sit above the
 * number of rostered players at each position, so the cap stops binding and
 * `isCurrent` becomes the thing that decides.
 *
 * IDP stays genuinely capped: there are ~400 defensive backs on NFL rosters and
 * no format drafts anywhere near that many.
 */
export const DEFAULT_KEEP_PER_POSITION: Partial<Record<Position, number>> = {
  QB: 110,
  RB: 175,
  WR: 290,
  TE: 180,
  K: 40,
  DEF: 32,
  DL: 90,
  LB: 90,
  DB: 90,
};
