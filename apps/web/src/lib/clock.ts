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

/** `m:ss` for display. */
export function formatClock(ms: number): string {
  const totalSeconds = Math.ceil(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}
