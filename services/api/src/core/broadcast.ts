/**
 * Fan-out + scheduler reconciliation shared by every mutation path.
 */
import { type DraftState, type OutboundMessage, revealAnimationMs } from '@opendraft/shared';
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
 * Arm or cancel the one-shot timer to match the new state. It fires at the reveal
 * end in REVEALING (→ REVEAL_DONE), at `liveAt` in STARTING (→ GO_LIVE), and at
 * `pickDeadline` in ON_CLOCK/PICK_IN (→ auto-pick); every other state cancels.
 * Armed with `state.version` so a stale fire (after a pick, "Go now", or "Skip to
 * result" advanced the version) becomes a no-op (AD-1, AD-11).
 */
export async function reconcileScheduler(deps: Deps, state: DraftState): Promise<void> {
  const live = state.status === 'ON_CLOCK' || state.status === 'PICK_IN';
  const revealEnd =
    state.status === 'REVEALING' && state.reveal
      ? state.reveal.revealAt + revealAnimationMs(state.settings.teams)
      : undefined;
  const fireAt =
    revealEnd ??
    (state.status === 'STARTING' ? state.liveAt : live ? state.pickDeadline : undefined);
  if (typeof fireAt === 'number') {
    await deps.scheduler.arm({ draftId: state.draftId, version: state.version, fireAt });
  } else {
    await deps.scheduler.cancel(state.draftId);
  }
}
