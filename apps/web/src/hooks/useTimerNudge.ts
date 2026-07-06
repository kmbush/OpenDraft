/**
 * Client-nudge trigger (DESIGN AD-1). While the draft sits in a timed state, this
 * watches the offset-corrected clock and, once it crosses that state's
 * `honorDeadline`, emits `TIMER_NUDGE` to ask the server to advance — the primary
 * trigger, far faster than the EventBridge backstop. Any client (board / station /
 * admin) may nudge; the server dedupes via the version guard and gates on its own
 * clock. Retries every ~300ms while still past the deadline in the same state
 * (capped), stops on the next state change, and treats a `TOO_EARLY` reject as
 * "keep waiting" (the store swallows it). One message; the client never needs to
 * know which phase it is in — the server maps status→transition.
 */
import { TIMER_NUDGE, honorDeadline } from '@opendraft/shared';
import { useEffect, useRef } from 'react';
import { estimatedServerNow } from '../lib/clock.js';
import { sendEnvelope } from '../net.js';
import { useLiveStore } from '../store/store.js';

const NUDGE_INTERVAL_MS = 300;
/** Cap retries per deadline so a lagging/offline path can't nudge unbounded. */
const MAX_NUDGES_PER_DEADLINE = 20;

export function useTimerNudge(): void {
  const lastDeadline = useRef<number | undefined>(undefined);
  const attempts = useRef(0);

  useEffect(() => {
    const id = setInterval(() => {
      const { draft, draftId, serverOffsetMs } = useLiveStore.getState();
      const deadline = draft && draftId ? honorDeadline(draft) : undefined;
      if (deadline === undefined) {
        lastDeadline.current = undefined;
        attempts.current = 0;
        return;
      }
      // A new timed state (or a re-armed clock) resets the retry budget.
      if (deadline !== lastDeadline.current) {
        lastDeadline.current = deadline;
        attempts.current = 0;
      }
      if (estimatedServerNow(Date.now(), serverOffsetMs) < deadline) return;
      if (attempts.current >= MAX_NUDGES_PER_DEADLINE) return;
      attempts.current += 1;
      sendEnvelope({ type: TIMER_NUDGE, draftId: draftId as string });
    }, NUDGE_INTERVAL_MS);
    return () => clearInterval(id);
  }, []);
}
