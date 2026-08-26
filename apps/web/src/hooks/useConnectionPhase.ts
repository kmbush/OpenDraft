/**
 * Why a screen has no draft to show.
 *
 * The board and station both used to render one indefinite "Connecting to the
 * draft…" for every cause: no draft id known, a slow WebSocket, dead venue wifi,
 * or a link whose `?draft=` code points at nothing. Those are different problems
 * with different fixes, and on draft day the person staring at the spinner is the
 * one who can least afford to guess.
 *
 * The distinction that matters most is the least obvious: a **connected** socket
 * that never delivers state is not a network problem at all — it is a wrong draft
 * id, and telling someone to check their wifi sends them the wrong way.
 */
import { useEffect, useState } from 'react';
import { useLiveStore } from '../store/store.js';

export type ConnectionPhase =
  /** No draft id in the URL or localStorage — nothing to connect to. */
  | 'no-draft'
  /** A draft id is known and we are still waiting. Normal for a second or two. */
  | 'connecting'
  /** Socket is up but the server sent no state for this id — the id is wrong. */
  | 'not-found'
  /** Never connected, well past a healthy handshake. Treat as a problem, not a wait. */
  | 'stalled'
  /** Connected once, then the socket dropped. Distinct from a first connect that never landed. */
  | 'reconnecting';

/** How long a live socket may stay silent before we call the draft id wrong. */
export const NOT_FOUND_AFTER_MS = 3000;
/** How long a first connect may take before it stops being "normal". */
export const STALL_AFTER_MS = 8000;

/**
 * Classify why there is no draft on screen. Callers render this only when they
 * have no draft state; a live draft outranks a dropped socket, because a stale
 * board still beats a spinner.
 */
export function useConnectionPhase(
  notFoundAfterMs = NOT_FOUND_AFTER_MS,
  stallAfterMs = STALL_AFTER_MS,
): ConnectionPhase {
  const draftId = useLiveStore((s) => s.draftId);
  const connected = useLiveStore((s) => s.connected);
  // Sticky: once a socket has been up, a later drop is a reconnect, not a first connect.
  const [everConnected, setEverConnected] = useState(false);

  useEffect(() => {
    if (connected) setEverConnected(true);
  }, [connected]);

  // Restart the clock whenever what we are waiting on changes, so a socket that
  // takes a while to open still gets its full grace period afterwards. Adjusting
  // state during render (rather than in an effect) keeps the reset genuinely keyed
  // to these two values instead of riding a dependency the body never reads.
  const key = `${draftId ?? ''}|${connected}`;
  const [mark, setMark] = useState(() => ({ key, at: Date.now() }));
  if (mark.key !== key) setMark({ key, at: Date.now() });

  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!draftId) return;
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, [draftId]);

  const waited = now - mark.at;

  if (!draftId) return 'no-draft';
  // Socket is up and still no state: the id is the suspect, not the network.
  if (connected) return waited >= notFoundAfterMs ? 'not-found' : 'connecting';
  if (everConnected) return 'reconnecting';
  return waited >= stallAfterMs ? 'stalled' : 'connecting';
}
