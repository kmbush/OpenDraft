/**
 * What a screen shows when it has no draft to render.
 *
 * One component for both surfaces so the wording can't drift: the station renders
 * it on light chrome, the board on its dark TV field. Each phase gets a heading, a
 * plain-language cause, and — where there is one — an action the person in the
 * room can actually take.
 */
import { Loader2, PlugZap, WifiOff } from 'lucide-react';
import type { ConnectionPhase } from '../hooks/useConnectionPhase.js';

interface Copy {
  title: string;
  detail: string;
  /** Rendered as a link when the fix is somewhere else in the app. */
  action?: { label: string; href: string };
  spin: boolean;
}

const COPY: Record<ConnectionPhase, Copy> = {
  'no-draft': {
    title: 'No draft yet',
    detail:
      'This screen has no draft to follow. Open the admin console to start one, or use the link the commissioner shared.',
    action: { label: 'Open admin console', href: '/admin' },
    spin: false,
  },
  connecting: {
    title: 'Connecting to the draft…',
    detail: 'Opening the live connection.',
    spin: true,
  },
  'not-found': {
    title: "Can't find that draft",
    detail:
      "The connection is fine, but the server has no draft with this id. The link's ?draft= code is probably wrong or points at a draft that was removed.",
    action: { label: 'Open admin console', href: '/admin' },
    spin: false,
  },
  stalled: {
    title: 'Still trying to connect',
    detail:
      "This is taking longer than it should. Check the room's wifi, then reload. If the link came from someone else, make sure it still has its ?draft= code.",
    spin: true,
  },
  reconnecting: {
    title: 'Reconnecting…',
    detail:
      'The connection dropped. Picks already made are safe — this screen catches up on its own.',
    spin: true,
  },
};

/** `tone` matches the surface: the station's light card, or the board's dark field. */
export function ConnectionNotice({
  phase,
  tone = 'light',
}: {
  phase: ConnectionPhase;
  tone?: 'light' | 'dark';
}) {
  const copy = COPY[phase];
  const dark = tone === 'dark';
  const settled = phase === 'no-draft' || phase === 'not-found';
  const Icon = settled ? PlugZap : phase === 'stalled' ? WifiOff : Loader2;

  return (
    <div
      className={`flex flex-col items-center gap-3 text-center ${dark ? 'text-white/70' : 'text-muted-foreground'}`}
    >
      <Icon
        className={`${dark ? 'h-8 w-8' : 'h-6 w-6'} ${copy.spin && phase !== 'stalled' ? 'animate-spin' : ''} ${phase === 'stalled' ? 'animate-pulse' : ''}`}
      />
      <p className={dark ? 'font-semibold text-2xl text-white/90' : 'font-medium text-foreground'}>
        {copy.title}
      </p>
      <p className={`max-w-md text-balance ${dark ? 'text-base' : 'text-sm'}`}>{copy.detail}</p>
      {copy.action && (
        <a
          href={copy.action.href}
          className={`mt-1 inline-flex items-center rounded-md px-3 py-1.5 font-medium text-sm transition-colors ${
            dark
              ? 'bg-white/10 text-white hover:bg-white/20'
              : 'bg-primary text-primary-foreground hover:opacity-90'
          }`}
        >
          {copy.action.label}
        </a>
      )}
    </div>
  );
}
