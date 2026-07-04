/**
 * Auto-pick Lambda entrypoint — invoked by the one-shot EventBridge schedule
 * with the JSON `{ draftId, expectedVersion }` it was armed with (AD-1, AD-11).
 */
import { type TimerFire, onTimerFire } from '../core/autopick.js';
import { buildDeps } from '../env.js';

const deps = buildDeps();

function parseFire(event: unknown): TimerFire | null {
  if (typeof event !== 'object' || event === null) return null;
  const e = event as Record<string, unknown>;
  if (typeof e.draftId !== 'string' || typeof e.expectedVersion !== 'number') return null;
  return { draftId: e.draftId, expectedVersion: e.expectedVersion };
}

export const handler = async (event: unknown): Promise<void> => {
  const fire = parseFire(event);
  if (!fire) return;
  await onTimerFire(deps, fire);
};
