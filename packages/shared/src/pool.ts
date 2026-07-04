/**
 * Player-pool snapshot contract (DESIGN AD-5/AD-6, §2).
 *
 * Built by `services/pool`, stored as an S3 object, loaded once by the clients
 * and cached in IndexedDB. It is a client-facing contract, so it lives here in
 * `shared` and is imported by both ends.
 *
 * Ranking invariant (CONVENTIONS §5, AD-6): a snapshot player is exactly a
 * `Player` — id + name parts + position, and NOTHING that encodes draft value.
 * The players array is pre-sorted `(position, lastName, firstName)`; no ranking
 * signal is ever shipped.
 */
import type { Player } from './domain.js';

export interface PoolSnapshot {
  /** Opaque id for this snapshot (e.g. a build date); referenced by the draft. */
  snapshotId: string;
  /** Attribution for the data source (Risk R-1), e.g. 'sleeper'. */
  source: string;
  /** Ranking-free players, pre-sorted by (position, lastName, firstName). */
  players: Player[];
}
