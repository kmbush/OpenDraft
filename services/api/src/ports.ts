/**
 * Ports (hexagonal boundary). The core handler pipeline depends ONLY on these
 * interfaces; AWS adapters implement them at the edge. This is what makes the
 * pipeline unit-testable with in-memory fakes and zero AWS (CONVENTIONS §4.3, §6).
 */
import type {
  DraftState,
  LeagueMeta,
  OutboundMessage,
  Pick,
  PoolSnapshot,
} from '@opendraft/shared';

export type ConnectionRole = 'station' | 'board' | 'admin';

export interface ConnectionRecord {
  connectionId: string;
  leagueId: string;
  role: ConnectionRole;
  connectedAt: number;
}

/** Result of a version-guarded write: succeeded, or lost the optimistic race. */
export type CommitResult = { ok: true } | { ok: false; currentVersion: number };

/**
 * Transactional draft state + connections + setup CRUD, all league-scoped (§7).
 * `commit` is the optimistic-concurrency seam: it writes `next` guarded by
 * `prev.version` (DynamoDB `ConditionExpression: version = :expected`) and diffs
 * the pick log into append/delete/replace of the append-only PICK items.
 */
export interface Persistence {
  loadDraft(leagueId: string, draftId: string): Promise<DraftState | null>;
  /** Version-guarded write of a reduced state (pick or non-pick mutation). */
  commit(leagueId: string, prev: DraftState, next: DraftState): Promise<CommitResult>;

  createLeague(meta: LeagueMeta): Promise<void>;
  getLeague(leagueId: string): Promise<LeagueMeta | null>;
  /** Writes the DRAFT item plus one TEAM item per team, in SETUP. */
  createDraft(state: DraftState): Promise<void>;

  putConnection(record: ConnectionRecord): Promise<void>;
  deleteConnection(leagueId: string, connectionId: string): Promise<void>;
  listConnections(leagueId: string): Promise<ConnectionRecord[]>;

  /** Atomically bump the passcode-attempt counter in a TTL window; returns the
   * new count so the caller can rate-limit (AD-8). */
  registerAuthAttempt(leagueId: string, now: number, windowSec: number): Promise<number>;
}

/** Push a message to one WS connection; reports a pruned (stale) connection. */
export interface Broadcaster {
  post(connectionId: string, message: OutboundMessage): Promise<'ok' | 'gone'>;
}

/** One-shot timer at `pickDeadline` (EventBridge Scheduler). `version` lets the
 * fire handler detect a stale schedule that a manual pick already superseded. */
export interface Scheduler {
  arm(input: { draftId: string; version: number; fireAt: number }): Promise<void>;
  cancel(draftId: string): Promise<void>;
}

/** Loads a pool snapshot (for the auto-pick `available` list). */
export interface PoolLoader {
  load(snapshotId: string): Promise<PoolSnapshot>;
}

/** Admin passcode hash + HMAC session key (SSM Parameter Store). */
export interface Secrets {
  getPasscodeHash(): Promise<string>;
  getHmacKey(): Promise<string>;
}

/** Ambient inputs the pure engine forbids reading itself — injected at the edge. */
export interface Environment {
  /** Wall clock, epoch ms. */
  now(): number;
  /** Randomness for auto-pick (Math.random in prod; seeded in tests). */
  rng(): number;
  /** Opaque id generator for new leagues/drafts (UUID/ULID at the edge). */
  newId(): string;
  /** The single self-hosted league scope today; multi-tenant derives it from auth. */
  leagueId: string;
  /** Admin session token lifetime, seconds. */
  sessionTtlSec: number;
  /** Max passcode attempts per rate-limit window, and the window length. */
  authMaxAttempts: number;
  authWindowSec: number;
}

/** Everything the core pipeline needs, wired once at the Lambda edge. */
export interface Deps {
  persistence: Persistence;
  broadcaster: Broadcaster;
  scheduler: Scheduler;
  pool: PoolLoader;
  secrets: Secrets;
  env: Environment;
}

/** Re-exported for adapters/tests that construct PICK items directly. */
export type { Pick };
