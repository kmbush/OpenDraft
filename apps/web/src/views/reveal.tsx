/**
 * "The Reveal" — the draft-order reveal show on the board (DESIGN). The engine
 * has already rolled and committed `order`; this only *unveils* it. Everything
 * is client-computed from `reveal.revealAt` + the shared reveal timings, so a
 * reconnecting board renders the exact right frame.
 *
 * Pluggable by design: `RevealShow` switches on `reveal.game` to pick the
 * animation via the `REVEAL_GAMES` registry — adding Plinko / a race later is a
 * new component + one entry, no engine or board-shell change. Only `envelopes`
 * ships today.
 */
import type { DraftState, RevealGame } from '@opendraft/shared';
import { REVEAL_FINALE_MS, pickRevealAtMs } from '@opendraft/shared';
import { Sparkles, Ticket } from 'lucide-react';
import type { ComponentType } from 'react';
import { Confetti } from '../components/confetti.js';
import { estimatedServerNow, formatClock } from '../lib/clock.js';
import { cn } from '../lib/cn.js';
import { readableOn } from '../lib/teams.js';

/** Props every reveal-game animation receives. */
export interface RevealGameProps {
  draft: DraftState;
  now: number;
  serverOffsetMs: number;
  teamName: (slot: number) => string;
  colorOf: (slot: number) => string;
}

// --- Countdown sub-phase ("THE REVEAL BEGINS IN 0:30…") ---------------------

function RevealCountdown({ remaining }: { remaining: number }) {
  const urgent = remaining <= 10_000;
  return (
    <div className="relative flex flex-1 flex-col items-center justify-center gap-8 overflow-hidden px-8 text-center">
      <div
        className="animate-breathe pointer-events-none absolute left-1/2 top-1/2 -z-10 h-[85vh] w-[85vh] -translate-x-1/2 -translate-y-1/2 rounded-full blur-3xl"
        style={{ background: 'radial-gradient(circle, #f59e0b33, transparent 70%)' }}
      />
      <p className="flex items-center gap-3 font-semibold uppercase tracking-[0.35em] text-amber-400/90 md:text-2xl">
        <Ticket className="h-6 w-6 md:h-8 md:w-8" /> The Reveal Begins In
      </p>
      <div
        className={cn('font-black tabular-nums leading-none', urgent && 'animate-clock-pulse')}
        style={{
          color: '#f59e0b',
          fontSize: 'clamp(6rem, 30vh, 24rem)',
          textShadow: '0 0 70px #f59e0b99',
        }}
      >
        {formatClock(remaining)}
      </div>
      <p className="text-xl text-white/60 md:text-3xl">
        The draft lottery is about to unveil the order
      </p>
    </div>
  );
}

// --- The envelope draft lottery --------------------------------------------

/** One pick's envelope: sealed until its scheduled moment, then flips open. */
function EnvelopeCard({
  pickNo,
  teamName,
  color,
  open,
  finale,
}: {
  pickNo: number;
  teamName: string;
  color: string;
  open: boolean;
  finale?: boolean;
}) {
  if (!open) {
    return (
      <div
        className={cn(
          'relative flex items-center justify-center overflow-hidden rounded-2xl border border-white/10 bg-white/[0.04]',
          finale ? 'h-40 md:h-52' : 'h-24 md:h-28',
        )}
      >
        <div
          className="animate-shimmer absolute inset-0 opacity-40"
          style={{
            background:
              'linear-gradient(105deg, transparent 40%, rgba(245,158,11,0.25) 50%, transparent 60%)',
            backgroundSize: '250% 100%',
          }}
        />
        <div className="flex flex-col items-center gap-2 text-white/40">
          <Ticket className={cn(finale ? 'h-12 w-12' : 'h-7 w-7')} />
          <span
            className={cn('font-black uppercase tracking-[0.3em]', finale ? 'text-2xl' : 'text-sm')}
          >
            Pick #{pickNo}
          </span>
        </div>
      </div>
    );
  }
  return (
    <div
      className={cn(
        'animate-envelope-open relative flex flex-col items-center justify-center gap-1 overflow-hidden rounded-2xl px-4 text-center',
        finale ? 'h-40 md:h-52' : 'h-24 md:h-28',
      )}
      style={{
        backgroundColor: color,
        color: readableOn(color),
        boxShadow: `0 0 40px ${color}99, inset 0 0 0 2px rgba(255,255,255,0.15)`,
      }}
    >
      {finale && <Confetti count={90} />}
      <span
        className={cn(
          'font-black uppercase leading-none tracking-widest opacity-80',
          finale ? 'text-xl' : 'text-[11px]',
        )}
      >
        {finale ? '1st Overall Pick' : `Pick #${pickNo}`}
      </span>
      <span
        className={cn(
          'max-w-full truncate font-black uppercase leading-tight tracking-tight',
          finale ? 'text-4xl md:text-6xl' : 'text-lg md:text-2xl',
        )}
      >
        {teamName}
      </span>
    </div>
  );
}

function EnvelopeReveal({ draft, now, serverOffsetMs, teamName, colorOf }: RevealGameProps) {
  const reveal = draft.reveal;
  if (!reveal) return null;
  const teams = draft.order.length;
  const elapsed = estimatedServerNow(now, serverOffsetMs) - reveal.revealAt;

  if (elapsed < 0) return <RevealCountdown remaining={-elapsed} />;

  // The #1 finale opens last; the "order is set" outro follows its flourish.
  const finaleOpen = elapsed >= pickRevealAtMs(1, teams);
  const outro = elapsed >= pickRevealAtMs(1, teams) + REVEAL_FINALE_MS;
  const opened = draft.order.filter((_, i) => elapsed >= pickRevealAtMs(i + 1, teams)).length;

  // Picks #2..#N (the grid). #1 is the featured card up top.
  const rest = draft.order.slice(1);

  return (
    <div className="relative flex flex-1 flex-col gap-6 overflow-hidden px-8 py-6">
      <div className="flex items-center justify-center gap-3 text-center">
        <Sparkles className="h-6 w-6 text-amber-400" />
        <p className="font-black uppercase tracking-[0.35em] text-amber-400/90 md:text-2xl">
          {outro ? 'The Order Is Set' : 'The Draft Lottery'}
        </p>
        <Sparkles className="h-6 w-6 text-amber-400" />
      </div>

      <EnvelopeCard
        finale
        pickNo={1}
        teamName={teamName(draft.order[0] ?? 0)}
        color={colorOf(draft.order[0] ?? 0)}
        open={finaleOpen}
      />

      <div
        className="grid flex-1 content-start gap-3"
        style={{
          gridTemplateColumns: `repeat(auto-fill, minmax(${teams > 12 ? 150 : 200}px, 1fr))`,
        }}
      >
        {rest.map((slot, i) => {
          const pickNo = i + 2;
          return (
            <EnvelopeCard
              key={slot}
              pickNo={pickNo}
              teamName={teamName(slot)}
              color={colorOf(slot)}
              open={elapsed >= pickRevealAtMs(pickNo, teams)}
            />
          );
        })}
      </div>

      <p className="text-center text-sm uppercase tracking-[0.3em] text-white/40">
        {opened} of {teams} revealed
      </p>
    </div>
  );
}

// --- Registry + host --------------------------------------------------------

const REVEAL_GAMES: Record<RevealGame, ComponentType<RevealGameProps>> = {
  envelopes: EnvelopeReveal,
};

/** Picks the animation for `reveal.game`; blank until the first SYNC lands. */
export function RevealShow(props: RevealGameProps) {
  const game = props.draft.reveal?.game;
  const Game = game ? REVEAL_GAMES[game] : undefined;
  return Game ? <Game {...props} /> : null;
}
