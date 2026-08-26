/**
 * Fullscreen for the board, plus the screen wake lock that has to come with it.
 *
 * The board is the room's centerpiece on a TV, and browser chrome around it
 * breaks the effect. Two constraints shape this:
 *
 * 1. `requestFullscreen()` **requires a user gesture** — the board physically
 *    cannot enter fullscreen on load, so it has to carry its own control.
 * 2. A board nobody touches for three hours will sleep or screensave mid-pick.
 *    The Screen Wake Lock API prevents that, but the browser drops the lock on
 *    tab switch, so it must be re-acquired on visibility change.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';

/** Not in every TS DOM lib yet, and absent in Safari — narrow it ourselves. */
interface WakeLockSentinelLike {
  released: boolean;
  release(): Promise<void>;
}
interface WakeLockLike {
  request(type: 'screen'): Promise<WakeLockSentinelLike>;
}

function wakeLockApi(): WakeLockLike | null {
  const wl = (navigator as Navigator & { wakeLock?: WakeLockLike }).wakeLock;
  return wl ?? null;
}

export interface Fullscreen {
  /** True while the document is actually fullscreen (tracks Esc and F11 too). */
  active: boolean;
  /** False where the API is unavailable — the control hides rather than lying. */
  supported: boolean;
  toggle(): void;
}

/**
 * Drive fullscreen for `element`, holding a screen wake lock for as long as it
 * lasts. State follows the *document*, not our own calls, so exiting by Esc or
 * F11 keeps the UI honest.
 */
export function useFullscreen(element: () => Element | null): Fullscreen {
  const supported = typeof document !== 'undefined' && document.fullscreenEnabled;
  const [active, setActive] = useState(false);

  useEffect(() => {
    const sync = () => setActive(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', sync);
    sync();
    return () => document.removeEventListener('fullscreenchange', sync);
  }, []);

  // Hold the wake lock only while fullscreen, and take it again whenever the tab
  // comes back — the browser silently drops it on hide, which is precisely when a
  // board left alone would fall asleep.
  useEffect(() => {
    const api = wakeLockApi();
    if (!active || !api) return;

    let sentinel: WakeLockSentinelLike | null = null;
    let cancelled = false;

    const acquire = async () => {
      if (cancelled || document.visibilityState !== 'visible') return;
      try {
        sentinel = await api.request('screen');
      } catch {
        // Denied or unsupported — fullscreen still works, the screen may just sleep.
      }
    };

    const onVisibility = () => {
      if (document.visibilityState === 'visible' && (!sentinel || sentinel.released))
        void acquire();
    };

    void acquire();
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisibility);
      void sentinel?.release().catch(() => {});
    };
  }, [active]);

  const toggle = useCallback(() => {
    if (document.fullscreenElement) {
      void document.exitFullscreen().catch(() => {});
      return;
    }
    // Must run inside the gesture that called us — no awaiting beforehand.
    void element()
      ?.requestFullscreen?.()
      .catch(() => {});
  }, [element]);

  // Memoized so callers can put `fs` in an effect's dependencies without the
  // effect re-running on every render. That is not just tidiness: the board binds
  // its `F` shortcut through this, and an unstable object made the listener
  // unsubscribe and resubscribe mid-keypress — any other handler that re-rendered
  // first (the idle timer does) could swallow the key.
  return useMemo(() => ({ active, supported, toggle }), [active, supported, toggle]);
}

/**
 * Whether the pointer has been still for `delayMs`. Used to fade the fullscreen
 * control and hide the cursor, so a settled board shows only the draft.
 */
export function useIdle(delayMs = 3000): boolean {
  const [idle, setIdle] = useState(false);

  useEffect(() => {
    let t: ReturnType<typeof setTimeout>;
    const bump = () => {
      setIdle(false);
      clearTimeout(t);
      t = setTimeout(() => setIdle(true), delayMs);
    };
    bump();
    window.addEventListener('mousemove', bump);
    window.addEventListener('keydown', bump);
    window.addEventListener('touchstart', bump);
    return () => {
      clearTimeout(t);
      window.removeEventListener('mousemove', bump);
      window.removeEventListener('keydown', bump);
      window.removeEventListener('touchstart', bump);
    };
  }, [delayMs]);

  return idle;
}
