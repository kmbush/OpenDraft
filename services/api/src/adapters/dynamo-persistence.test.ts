/**
 * `diffPickItems` is unit-tested exhaustively and DynamoDB-free — it is the pure
 * write-set that makes every multi-pick admin op (undo, mid-log remove, rewind,
 * edit, reassign) persist correctly, so correctness is proven regardless of the
 * integration env.
 *
 * The `DynamoPersistence` integration suite (R-7) runs the same ops against a real
 * DynamoDB. It skips unless one of two env vars is set, so the default `pnpm test`
 * stays offline:
 *
 *   # DynamoDB Local — dummy credentials, instant table creation
 *   docker run -p 8000:8000 amazon/dynamodb-local
 *   DYNAMODB_LOCAL_ENDPOINT=http://localhost:8000 pnpm --filter @opendraft/api test
 *
 *   # Real DynamoDB — ambient credentials, a scratch table in your own account
 *   DYNAMODB_TEST_REGION=us-west-2 pnpm --filter @opendraft/api test
 *
 * Either way the suite creates and tears down its own uniquely-named table and
 * never touches a deployed one.
 */
import { randomUUID } from 'node:crypto';
import {
  CreateTableCommand,
  DeleteTableCommand,
  DynamoDBClient,
  waitUntilTableExists,
} from '@aws-sdk/client-dynamodb';
import type { DraftState, Pick, Position } from '@opendraft/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { liveDraft } from '../test-helpers.js';
import { DynamoPersistence, diffPickItems } from './dynamo-persistence.js';
import { pickSk } from './keys.js';

const LEAGUE = 'L1';
const DRAFT = 'D1';

/** A pick with 2-team snake-agnostic derived fields; override any field. */
function pick(overall: number, overrides: Partial<Pick> = {}): Pick {
  const teams = 2;
  return {
    overall,
    round: Math.ceil(overall / teams),
    pickInRound: ((overall - 1) % teams) + 1,
    teamSlot: ((overall - 1) % teams) + 1,
    playerId: `p${overall}`,
    position: 'RB' as Position,
    madeAt: 1000 + overall,
    auto: false,
    ...overrides,
  };
}

const base = liveDraft();
const withPicks = (picks: Pick[]): DraftState => ({ ...base, picks });

const overalls = (items: Array<Record<string, unknown>>): number[] =>
  items.map((i) => i.overall as number).sort((a, b) => a - b);
const deletedSks = (keys: Array<{ SK: string }>): string[] => keys.map((k) => k.SK).sort();

describe('diffPickItems', () => {
  it('append: one Put for the new pick, no deletes', () => {
    const diff = diffPickItems(
      withPicks([pick(1), pick(2)]),
      withPicks([pick(1), pick(2), pick(3)]),
      LEAGUE,
      DRAFT,
    );
    expect(overalls(diff.puts)).toEqual([3]);
    expect(diff.deletes).toEqual([]);
  });

  it('undo-last: one Delete for the tail pick, no puts', () => {
    const diff = diffPickItems(
      withPicks([pick(1), pick(2), pick(3)]),
      withPicks([pick(1), pick(2)]),
      LEAGUE,
      DRAFT,
    );
    expect(diff.puts).toEqual([]);
    expect(deletedSks(diff.deletes)).toEqual([pickSk(DRAFT, 3)]);
  });

  it('edit-player: one Put for the changed pick', () => {
    const prev = withPicks([pick(1), pick(2)]);
    const next = withPicks([pick(1, { playerId: 'traded', position: 'WR' as Position }), pick(2)]);
    const diff = diffPickItems(prev, next, LEAGUE, DRAFT);
    expect(overalls(diff.puts)).toEqual([1]);
    expect(diff.deletes).toEqual([]);
  });

  it('reassign (teamSlot only): one Put — a same-player teamSlot change still persists', () => {
    const prev = withPicks([pick(1, { teamSlot: 1 }), pick(2)]);
    const next = withPicks([pick(1, { teamSlot: 2 }), pick(2)]);
    const diff = diffPickItems(prev, next, LEAGUE, DRAFT);
    expect(overalls(diff.puts)).toEqual([1]);
    expect((diff.puts[0] as { teamSlot: number }).teamSlot).toBe(2);
    expect(diff.deletes).toEqual([]);
  });

  it('remove-middle: Delete the removed overall, leave the rest untouched', () => {
    const prev = withPicks([pick(1), pick(2), pick(3)]);
    const next = withPicks([pick(1), pick(3)]);
    const diff = diffPickItems(prev, next, LEAGUE, DRAFT);
    expect(diff.puts).toEqual([]);
    expect(deletedSks(diff.deletes)).toEqual([pickSk(DRAFT, 2)]);
  });

  it('multi-pick rewind: Delete every dropped tail pick', () => {
    const prev = withPicks([1, 2, 3, 4, 5].map((o) => pick(o)));
    const next = withPicks([pick(1), pick(2)]);
    const diff = diffPickItems(prev, next, LEAGUE, DRAFT);
    expect(diff.puts).toEqual([]);
    expect(deletedSks(diff.deletes)).toEqual(
      [pickSk(DRAFT, 3), pickSk(DRAFT, 4), pickSk(DRAFT, 5)].sort(),
    );
  });

  it('no-op: empty diff when nothing changed', () => {
    const picks = [pick(1), pick(2)];
    const diff = diffPickItems(
      withPicks(picks),
      withPicks(picks.map((p) => ({ ...p }))),
      LEAGUE,
      DRAFT,
    );
    expect(diff.puts).toEqual([]);
    expect(diff.deletes).toEqual([]);
  });

  it('auto-flag change alone is a Put', () => {
    const prev = withPicks([pick(1, { auto: false })]);
    const next = withPicks([pick(1, { auto: true })]);
    expect(overalls(diffPickItems(prev, next, LEAGUE, DRAFT).puts)).toEqual([1]);
  });
});

// --- Integration: DynamoPersistence against real DynamoDB (R-7) -----------------

const endpoint = process.env.DYNAMODB_LOCAL_ENDPOINT;
const realRegion = process.env.DYNAMODB_TEST_REGION;
const target = endpoint ? 'DynamoDB Local' : realRegion ? `real DynamoDB ${realRegion}` : null;

/** Creating a real table and waiting for ACTIVE is far slower than any test body. */
const SETUP_TIMEOUT = 180_000;

describe.skipIf(!target)(`DynamoPersistence (${target ?? 'skipped'}) — R-7`, () => {
  const tableName = `opendraft-test-${randomUUID()}`;
  // Local ignores credentials; the real path uses ambient ones and puts a scratch
  // table in the caller's own account.
  const localCreds = { accessKeyId: 'local', secretAccessKey: 'local' };
  const client = new DynamoDBClient(
    endpoint ? { endpoint, region: 'us-east-1', credentials: localCreds } : { region: realRegion },
  );
  const p = new DynamoPersistence(tableName, client);

  beforeAll(async () => {
    await client.send(
      new CreateTableCommand({
        TableName: tableName,
        BillingMode: 'PAY_PER_REQUEST',
        AttributeDefinitions: [
          { AttributeName: 'PK', AttributeType: 'S' },
          { AttributeName: 'SK', AttributeType: 'S' },
        ],
        KeySchema: [
          { AttributeName: 'PK', KeyType: 'HASH' },
          { AttributeName: 'SK', KeyType: 'RANGE' },
        ],
      }),
    );
    // Local is ACTIVE immediately; real DynamoDB is not, and every op would 400.
    await waitUntilTableExists({ client, maxWaitTime: 120 }, { TableName: tableName });
  }, SETUP_TIMEOUT);

  afterAll(async () => {
    await client.send(new DeleteTableCommand({ TableName: tableName }));
    client.destroy();
  }, SETUP_TIMEOUT);

  /** Seed a fresh draft and append `count` picks one commit at a time. */
  async function build(count: number): Promise<DraftState> {
    let state: DraftState = { ...base, draftId: `D-${randomUUID()}`, picks: [] };
    await p.createDraft(state);
    for (let overall = 1; overall <= count; overall++) {
      const next = { ...state, picks: [...state.picks, pick(overall)], version: state.version + 1 };
      const res = await p.commit(LEAGUE, state, next);
      expect(res.ok).toBe(true);
      state = next;
    }
    return state;
  }

  const loadOveralls = async (draftId: string): Promise<number[]> =>
    ((await p.loadDraft(LEAGUE, draftId))?.picks ?? []).map((p) => p.overall);

  it('append persists each pick', async () => {
    const s = await build(3);
    expect(await loadOveralls(s.draftId)).toEqual([1, 2, 3]);
  });

  it('undo-last drops the tail pick', async () => {
    const s = await build(3);
    const next = { ...s, picks: s.picks.slice(0, -1), version: s.version + 1 };
    expect((await p.commit(LEAGUE, s, next)).ok).toBe(true);
    expect(await loadOveralls(s.draftId)).toEqual([1, 2]);
  });

  it('edit rewrites a pick in place', async () => {
    const s = await build(2);
    const picks = [
      { ...s.picks[0], playerId: 'traded', position: 'WR' as Position },
      s.picks[1],
    ] as Pick[];
    const next = { ...s, picks, version: s.version + 1 };
    expect((await p.commit(LEAGUE, s, next)).ok).toBe(true);
    const loaded = await p.loadDraft(LEAGUE, s.draftId);
    expect(loaded?.picks[0]).toMatchObject({ overall: 1, playerId: 'traded', position: 'WR' });
  });

  it('reassign persists a teamSlot-only change', async () => {
    const s = await build(2);
    const picks = [{ ...s.picks[0], teamSlot: 2 }, s.picks[1]] as Pick[];
    const next = { ...s, picks, version: s.version + 1 };
    expect((await p.commit(LEAGUE, s, next)).ok).toBe(true);
    const loaded = await p.loadDraft(LEAGUE, s.draftId);
    expect(loaded?.picks[0]).toMatchObject({ overall: 1, teamSlot: 2 });
  });

  it('remove-middle deletes only the targeted pick', async () => {
    const s = await build(3);
    const next = { ...s, picks: s.picks.filter((p) => p.overall !== 2), version: s.version + 1 };
    expect((await p.commit(LEAGUE, s, next)).ok).toBe(true);
    expect(await loadOveralls(s.draftId)).toEqual([1, 3]);
  });

  it('multi-pick rewind deletes the whole dropped tail', async () => {
    const s = await build(5);
    const next = { ...s, picks: s.picks.slice(0, 2), version: s.version + 1 };
    expect((await p.commit(LEAGUE, s, next)).ok).toBe(true);
    expect(await loadOveralls(s.draftId)).toEqual([1, 2]);
  });

  it('rejects a stale-version commit without partially applying it', async () => {
    const stale = await build(2);
    // A concurrent writer advances the draft first.
    const winner = { ...stale, picks: [...stale.picks, pick(3)], version: stale.version + 1 };
    expect((await p.commit(LEAGUE, stale, winner)).ok).toBe(true);

    // The loser commits against the now-stale prev: must be rejected...
    const loser = {
      ...stale,
      picks: [...stale.picks, pick(3, { playerId: 'loser' })],
      version: stale.version + 1,
    };
    const res = await p.commit(LEAGUE, stale, loser);
    expect(res).toEqual({ ok: false, currentVersion: winner.version });

    // ...and its pick must not have leaked in (transaction rolled back whole).
    const loaded = await p.loadDraft(LEAGUE, stale.draftId);
    expect(loaded?.picks.map((p) => p.overall)).toEqual([1, 2, 3]);
    expect(loaded?.picks[2]?.playerId).toBe('p3');
  });

  // R-7 names this case specifically: not a stale commit replayed after the fact,
  // but writers racing from the same prev state at the same moment — the shape an
  // admin UNDO landing on top of an in-flight pick actually takes.
  it('serializes a genuinely concurrent race — exactly one writer wins', async () => {
    const start = await build(2);
    const contenders = ['a', 'b', 'c'].map((tag) => ({
      ...start,
      picks: [...start.picks, pick(3, { playerId: `racer-${tag}` })],
      version: start.version + 1,
    }));

    const results = await Promise.all(contenders.map((next) => p.commit(LEAGUE, start, next)));
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    const losers = results.filter((r) => !r.ok);
    expect(losers).toHaveLength(2);
    // Every loser must report the version that actually won, so the caller resyncs.
    for (const l of losers) expect(l).toEqual({ ok: false, currentVersion: start.version + 1 });

    // Exactly one pick 3 landed, and it belongs to the writer that won.
    const loaded = await p.loadDraft(LEAGUE, start.draftId);
    expect(loaded?.picks.map((x) => x.overall)).toEqual([1, 2, 3]);
    expect(loaded?.version).toBe(start.version + 1);
    expect(loaded?.picks[2]?.playerId).toMatch(/^racer-[abc]$/);
  });
});
