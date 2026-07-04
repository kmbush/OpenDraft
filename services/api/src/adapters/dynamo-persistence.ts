/**
 * DynamoDB single-table `Persistence` adapter (DESIGN §4). Every key is
 * league-scoped; the only reads are key-based Queries/Gets — no scans (§7).
 *
 * `commit` is a `TransactWriteCommand`: the DRAFT item is Put with
 * `ConditionExpression: version = :expected` (optimistic concurrency), and the
 * append-only PICK log is diffed into a Put/Delete of the single changed pick.
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
type TransactItem = NonNullable<TransactWriteCommandInput['TransactItems']>[number];

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
    const transactItems: TransactItem[] = [
      {
        // DRAFT item: full overwrite guarded by the prior version.
        Put: {
          TableName: this.tableName,
          Item: this.draftItem(next),
          ConditionExpression: '#v = :expected',
          ExpressionAttributeNames: { '#v': 'version' },
          ExpressionAttributeValues: { ':expected': prev.version },
        },
      },
    ];
    const pickOp = this.pickDelta(leagueId, prev, next);
    if (pickOp) transactItems.push(pickOp);

    try {
      await this.doc.send(new TransactWriteCommand({ TransactItems: transactItems }));
      return { ok: true };
    } catch (e) {
      if (isConditionFailure(e)) {
        const current = await this.loadDraft(leagueId, next.draftId);
        return { ok: false, currentVersion: current?.version ?? prev.version };
      }
      throw e;
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

  async registerAuthAttempt(leagueId: string, now: number, windowSec: number): Promise<number> {
    const res = await this.doc.send(
      new UpdateCommand({
        TableName: this.tableName,
        Key: { PK: pk(leagueId), SK: authSk() },
        UpdateExpression: 'ADD attempts :one SET #ttl = if_not_exists(#ttl, :ttl)',
        ExpressionAttributeNames: { '#ttl': 'ttl' },
        ExpressionAttributeValues: { ':one': 1, ':ttl': Math.floor(now / 1000) + windowSec },
        ReturnValues: 'UPDATED_NEW',
      }),
    );
    return (res.Attributes?.attempts as number | undefined) ?? 1;
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

  private pickItem(leagueId: string, draftId: string, pick: Pick): Item {
    return {
      PK: pk(leagueId),
      SK: pickSk(draftId, pick.overall),
      type: 'PICK',
      leagueId,
      draftId,
      ...pick,
    };
  }

  /** Put/Delete for the single PICK item that changed (append, undo, or edit). */
  private pickDelta(leagueId: string, prev: DraftState, next: DraftState): TransactItem | null {
    if (next.picks.length > prev.picks.length) {
      const appended = next.picks[next.picks.length - 1];
      if (!appended) return null;
      return {
        Put: {
          TableName: this.tableName,
          Item: this.pickItem(leagueId, next.draftId, appended),
          ConditionExpression: 'attribute_not_exists(SK)',
        },
      };
    }
    if (next.picks.length < prev.picks.length) {
      const removed = prev.picks[prev.picks.length - 1];
      if (!removed) return null;
      return {
        Delete: {
          TableName: this.tableName,
          Key: { PK: pk(leagueId), SK: pickSk(prev.draftId, removed.overall) },
        },
      };
    }
    const changed = next.picks.find((p, i) => !samePick(p, prev.picks[i]));
    if (!changed) return null;
    return {
      Put: { TableName: this.tableName, Item: this.pickItem(leagueId, next.draftId, changed) },
    };
  }
}

function stripKeys(item: Item): Item {
  const { PK: _pk, SK: _sk, type: _type, ttl: _ttl, ...rest } = item;
  return rest;
}

function samePick(a: Pick, b: Pick | undefined): boolean {
  return b !== undefined && a.playerId === b.playerId && a.position === b.position;
}

function isConditionFailure(e: unknown): boolean {
  const name = (e as { name?: string })?.name ?? '';
  return name === 'ConditionalCheckFailedException' || name === 'TransactionCanceledException';
}
