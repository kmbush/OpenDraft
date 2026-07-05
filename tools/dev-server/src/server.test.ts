/**
 * End-to-end smoke test: drive a full draft through the real in-memory harness
 * over HTTP + WebSocket — create → set order → start → manual pick → let the
 * clock expire → legal auto-pick → COMPLETE. Proves the ports wiring and the
 * live contract `apps/web` depends on.
 */
import type { OutboundMessage, Player } from '@opendraft/shared';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { WebSocket } from 'ws';
import { type Harness, createHarness } from './server.js';

let harness: Harness;
let base: string;

beforeAll(async () => {
  harness = await createHarness({ port: 0 });
  base = `http://localhost:${harness.port}`;
}, 30000);
afterAll(() => harness.close());

const post = (path: string, body: unknown, token?: string) =>
  fetch(`${base}${path}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  }).then((r) => r.json());

function waitFor(
  messages: OutboundMessage[],
  predicate: (m: OutboundMessage) => boolean,
  timeoutMs = 4000,
): Promise<OutboundMessage> {
  return new Promise((resolve, reject) => {
    const found = messages.find(predicate);
    if (found) return resolve(found);
    const started = Date.now();
    const id = setInterval(() => {
      const hit = messages.find(predicate);
      if (hit) {
        clearInterval(id);
        resolve(hit);
      } else if (Date.now() - started > timeoutMs) {
        clearInterval(id);
        reject(new Error('timed out waiting for message'));
      }
    }, 20);
  });
}

it('runs a full draft incl. an auto-pick, end to end', async () => {
  // Admin session + league + a 2-team, 1-round draft with a ~1s clock.
  const { token } = (await post('/api/admin/session', { passcode: harness.passcode })) as {
    token: string;
  };
  await post('/api/leagues', { name: 'Test League' }, token);
  const settings = {
    teams: 2,
    rounds: 1,
    mode: 'linear',
    timerSec: 1,
    waitingSec: 0,
    goLiveCountdownSec: 0,
    rosterFormat: { starters: { RB: 1 }, flex: [], bench: 1, positionMax: { RB: 8, WR: 8, QB: 4 } },
  };
  const created = (await post(
    '/api/leagues/dev-league/drafts',
    { settings, poolSnapshotId: 'bundled' },
    token,
  )) as { draftId: string };
  const draftId = created.draftId;

  // The pool the station will draft from must be populated and rank-free.
  const pool = (await fetch(`${base}/pool/bundled.json`).then((r) => r.json())) as {
    players: Player[];
  };
  expect(pool.players.length).toBeGreaterThan(100);
  const firstPlayer = pool.players[0];
  if (!firstPlayer) throw new Error('empty pool');

  // Board connection collects all inbound messages.
  const inbox: OutboundMessage[] = [];
  const ws = new WebSocket(`ws://localhost:${harness.port}/ws?role=board`);
  await new Promise<void>((resolve) => ws.on('open', () => resolve()));
  ws.on('message', (data) => inbox.push(JSON.parse(data.toString()) as OutboundMessage));
  const send = (msg: unknown) => ws.send(JSON.stringify(msg));

  // Sync, set order, start — awaiting each transition (a real admin's cadence).
  send({ type: 'SYNC', draftId });
  await waitFor(inbox, (m) => m.type === 'SYNC');
  send({ type: 'SET_ORDER', draftId, payload: { order: [1, 2] }, token });
  await waitFor(inbox, (m) => m.type === 'SYNC' && m.payload.state.status === 'ORDER_SET');
  send({ type: 'START', draftId, token });
  const started = (await waitFor(
    inbox,
    (m) => m.type === 'SYNC' && m.payload.state.status === 'ON_CLOCK',
  )) as Extract<OutboundMessage, { type: 'SYNC' }>;

  // After START the draft is immediately draftable: a team is on the clock and
  // the state references a pool the station can render (the bug Kyle hit was a
  // draft created with no pool, leaving the station blank).
  expect(started.payload.state.pointer).toBe(1);
  expect(started.payload.state.poolSnapshotId).toBe('bundled');

  // Team 1 makes a manual pick at the current version.
  send({
    type: 'SUBMIT_PICK',
    draftId,
    version: started.payload.state.version,
    payload: { teamSlot: 1, playerId: firstPlayer.id, position: firstPlayer.position },
  });
  const firstPick = (await waitFor(inbox, (m) => m.type === 'PICK_MADE')) as Extract<
    OutboundMessage,
    { type: 'PICK_MADE' }
  >;
  expect(firstPick.payload.pick.playerId).toBe(firstPlayer.id);
  expect(firstPick.payload.pick.auto).toBe(false);

  // Team 2's clock (~1s) expires → the setTimeout scheduler fires a legal auto-pick.
  const autoPick = (await waitFor(
    inbox,
    (m) => m.type === 'PICK_MADE' && m.payload.pick.teamSlot === 2,
    5000,
  )) as Extract<OutboundMessage, { type: 'PICK_MADE' }>;
  expect(autoPick.payload.pick.auto).toBe(true);
  expect(autoPick.payload.pick.playerId).not.toBe(firstPlayer.id); // never re-drafts

  // The draft is now complete.
  send({ type: 'SYNC', draftId });
  const finalSync = (await waitFor(
    inbox,
    (m) => m.type === 'SYNC' && m.payload.state.status === 'COMPLETE',
  )) as Extract<OutboundMessage, { type: 'SYNC' }>;
  expect(finalSync.payload.state.picks).toHaveLength(2);

  ws.close();
}, 15000);
