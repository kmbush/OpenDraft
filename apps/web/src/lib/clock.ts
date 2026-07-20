/**
 * Client-side countdown from the server's `pickDeadline` (DESIGN AD-1, §5.5).
 * The server never ticks — it broadcasts a deadline timestamp and a `serverNow`;
 * each client renders its own countdown, correcting for clock skew via an offset.
 */

/** offset = clientClockAtSync − serverNow. Captured on every SYNC. */
export function clockOffset(clientNow: number, serverNow: number): number {
  return clientNow - serverNow;
}

/** Estimated server time now, from the local clock and the captured offset. */
export function estimatedServerNow(clientNow: number, offsetMs: number): number {
  return clientNow - offsetMs;
}

/** Milliseconds left on the clock (never negative). */
export function remainingMs(
  pickDeadline: number | undefined,
  offsetMs: number,
  clientNow: number,
): number {
  if (pickDeadline === undefined) return 0;
  return Math.max(0, pickDeadline - estimatedServerNow(clientNow, offsetMs));
}

/**
 * Fraction of the pick clock still on the board, clamped to [0,1] — what a
 * countdown ring sweeps. `remainingMs` already floors at 0, so only the top end
 * needs clamping (a deadline further out than one full clock, e.g. right after a
 * timer nudge, must not overdraw the ring).
 */
export function clockFraction(
  pickDeadline: number | undefined,
  offsetMs: number,
  clientNow: number,
  timerMs: number,
): number {
  if (timerMs <= 0) return 0;
  return Math.min(1, remainingMs(pickDeadline, offsetMs, clientNow) / timerMs);
}

/** `m:ss` for display. */
export function formatClock(ms: number): string {
  const totalSeconds = Math.ceil(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}
