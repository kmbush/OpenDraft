/**
 * Fan-out + scheduler reconciliation shared by every mutation path.
 */
import { type DraftState, type OutboundMessage, honorDeadline } from '@opendraft/shared';
import type { Deps } from '../ports.js';

/** Broadcast a message to all league connections; prune stale ones (AD-1). */
export async function fanOut(deps: Deps, message: OutboundMessage): Promise<void> {
  const conns = await deps.persistence.listConnections(deps.env.leagueId);
  await Promise.all(
    conns.map(async (c) => {
      const result = await deps.broadcaster.post(c.connectionId, message);
      if (result === 'gone') {
        await deps.persistence.deleteConnection(deps.env.leagueId, c.connectionId);
      }
    }),
  );
}

/**
 * Arm or cancel the one-shot timer to match the new state. It is now a **backstop**
 * (DESIGN AD-1): a present client nudges first, so the scheduler only ever fires
 * when no client is watching — its ~1–2 min latency is invisible by definition. It
 * fires at each timed state's `honorDeadline` (reveal end → REVEAL_DONE, `liveAt` →
 * GO_LIVE, `announceUntil` → ANNOUNCE_DONE, and `pickDeadline + GRACE_MS` → auto-pick
 * so the grace window is respected even when the scheduler is the one to fire); every
 * other state cancels. Armed with `state.version` so a stale fire (after a pick, "Go
 * now", or "Skip to result" advanced the version) becomes a no-op (AD-1, AD-11).
 */
export async function reconcileScheduler(deps: Deps, state: DraftState): Promise<void> {
  const fireAt = honorDeadline(state);
  if (typeof fireAt === 'number') {
    await deps.scheduler.arm({ draftId: state.draftId, version: state.version, fireAt });
  } else {
    await deps.scheduler.cancel(state.draftId);
  }
}
