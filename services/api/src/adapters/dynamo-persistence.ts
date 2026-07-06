/**
 * DynamoDB single-table `Persistence` adapter (DESIGN §4). Every key is
 * league-scoped; the only reads are key-based Queries/Gets — no scans (§7).
 *
 * `commit` is version-guarded (optimistic concurrency): the DRAFT item is Put
 * with `ConditionExpression: version = :expected`, and the append-only PICK log
 * is diffed (`diffPickItems`) into the exact set of Put/Delete operations —
 * appends, undo/rewind tails, mid-log removals, edits, and reassignments.
 */
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  BatchWriteCommand,
  DeleteCommand,
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  QueryCommand,
  TransactWriteCommand,
  type TransactWriteCommandInput,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb';
import type { DraftState, LeagueMeta, Pick, Team } from '@opendraft/shared';
import type { CommitResult, ConnectionRecord, ConnectionRole, Persistence } from '../ports.js';
import { authSk, connSk, draftPrefix, draftSk, metaSk, pickSk, pk, teamSk } from './keys.js';

type Item = Record<string, unknown>;
type Key = { PK: string; SK: string };
type PickOp = { put: Item } | { del: Key };
type TransactItem = NonNullable<TransactWriteCommandInput['TransactItems']>[number];

/** DynamoDB caps a single `TransactWriteItems` at 100 items. */
const TRANSACT_MAX = 100;
/** DynamoDB caps a single `BatchWriteItem` at 25 requests. */
const BATCH_MAX = 25;

export interface PickDiff {
  /** Full PICK items to Put (appended or changed picks). */
  puts: Item[];
  /** Keys of PICK items to Delete (removed picks / rewound tail). */
  deletes: Key[];
}

/** Full-log diff of `prev.picks` vs `next.picks`, keyed on `overall` (DESIGN §4).
 * Pure and DynamoDB-free so the commit's write set is unit-testable in isolation:
 * - added (in next, not prev) → Put
 * - removed (in prev, not next) → Delete  (undo-last, mid-log remove, rewind tail)
 * - changed (same overall, any persisted field differs) → Put  (edit, reassign) */
export function diffPickItems(
  prev: DraftState,
  next: DraftState,
  leagueId: string,
  draftId: string,
): PickDiff {
  const prevByOverall = new Map(prev.picks.map((p) => [p.overall, p]));
  const nextByOverall = new Map(next.picks.map((p) => [p.overall, p]));

  const puts: Item[] = [];
  for (const pick of next.picks) {
    const prior = prevByOverall.get(pick.overall);
    if (!prior || !samePick(pick, prior)) puts.push(pickItem(leagueId, draftId, pick));
  }
  const deletes: Key[] = [];
  for (const pick of prev.picks) {
    if (!nextByOverall.has(pick.overall)) {
      deletes.push({ PK: pk(leagueId), SK: pickSk(draftId, pick.overall) });
    }
  }
  return { puts, deletes };
}

function pickItem(leagueId: string, draftId: string, pick: Pick): Item {
  return {
    PK: pk(leagueId),
    SK: pickSk(draftId, pick.overall),
    type: 'PICK',
    leagueId,
    draftId,
    ...pick,
  };
}

export class DynamoPersistence implements Persistence {
  private readonly doc: DynamoDBDocumentClient;

  constructor(
    private readonly tableName: string,
    client: DynamoDBClient = new DynamoDBClient({}),
  ) {
    this.doc = DynamoDBDocumentClient.from(client, {
      marshallOptions: { removeUndefinedValues: true },
    });
  }

  async loadDraft(leagueId: string, draftId: string): Promise<DraftState | null> {
    const res = await this.doc.send(
      new QueryCommand({
        TableName: this.tableName,
        KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
        ExpressionAttributeValues: { ':pk': pk(leagueId), ':sk': draftPrefix(draftId) },
      }),
    );
    const items = (res.Items ?? []) as Item[];
    const draftItem = items.find((i) => i.type === 'DRAFT');
    if (!draftItem) return null;

    const teams = items
      .filter((i) => i.type === 'TEAM')
      .map((i) => stripKeys(i) as unknown as Team)
      .sort((a, b) => a.slot - b.slot);
    const picks = items
      .filter((i) => i.type === 'PICK')
      .map((i) => stripKeys(i) as unknown as Pick)
      .sort((a, b) => a.overall - b.overall);

    return { ...(stripKeys(draftItem) as Omit<DraftState, 'teams' | 'picks'>), teams, picks };
  }

  async commit(leagueId: string, prev: DraftState, next: DraftState): Promise<CommitResult> {
    const { puts, deletes } = diffPickItems(prev, next, leagueId, next.draftId);
    const pickOps: PickOp[] = [
      ...puts.map((put): PickOp => ({ put })),
      ...deletes.map((del): PickOp => ({ del })),
    ];

    // The version-guarded DRAFT write is the concurrency anchor and always leads
    // the transaction: it atomically claims `next.version`, so any concurrent
    // commit reading the same `prev.version` fails its own guard and rolls back
    // whole (no partial pick op escapes). A small op fits entirely here.
    const draftWrite: TransactItem = {
      Put: {
        TableName: this.tableName,
        Item: this.draftItem(next),
        ConditionExpression: '#v = :expected',
        ExpressionAttributeNames: { '#v': 'version' },
        ExpressionAttributeValues: { ':expected': prev.version },
      },
    };
    // A single transaction holds the DRAFT write + up to 99 pick ops. A large
    // rewind can exceed that; the overflow flushes via BatchWriteItem *after* the
    // transaction commits — safe because the version is already claimed, so no
    // other writer can interleave a successful commit against the flushed picks.
    const inTx = pickOps.slice(0, TRANSACT_MAX - 1);
    const overflow = pickOps.slice(TRANSACT_MAX - 1);

    try {
      await this.doc.send(
        new TransactWriteCommand({
          TransactItems: [draftWrite, ...inTx.map((op) => toTransactItem(this.tableName, op))],
        }),
      );
    } catch (e) {
      if (isConditionFailure(e)) {
        const current = await this.loadDraft(leagueId, next.draftId);
        return { ok: false, currentVersion: current?.version ?? prev.version };
      }
      throw e;
    }
    if (overflow.length > 0) await this.flushOverflow(overflow);
    return { ok: true };
  }

  /** Flush pick ops that overflowed the 100-item transaction, in 25-item batches
   * with a bounded retry for throttled/unprocessed items. */
  private async flushOverflow(ops: PickOp[]): Promise<void> {
    for (let i = 0; i < ops.length; i += BATCH_MAX) {
      let batch = ops.slice(i, i + BATCH_MAX).map(toWriteRequest);
      for (let attempt = 0; attempt < 3 && batch.length > 0; attempt++) {
        const res = await this.doc.send(
          new BatchWriteCommand({ RequestItems: { [this.tableName]: batch } }),
        );
        batch = (res.UnprocessedItems?.[this.tableName] ?? []) as typeof batch;
      }
    }
  }

  async createLeague(meta: LeagueMeta): Promise<void> {
    await this.doc.send(
      new PutCommand({
        TableName: this.tableName,
        Item: { PK: pk(meta.leagueId), SK: metaSk(), type: 'LEAGUE', ...meta },
      }),
    );
  }

  async getLeague(leagueId: string): Promise<LeagueMeta | null> {
    const res = await this.doc.send(
      new GetCommand({ TableName: this.tableName, Key: { PK: pk(leagueId), SK: metaSk() } }),
    );
    if (!res.Item) return null;
    return stripKeys(res.Item as Item) as unknown as LeagueMeta;
  }

  async createDraft(state: DraftState): Promise<void> {
    await this.doc.send(new PutCommand({ TableName: this.tableName, Item: this.draftItem(state) }));
    if (state.teams.length > 0) {
      await this.doc.send(
        new BatchWriteCommand({
          RequestItems: {
            [this.tableName]: state.teams.map((team) => ({
              PutRequest: { Item: this.teamItem(state.leagueId, state.draftId, team) },
            })),
          },
        }),
      );
    }
  }

  async putConnection(record: ConnectionRecord): Promise<void> {
    await this.doc.send(
      new PutCommand({
        TableName: this.tableName,
        Item: {
          PK: pk(record.leagueId),
          SK: connSk(record.connectionId),
          type: 'CONN',
          ...record,
          // TTL sweep for connections that never $disconnect (epoch seconds).
          ttl: Math.floor(record.connectedAt / 1000) + 24 * 60 * 60,
        },
      }),
    );
  }

  async deleteConnection(leagueId: string, connectionId: string): Promise<void> {
    await this.doc.send(
      new DeleteCommand({
        TableName: this.tableName,
        Key: { PK: pk(leagueId), SK: connSk(connectionId) },
      }),
    );
  }

  async listConnections(leagueId: string): Promise<ConnectionRecord[]> {
    const res = await this.doc.send(
      new QueryCommand({
        TableName: this.tableName,
        KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
        ExpressionAttributeValues: { ':pk': pk(leagueId), ':sk': 'CONN#' },
      }),
    );
    return (res.Items ?? []).map((i) => {
      const item = i as Item;
      return {
        connectionId: item.connectionId as string,
        leagueId: item.leagueId as string,
        role: item.role as ConnectionRole,
        connectedAt: item.connectedAt as number,
      };
    });
  }

  async getAuthAttempts(leagueId: string, now: number): Promise<number> {
    const res = await this.doc.send(
      new GetCommand({ TableName: this.tableName, Key: { PK: pk(leagueId), SK: authSk() } }),
    );
    const item = res.Item as Item | undefined;
    if (!item) return 0;
    // The window is authoritative in the read, not in TTL's physical deletion
    // (which lags up to ~48h): an elapsed window counts as a fresh 0 (AD-8).
    const ttl = item.ttl as number | undefined;
    if (ttl === undefined || ttl <= Math.floor(now / 1000)) return 0;
    return (item.attempts as number | undefined) ?? 0;
  }

  async registerAuthAttempt(leagueId: string, now: number, windowSec: number): Promise<number> {
    const nowSec = Math.floor(now / 1000);
    const key = { PK: pk(leagueId), SK: authSk() };
    try {
      // Increment only inside a live window; the condition fails once it elapses.
      const res = await this.doc.send(
        new UpdateCommand({
          TableName: this.tableName,
          Key: key,
          UpdateExpression: 'ADD attempts :one',
          ConditionExpression: 'attribute_exists(#ttl) AND #ttl > :now',
          ExpressionAttributeNames: { '#ttl': 'ttl' },
          ExpressionAttributeValues: { ':one': 1, ':now': nowSec },
          ReturnValues: 'UPDATED_NEW',
        }),
      );
      return (res.Attributes?.attempts as number | undefined) ?? 1;
    } catch (e) {
      if (!isConditionFailure(e)) throw e;
      // First failure or an elapsed window: open a fresh one at count 1.
      await this.doc.send(
        new UpdateCommand({
          TableName: this.tableName,
          Key: key,
          UpdateExpression: 'SET attempts = :one, #ttl = :ttl',
          ExpressionAttributeNames: { '#ttl': 'ttl' },
          ExpressionAttributeValues: { ':one': 1, ':ttl': nowSec + windowSec },
        }),
      );
      return 1;
    }
  }

  // --- item builders ---

  private draftItem(state: DraftState): Item {
    const { picks: _picks, teams: _teams, ...rest } = state;
    return { PK: pk(state.leagueId), SK: draftSk(state.draftId), type: 'DRAFT', ...rest };
  }

  private teamItem(leagueId: string, draftId: string, team: Team): Item {
    return {
      PK: pk(leagueId),
      SK: teamSk(draftId, team.slot),
      type: 'TEAM',
      leagueId,
      draftId,
      ...team,
    };
  }
}

/** Materialize a neutral pick op as a `TransactWriteItems` entry. */
function toTransactItem(tableName: string, op: PickOp): TransactItem {
  return 'put' in op
    ? { Put: { TableName: tableName, Item: op.put } }
    : { Delete: { TableName: tableName, Key: op.del } };
}

/** Materialize a neutral pick op as a `BatchWriteItem` request (TableName is the
 * batch's RequestItems key, so it isn't repeated here). */
function toWriteRequest(
  op: PickOp,
): { PutRequest: { Item: Item } } | { DeleteRequest: { Key: Key } } {
  return 'put' in op ? { PutRequest: { Item: op.put } } : { DeleteRequest: { Key: op.del } };
}

function stripKeys(item: Item): Item {
  const { PK: _pk, SK: _sk, type: _type, ttl: _ttl, ...rest } = item;
  return rest;
}

/** True iff two picks at the same `overall` are identical across every persisted
 * field — player, position, teamSlot (reassign), auto, and the derived slots.
 * Comparing all fields means edits *and* reassignments both persist correctly. */
function samePick(a: Pick, b: Pick): boolean {
  return (
    a.playerId === b.playerId &&
    a.position === b.position &&
    a.teamSlot === b.teamSlot &&
    a.auto === b.auto &&
    a.round === b.round &&
    a.pickInRound === b.pickInRound &&
    a.madeAt === b.madeAt
  );
}

function isConditionFailure(e: unknown): boolean {
  const name = (e as { name?: string })?.name ?? '';
  return name === 'ConditionalCheckFailedException' || name === 'TransactionCanceledException';
}
