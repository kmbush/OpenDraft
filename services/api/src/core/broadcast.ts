/**
 * Fan-out + scheduler reconciliation shared by every mutation path.
 */
import type { DraftState, OutboundMessage } from '@opendraft/shared';
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
 * Arm or cancel the one-shot auto-pick timer to match the new state. A team is
 * on a live clock in ON_CLOCK/PICK_IN with a deadline set; otherwise cancel.
 * Armed with `state.version` so a stale fire (after a manual pick advanced the
 * version) becomes a no-op (AD-1, AD-11).
 */
export async function reconcileScheduler(deps: Deps, state: DraftState): Promise<void> {
  const live = state.status === 'ON_CLOCK' || state.status === 'PICK_IN';
  if (live && typeof state.pickDeadline === 'number') {
    await deps.scheduler.arm({
      draftId: state.draftId,
      version: state.version,
      fireAt: state.pickDeadline,
    });
  } else {
    await deps.scheduler.cancel(state.draftId);
  }
}
