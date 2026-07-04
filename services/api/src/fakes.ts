/**
 * In-memory port fakes + a spy broadcaster for testing the core pipeline without
 * AWS (CONVENTIONS §6). Not a test file.
 */
import type { DraftState, LeagueMeta, OutboundMessage, PoolSnapshot } from '@opendraft/shared';
import type {
  Broadcaster,
  CommitResult,
  ConnectionRecord,
  Environment,
  Persistence,
  PoolLoader,
  Scheduler,
  Secrets,
} from './ports.js';

/** Optimistic-concurrency-correct in-memory Persistence. */
export class FakePersistence implements Persistence {
  drafts = new Map<string, DraftState>();
  leagues = new Map<string, LeagueMeta>();
  connections: ConnectionRecord[] = [];
  authAttempts = 0;

  private draftKey(leagueId: string, draftId: string): string {
    return `${leagueId}#${draftId}`;
  }

  seed(state: DraftState): void {
    this.drafts.set(this.draftKey(state.leagueId, state.draftId), clone(state));
  }

  async loadDraft(leagueId: string, draftId: string): Promise<DraftState | null> {
    const found = this.drafts.get(this.draftKey(leagueId, draftId));
    return found ? clone(found) : null;
  }

  async commit(leagueId: string, prev: DraftState, next: DraftState): Promise<CommitResult> {
    const key = this.draftKey(leagueId, next.draftId);
    const current = this.drafts.get(key);
    // The version guard: fail if the stored version moved since `prev` was read.
    if (!current || current.version !== prev.version) {
      return { ok: false, currentVersion: current?.version ?? prev.version };
    }
    this.drafts.set(key, clone(next));
    return { ok: true };
  }

  async createLeague(meta: LeagueMeta): Promise<void> {
    this.leagues.set(meta.leagueId, clone(meta));
  }
  async getLeague(leagueId: string): Promise<LeagueMeta | null> {
    const found = this.leagues.get(leagueId);
    return found ? clone(found) : null;
  }
  async createDraft(state: DraftState): Promise<void> {
    this.seed(state);
  }

  async putConnection(record: ConnectionRecord): Promise<void> {
    this.connections = this.connections.filter((c) => c.connectionId !== record.connectionId);
    this.connections.push({ ...record });
  }
  async deleteConnection(_leagueId: string, connectionId: string): Promise<void> {
    this.connections = this.connections.filter((c) => c.connectionId !== connectionId);
  }
  async listConnections(leagueId: string): Promise<ConnectionRecord[]> {
    return this.connections.filter((c) => c.leagueId === leagueId).map((c) => ({ ...c }));
  }

  async registerAuthAttempt(): Promise<number> {
    this.authAttempts += 1;
    return this.authAttempts;
  }
}

/** Records every (connectionId, message); can simulate a stale/gone connection. */
export class SpyBroadcaster implements Broadcaster {
  sent: Array<{ connectionId: string; message: OutboundMessage }> = [];
  gone = new Set<string>();

  async post(connectionId: string, message: OutboundMessage): Promise<'ok' | 'gone'> {
    if (this.gone.has(connectionId)) return 'gone';
    this.sent.push({ connectionId, message });
    return 'ok';
  }

  messagesTo(connectionId: string): OutboundMessage[] {
    return this.sent.filter((s) => s.connectionId === connectionId).map((s) => s.message);
  }
  typesTo(connectionId: string): string[] {
    return this.messagesTo(connectionId).map((m) => m.type);
  }
}

export class FakeScheduler implements Scheduler {
  armed: Array<{ draftId: string; version: number; fireAt: number }> = [];
  canceled: string[] = [];
  async arm(input: { draftId: string; version: number; fireAt: number }): Promise<void> {
    this.armed.push({ ...input });
  }
  async cancel(draftId: string): Promise<void> {
    this.canceled.push(draftId);
  }
}

export class FakePoolLoader implements PoolLoader {
  constructor(private readonly snapshot: PoolSnapshot) {}
  async load(): Promise<PoolSnapshot> {
    return this.snapshot;
  }
}

/** Fixed passcode hash + HMAC key. `hash` should be a real bcrypt hash in tests. */
export class FakeSecrets implements Secrets {
  constructor(
    private readonly hash: string,
    private readonly key: string,
  ) {}
  async getPasscodeHash(): Promise<string> {
    return this.hash;
  }
  async getHmacKey(): Promise<string> {
    return this.key;
  }
}

export function fakeEnv(overrides: Partial<Environment> = {}): Environment {
  let counter = 0;
  return {
    now: () => 1_000_000,
    rng: () => 0.42,
    newId: () => `id-${++counter}`,
    leagueId: 'L1',
    sessionTtlSec: 3600,
    authMaxAttempts: 5,
    authWindowSec: 900,
    ...overrides,
  };
}

function clone<T>(value: T): T {
  return structuredClone(value);
}
