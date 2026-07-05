/**
 * Slim app chrome for the standalone pages (Station) and the Admin hub. Just the
 * OpenDraft wordmark + a live connection pill — no cross-nav. Per the owner's ask
 * (nav separation), Station and Board never link out; Admin is the only hub, and
 * it links out with its own in-page buttons. The Board is chrome-free entirely.
 */
import { WifiOff } from 'lucide-react';
import { cn } from '../lib/cn.js';
import { useLiveStore } from '../store/store.js';
import { BrandMark } from './brand-mark.js';

/** Live/offline status pill driven by the WS connection state. */
export function ConnectionPill() {
  const connected = useLiveStore((s) => s.connected);
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold',
        connected ? 'bg-emerald-50 text-emerald-700' : 'bg-muted text-muted-foreground',
      )}
    >
      {connected ? (
        <>
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" /> Live
        </>
      ) : (
        <>
          <WifiOff className="h-3.5 w-3.5" /> Offline
        </>
      )}
    </span>
  );
}

/** Sticky wordmark header with no cross-links. */
export function AppHeader() {
  return (
    <header className="sticky top-0 z-20 border-b border-border bg-card/80 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-2 px-4">
        <BrandMark />
        <span className="ml-auto">
          <ConnectionPill />
        </span>
      </div>
    </header>
  );
}
