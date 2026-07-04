/**
 * The core WS action pipeline (CONVENTIONS §4.3 — a thin adapter around the
 * engine). Steps: parse envelope → (admin? verify session) → load state →
 * `engine.reduce` → conditional commit → fan out `outbox` → ack sender. All
 * draft rules live in the engine; this file only transports and guards.
 */
import { reduce } from '@opendraft/engine';
import type { OutboundMessage } from '@opendraft/shared';
import type { Deps } from '../ports.js';
import { verifySession } from './auth.js';
import { fanOut, reconcileScheduler } from './broadcast.js';
import {
  ADMIN_EVENTS,
  type InboundEnvelope,
  SYNC_REQUEST,
  makeReject,
  mapEnvelopeToEvent,
} from './envelope.js';

/** Send the full authoritative snapshot to one connection (DESIGN §5.5). */
export async function sendSync(deps: Deps, connectionId: string, draftId: string): Promise<void> {
  const state = await deps.persistence.loadDraft(deps.env.leagueId, draftId);
  if (!state) {
    await deps.broadcaster.post(connectionId, makeReject(draftId, 'NOT_FOUND', 'No such draft', 0));
    return;
  }
  const message: OutboundMessage = {
    type: 'SYNC',
    draftId,
    payload: { state, serverNow: deps.env.now() },
    version: state.version,
  };
  await deps.broadcaster.post(connectionId, message);
}

/**
 * Handle one inbound WS action for a connection. Never throws to the caller;
 * failures surface as a REJECT to the sender (CONVENTIONS §4.5).
 */
export async function dispatchAction(
  deps: Deps,
  connectionId: string,
  env: InboundEnvelope,
): Promise<void> {
  const ackSender = (m: OutboundMessage) => deps.broadcaster.post(connectionId, m);

  if (env.type === SYNC_REQUEST) {
    await sendSync(deps, connectionId, env.draftId);
    return;
  }

  const mapped = mapEnvelopeToEvent(env);
  if (!mapped.ok) {
    await ackSender(makeReject(env.draftId, mapped.code, mapped.message, 0));
    return;
  }

  // Admin gate — verified server-side regardless of client UI gating (AD-8).
  if (mapped.admin || ADMIN_EVENTS.has(mapped.event.type)) {
    const auth = await verifySession(deps.secrets, env.token, deps.env.leagueId, deps.env.now());
    if (!auth.ok) {
      await ackSender(makeReject(env.draftId, 'UNAUTHORIZED', 'Admin session required', 0));
      return;
    }
  }

  const prev = await deps.persistence.loadDraft(deps.env.leagueId, env.draftId);
  if (!prev) {
    await ackSender(makeReject(env.draftId, 'NOT_FOUND', 'No such draft', 0));
    return;
  }

  const { state: next, outbox } = reduce(prev, mapped.event, {
    now: deps.env.now(),
    rng: deps.env.rng,
  });

  // Engine rejected the event: nothing persisted, just inform the sender.
  const first = outbox[0];
  if (first && first.type === 'REJECT') {
    await ackSender(first);
    return;
  }

  // Optimistic-concurrency guard against a concurrent Lambda (DESIGN §6.1).
  const commit = await deps.persistence.commit(deps.env.leagueId, prev, next);
  if (!commit.ok) {
    await ackSender(
      makeReject(
        env.draftId,
        'STALE_VERSION',
        'Draft advanced concurrently',
        commit.currentVersion,
      ),
    );
    return;
  }

  // Success: broadcast the engine's message to everyone (sender included = ack).
  await Promise.all(outbox.map((m) => fanOut(deps, m)));
  await reconcileScheduler(deps, next);
}
