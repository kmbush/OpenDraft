/**
 * Draft board (DESIGN §7): the TV showpiece — a full-bleed, chrome-free,
 * NFL-Draft-broadcast stage. On-the-clock team with a giant countdown ring, an
 * on-deck queue, a live recent-picks rail, and the locked announcement takeover
 * after every pick. Every countdown is rendered from a deadline timestamp
 * corrected by the clock offset — the server never ticks (AD-1).
 *
 * Announcement model: during PICK_IN there is NO pick clock — `announceUntil` is
 * the epoch ms the hard lockout ends. The board drives a four-beat show off it
 * (windowStart = announceUntil − waitingSec·1000; elapsed = serverNow − windowStart):
 * THE PICK IS IN → a beat → the pick announced → ON THE CLOCK: <next team>. When
 * the server flips PICK_IN → ON_CLOCK (ANNOUNCE_DONE) the fresh pick clock arrives
 * via SYNC and the live ON THE CLOCK stage takes over.
 */
import { roundForOverall, slotForOverallPick } from '@opendraft/engine';
import type { DraftState, Pick } from '@opendraft/shared';
import { FileDown, Radio, Trophy, Wifi, WifiOff, Zap } from 'lucide-react';
import { type ReactNode, useMemo } from 'react';
import { BrandMark } from '../components/brand-mark.js';
import { Confetti } from '../components/confetti.js';
import { PositionBadge } from '../components/position-badge.js';
import { indexPlayers, playerName, usePool } from '../hooks/usePool.js';
import { useTicker } from '../hooks/useTicker.js';
import { formatClock, remainingMs } from '../lib/clock.js';
import { cn } from '../lib/cn.js';
import { teamColor } from '../lib/teams.js';
import { useLiveStore } from '../store/store.js';
import { RevealShow } from './reveal.js';

/**
 * The four announcement beats as fractions of the lockout window, so the show
 * fills whatever `waitingSec` is (10s default → 3s / 1s / 3.5s / 2.5s):
 *   pickIn  [0,   0.30)  "THE PICK IS IN"
 *   pause   [0.30, 0.40) a held beat
 *   reveal  [0.40, 0.75) the pick announced
 *   onClock [0.75, 1.0]  "ON THE CLOCK: <next team>"
 */
const BEAT_PAUSE = 0.3;
const BEAT_REVEAL = 0.4;
const BEAT_ONCLOCK = 0.75;

type AnnounceBeat = 'pickIn' | 'pause' | 'reveal' | 'onClock';

type Phase = 'pre' | 'revealing' | 'starting' | 'paused' | 'clock' | 'announcing' | 'complete';

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] ?? s[v] ?? s[0]}`;
}

// --- Shared bits -----------------------------------------------------------

/** Uppercase tracked-out eyebrow label; amber by default, or tinted to a team. */
function Eyebrow({
  children,
  className,
  color,
}: {
  children: ReactNode;
  className?: string;
  color?: string;
}) {
  return (
    <p
      className={cn(
        'font-semibold uppercase tracking-[0.35em]',
        !color && 'text-accent/90',
        className,
      )}
      style={color ? { color } : undefined}
    >
      {children}
    </p>
  );
}

/** Small filled dot carrying a team's identity color (a cue, never a value). */
function TeamDot({ color, className }: { color: string; className?: string }) {
  return (
    <span
      className={cn('inline-block h-2.5 w-2.5 shrink-0 rounded-full', className)}
      style={{ backgroundColor: color, boxShadow: `0 0 8px ${color}88` }}
      aria-hidden
    />
  );
}

/** Giant depleting countdown ring with mm:ss at its core. */
function CountdownRing({
  fraction,
  label,
  color,
  urgent,
}: {
  fraction: number;
  label: string;
  color: string;
  urgent: boolean;
}) {
  const r = 150;
  const c = 2 * Math.PI * r;
  return (
    <div
      className={cn('relative aspect-square', urgent && 'animate-clock-pulse')}
      style={{ width: 'clamp(240px, 38vh, 440px)' }}
    >
      <svg
        viewBox="0 0 340 340"
        className="h-full w-full -rotate-90"
        role="img"
        aria-label={`Pick clock ${label}`}
      >
        <circle
          cx="170"
          cy="170"
          r={r}
          fill="none"
          stroke="rgba(255,255,255,0.07)"
          strokeWidth="16"
        />
        <circle
          cx="170"
          cy="170"
          r={r}
          fill="none"
          stroke={color}
          strokeWidth="16"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - Math.max(0, Math.min(1, fraction)))}
          style={{
            transition: 'stroke-dashoffset 0.25s linear',
            filter: `drop-shadow(0 0 10px ${color}88)`,
          }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-xs font-semibold uppercase tracking-[0.3em] text-white/40">
          Pick Clock
        </span>
        <span
          className="mt-1 font-black tabular-nums leading-none"
          style={{ color, fontSize: 'clamp(3rem, 9vh, 6rem)' }}
        >
          {label}
        </span>
      </div>
    </div>
  );
}

// --- Top strip -------------------------------------------------------------

function TopStrip({
  round,
  rounds,
  pickNo,
  totalPicks,
  status,
  connected,
}: {
  round: number;
  rounds: number;
  pickNo: number | null;
  totalPicks: number;
  status: string;
  connected: boolean;
}) {
  return (
    <header className="flex shrink-0 items-center justify-between border-b border-white/10 px-10 py-5">
      <div className="flex items-center gap-3">
        <BrandMark
          iconClassName="h-7 w-7"
          logoClassName="h-9"
          nameClassName="text-2xl font-black"
        />
        <span className="ml-2 hidden text-xs font-semibold uppercase tracking-[0.3em] text-white/40 sm:inline">
          Live Draft
        </span>
      </div>
      <div className="flex items-center gap-8">
        <Stat label="Round" value={`${round} / ${rounds}`} />
        <div className="h-8 w-px bg-white/10" />
        <Stat label="Pick" value={pickNo ? `#${pickNo} / ${totalPicks}` : '—'} />
        <div className="h-8 w-px bg-white/10" />
        {connected ? (
          <span
            className={cn(
              'flex items-center gap-2 text-sm font-bold uppercase tracking-widest',
              status === 'PAUSED' ? 'text-amber-400' : 'text-red-500',
            )}
          >
            <Radio className="h-4 w-4" />
            {status === 'PAUSED' ? 'Paused' : 'Live'}
            {status !== 'PAUSED' && (
              <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-red-500" />
            )}
          </span>
        ) : (
          <span className="flex items-center gap-2 text-sm font-bold uppercase tracking-widest text-white/40">
            <WifiOff className="h-4 w-4" /> Offline
          </span>
        )}
      </div>
    </header>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="text-right leading-none">
      <div className="text-[10px] font-semibold uppercase tracking-[0.3em] text-white/40">
        {label}
      </div>
      <div className="mt-1 text-xl font-black tabular-nums">{value}</div>
    </div>
  );
}

// --- Live stage (on the clock) --------------------------------------------

function ClockHero({
  teamName,
  accent,
  overall,
  round,
  fraction,
  clockLabel,
  color,
  urgent,
}: {
  teamName: string;
  accent: string;
  overall: number;
  round: number;
  fraction: number;
  clockLabel: string;
  color: string;
  urgent: boolean;
}) {
  return (
    <div className="relative flex flex-1 flex-col items-center justify-center gap-6 overflow-hidden px-8">
      {/* Ambient breathing glow behind the stage, tinted to the on-clock team */}
      <div
        className="animate-breathe pointer-events-none absolute left-1/2 top-1/2 -z-10 h-[70vh] w-[70vh] -translate-x-1/2 -translate-y-1/2 rounded-full blur-3xl"
        style={{ background: `radial-gradient(circle, ${accent}2b, transparent 70%)` }}
      />
      <Eyebrow className="text-lg md:text-2xl" color={accent}>
        On the Clock
      </Eyebrow>
      <div className="h-1.5 w-24 rounded-full" style={{ backgroundColor: accent }} />
      <h1
        className="max-w-[16ch] text-center font-black uppercase leading-[0.92] tracking-tight"
        style={{ fontSize: 'clamp(2.5rem, 7.5vw, 7rem)' }}
      >
        {teamName}
      </h1>
      <p className="text-lg text-white/60 md:text-2xl">
        with the <span className="font-bold text-white">{ordinal(overall)}</span> pick
        <span className="mx-2 text-white/25">·</span>
        round <span className="font-bold text-white">{round}</span>
      </p>
      <div className="mt-2">
        <CountdownRing fraction={fraction} label={clockLabel} color={color} urgent={urgent} />
      </div>
    </div>
  );
}

function OnDeck({
  items,
  teamName,
  colorOf,
}: {
  items: { overall: number; round: number; slot: number }[];
  teamName: (slot: number) => string;
  colorOf: (slot: number) => string;
}) {
  if (items.length === 0) return null;
  return (
    <div className="flex shrink-0 items-center gap-5 border-t border-white/10 px-10 py-5">
      <Eyebrow className="shrink-0 text-sm text-white/50">On Deck</Eyebrow>
      <div className="flex flex-1 gap-4 overflow-hidden">
        {items.map((it, i) => (
          <div
            key={it.overall}
            className={cn(
              'flex min-w-0 flex-1 items-center gap-3 rounded-xl border border-white/10 px-4 py-3',
              i === 0 ? 'bg-white/[0.07]' : 'bg-white/[0.03]',
            )}
          >
            <span className="shrink-0 font-black tabular-nums text-accent/80">#{it.overall}</span>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <TeamDot color={colorOf(it.slot)} />
                <span className="truncate text-lg font-bold leading-tight">
                  {teamName(it.slot)}
                </span>
              </div>
              <div className="text-xs uppercase tracking-wider text-white/40">Round {it.round}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function RecentPicks({
  picks,
  playerName,
  playerTeam,
  teamName,
  colorOf,
}: {
  picks: Pick[];
  playerName: (id: string) => string;
  playerTeam: (id: string) => string;
  teamName: (slot: number) => string;
  colorOf: (slot: number) => string;
}) {
  return (
    <aside className="flex w-[clamp(300px,23vw,420px)] shrink-0 flex-col border-l border-white/10 bg-black/20">
      <h2 className="shrink-0 border-b border-white/10 px-6 py-5 text-sm font-black uppercase tracking-[0.3em] text-white/50">
        Recent Picks
      </h2>
      {picks.length === 0 ? (
        <p className="px-6 py-8 text-sm text-white/40">Waiting for the first pick…</p>
      ) : (
        <ol className="flex-1 overflow-hidden">
          {picks.map((pick, i) => (
            <li
              key={pick.overall}
              className="animate-slide-in flex items-center gap-4 border-b border-white/5 px-6 py-4"
              style={{ animationDelay: `${Math.min(i, 6) * 45}ms` }}
            >
              <span className="w-10 shrink-0 text-center text-lg font-black tabular-nums text-white/30">
                {pick.overall}
              </span>
              <PositionBadge
                position={pick.position}
                tint="dark"
                className="h-9 w-11 shrink-0 rounded-md text-sm"
              />
              <div className="min-w-0 flex-1">
                <p className="truncate text-lg font-bold leading-tight">
                  {playerName(pick.playerId)}
                  {playerTeam(pick.playerId) && (
                    <span className="ml-2 text-sm font-semibold text-white/40">
                      {playerTeam(pick.playerId)}
                    </span>
                  )}
                </p>
                <p className="flex items-center gap-1.5 truncate text-sm text-white/45">
                  <TeamDot color={colorOf(pick.teamSlot)} className="h-2 w-2" />
                  {teamName(pick.teamSlot)}
                </p>
              </div>
              {pick.auto && (
                <Zap className="h-4 w-4 shrink-0 text-accent/70" aria-label="auto pick" />
              )}
            </li>
          ))}
        </ol>
      )}
    </aside>
  );
}

// --- The locked announcement takeover -------------------------------------

/** Beat 1: the confident "THE PICK IS IN" shimmer punch. */
function PickIsInBeat() {
  return (
    <div key="pickIn" className="animate-takeover px-8 text-center">
      <p
        className="bg-gradient-to-r from-amber-500 via-yellow-200 to-amber-500 bg-clip-text font-black uppercase leading-[0.9] text-transparent"
        style={{
          fontSize: 'clamp(3rem, 13vw, 12rem)',
          backgroundSize: '250% 100%',
          animation: 'shimmer 2.4s linear infinite',
        }}
      >
        The Pick
        <br />
        Is In
      </p>
    </div>
  );
}

/** Beat 2: a held beat of anticipation — three breathing dots, tinted to the team. */
function PauseBeat({ color }: { color: string }) {
  return (
    <div key="pause" className="flex items-center gap-5">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="animate-breathe block rounded-full"
          style={{
            width: 'clamp(14px, 1.6vw, 26px)',
            height: 'clamp(14px, 1.6vw, 26px)',
            backgroundColor: color,
            boxShadow: `0 0 24px ${color}aa`,
            animationDelay: `${i * 0.18}s`,
          }}
        />
      ))}
    </div>
  );
}

/** Beat 3: the pick announced — player, position, NFL team — lingering. */
function RevealBeat({
  pick,
  playerName,
  playerTeam,
  teamName,
  colorOf,
}: {
  pick: Pick;
  playerName: (id: string) => string;
  playerTeam: (id: string) => string;
  teamName: (slot: number) => string;
  colorOf: (slot: number) => string;
}) {
  const nflTeam = playerTeam(pick.playerId);
  return (
    <div key="reveal" className="relative w-full">
      <Confetti count={90} />
      <div className="animate-reveal relative flex flex-col items-center px-8 text-center">
        <Eyebrow className="text-base md:text-xl" color={colorOf(pick.teamSlot)}>
          With the {ordinal(pick.overall)} pick, {teamName(pick.teamSlot)} select
        </Eyebrow>
        <div className="mt-6 flex items-center gap-5">
          <PositionBadge
            position={pick.position}
            tint="dark"
            className="h-16 rounded-md px-4 text-3xl md:h-20 md:text-4xl"
          />
          <h1
            className="font-black uppercase leading-[0.9] tracking-tight"
            style={{ fontSize: 'clamp(3rem, 9vw, 9rem)' }}
          >
            {playerName(pick.playerId)}
          </h1>
        </div>
        <p className="mt-8 text-xl text-white/60 md:text-3xl">
          {nflTeam && (
            <>
              <span className="font-bold text-white">{nflTeam}</span>
              <span className="mx-3 text-white/25">·</span>
            </>
          )}
          {pick.position}
          <span className="mx-3 text-white/25">·</span>
          pick <span className="font-bold text-white">#{pick.overall}</span>
          <span className="mx-3 text-white/25">·</span>
          round <span className="font-bold text-white">{pick.round}</span>
          {pick.auto && (
            <span className="ml-4 inline-flex items-center gap-1.5 rounded-full bg-amber-400/15 px-4 py-1.5 align-middle text-lg font-bold text-amber-400">
              <Zap className="h-5 w-5" /> auto
            </span>
          )}
        </p>
      </div>
    </div>
  );
}

/** Beat 4: "ON THE CLOCK: <next team>" — same energy as beat 1, in the team's color. */
function OnClockBeat({ teamName, color }: { teamName: string; color: string }) {
  return (
    <div key="onClock" className="animate-takeover px-8 text-center">
      <Eyebrow className="text-xl md:text-4xl" color={color}>
        On the Clock
      </Eyebrow>
      <p
        className="mt-6 font-black uppercase leading-[0.9] tracking-tight"
        style={{ color, fontSize: 'clamp(3rem, 11vw, 11rem)', textShadow: `0 0 60px ${color}88` }}
      >
        {teamName}
      </p>
    </div>
  );
}

/** The full-screen locked takeover; renders the current beat over a blurred stage. */
function AnnounceTakeover({
  beat,
  pick,
  nextTeamName,
  nextColor,
  playerName,
  playerTeam,
  teamName,
  colorOf,
}: {
  beat: AnnounceBeat;
  pick: Pick;
  nextTeamName: string;
  nextColor: string;
  playerName: (id: string) => string;
  playerTeam: (id: string) => string;
  teamName: (slot: number) => string;
  colorOf: (slot: number) => string;
}) {
  return (
    <div className="absolute inset-0 z-30 flex items-center justify-center bg-slate-950/85 backdrop-blur-sm">
      {beat === 'pickIn' ? (
        <PickIsInBeat />
      ) : beat === 'pause' ? (
        <PauseBeat color={colorOf(pick.teamSlot)} />
      ) : beat === 'reveal' ? (
        <RevealBeat
          pick={pick}
          playerName={playerName}
          playerTeam={playerTeam}
          teamName={teamName}
          colorOf={colorOf}
        />
      ) : (
        <OnClockBeat teamName={nextTeamName} color={nextColor} />
      )}
    </div>
  );
}

// --- Whole-screen states ---------------------------------------------------

function PreDraft({
  draft,
  teamName,
  colorOf,
}: {
  draft: DraftState;
  teamName: (slot: number) => string;
  colorOf: (slot: number) => string;
}) {
  const { settings, order } = draft;
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-10 px-10 py-8">
      <div className="text-center">
        <Eyebrow className="text-lg md:text-2xl">Get Ready</Eyebrow>
        <h1
          className="mt-4 font-black uppercase leading-[0.92] tracking-tight"
          style={{ fontSize: 'clamp(2.5rem, 8vw, 7rem)' }}
        >
          The Draft
          <br />
          Starts Soon
        </h1>
        <p className="mt-6 flex flex-wrap items-center justify-center gap-x-6 gap-y-1 text-lg text-white/60 md:text-2xl">
          <span>
            <span className="font-bold text-white">{settings.teams}</span> teams
          </span>
          <span>
            <span className="font-bold text-white">{settings.rounds}</span> rounds
          </span>
          <span className="uppercase">{settings.mode}</span>
          <span>
            <span className="font-bold text-white">{settings.timerSec}s</span> clock
          </span>
        </p>
      </div>
      {order.length > 0 && (
        <div className="w-full max-w-6xl">
          <Eyebrow className="mb-4 text-center text-sm text-white/50">Draft Order</Eyebrow>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {order.map((slot, i) => (
              <div
                key={slot}
                className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3"
                style={{ borderLeft: `3px solid ${colorOf(slot)}` }}
              >
                <span className="text-2xl font-black tabular-nums text-accent/70">{i + 1}</span>
                <span className="min-w-0 truncate text-lg font-bold">{teamName(slot)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/** Pre-draft "DRAFT IS LIVE IN…" hype countdown, rendered from `liveAt` (AD-1). */
function StartingHero({
  remaining,
  firstTeamName,
  accent,
  urgent,
}: {
  remaining: number;
  firstTeamName: string;
  accent: string;
  urgent: boolean;
}) {
  return (
    <div className="relative flex flex-1 flex-col items-center justify-center gap-8 overflow-hidden px-8 text-center">
      {/* Breathing glow tinted to the team picking first. */}
      <div
        className="animate-breathe pointer-events-none absolute left-1/2 top-1/2 -z-10 h-[85vh] w-[85vh] -translate-x-1/2 -translate-y-1/2 rounded-full blur-3xl"
        style={{ background: `radial-gradient(circle, ${accent}33, transparent 70%)` }}
      />
      <Eyebrow className="text-xl md:text-4xl" color={accent}>
        Draft Is Live In
      </Eyebrow>
      <div
        className={cn('font-black tabular-nums leading-none', urgent && 'animate-clock-pulse')}
        style={{
          color: accent,
          fontSize: 'clamp(6rem, 30vh, 24rem)',
          textShadow: `0 0 70px ${accent}99`,
        }}
      >
        {formatClock(remaining)}
      </div>
      <p className="text-xl text-white/60 md:text-3xl">
        <span className="font-bold text-white">{firstTeamName}</span> picks first
      </p>
    </div>
  );
}

function PausedHero({ teamName, color }: { teamName: string; color: string }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 px-8 text-center">
      <Eyebrow className="text-lg md:text-2xl">Draft Paused</Eyebrow>
      <div className="h-1.5 w-20 rounded-full" style={{ backgroundColor: color }} />
      <h1
        className="font-black uppercase leading-[0.92] tracking-tight text-white/70"
        style={{ fontSize: 'clamp(2.5rem, 7vw, 6rem)' }}
      >
        {teamName}
      </h1>
      <p className="text-lg text-white/50 md:text-2xl">was on the clock — resuming soon</p>
    </div>
  );
}

function CompleteView({
  draft,
  playerName,
  teamName,
  exportHref,
}: {
  draft: DraftState;
  playerName: (id: string) => string;
  teamName: (slot: number) => string;
  exportHref: string;
}) {
  const last = draft.picks.at(-1);
  return (
    <div className="relative flex flex-1 flex-col items-center justify-center gap-6 overflow-hidden px-8 text-center">
      <Confetti count={140} />
      <Trophy className="h-24 w-24 text-amber-400 drop-shadow-[0_0_25px_rgba(245,158,11,0.6)]" />
      <h1
        className="bg-gradient-to-r from-amber-400 via-yellow-200 to-amber-400 bg-clip-text font-black uppercase leading-[0.9] tracking-tight text-transparent"
        style={{ fontSize: 'clamp(3rem, 10vw, 9rem)' }}
      >
        Draft Complete
      </h1>
      <p className="text-xl text-white/60 md:text-2xl">
        {draft.picks.length} picks · {draft.settings.rounds} rounds in the books
      </p>
      {last && (
        <div className="mt-4 flex items-center gap-4 rounded-2xl border border-white/10 bg-white/[0.05] px-8 py-5">
          <span className="text-sm font-semibold uppercase tracking-[0.3em] text-white/40">
            Final Pick
          </span>
          <PositionBadge
            position={last.position}
            tint="dark"
            className="h-10 w-12 rounded-md text-base"
          />
          <span className="text-2xl font-black">{playerName(last.playerId)}</span>
          <span className="text-lg text-white/50">{teamName(last.teamSlot)}</span>
        </div>
      )}
      <a
        href={exportHref}
        className="mt-4 inline-flex items-center gap-2 rounded-xl border border-white/15 bg-white/[0.06] px-6 py-3 text-lg font-bold text-white/80 transition-colors hover:bg-white/[0.12] hover:text-white"
      >
        <FileDown className="h-5 w-5" /> View / export the draft board
      </a>
    </div>
  );
}

// --- Root ------------------------------------------------------------------

export function BoardView() {
  const state = useLiveStore();
  const { draft, serverOffsetMs, connected } = state;
  const now = useTicker();
  const pool = usePool(draft?.poolSnapshotId);
  const byId = useMemo(() => indexPlayers(pool.players), [pool.players]);

  const vignette = (
    <div
      className="pointer-events-none absolute inset-0"
      style={{
        background: 'radial-gradient(ellipse at center, transparent 52%, rgba(0,0,0,0.6) 100%)',
      }}
    />
  );
  const rootStyle = {
    background: 'radial-gradient(ellipse at 50% -10%, #11213c 0%, #0a0f1c 48%, #05070d 100%)',
  };

  if (!draft) {
    return (
      <div
        className="relative flex h-screen w-screen items-center justify-center overflow-hidden bg-slate-950 text-white"
        style={rootStyle}
      >
        {vignette}
        <div className="flex items-center gap-4 text-2xl text-white/50">
          <Wifi className="h-7 w-7 animate-pulse" />
          <span className="animate-pulse">Connecting to the draft…</span>
        </div>
      </div>
    );
  }

  const { settings, teams: teamList } = draft;
  const totalPicks = settings.teams * settings.rounds;
  const timerMs = settings.timerSec * 1000;
  const waitingMs = settings.waitingSec * 1000;
  const remaining = remainingMs(draft.pickDeadline, serverOffsetMs, now);

  const nameOf = (id: string) => playerName(byId, id);
  const playerTeam = (id: string) => byId.get(id)?.team ?? '';
  const teamName = (slot: number) => teamList.find((t) => t.slot === slot)?.name ?? '—';
  const colorOf = (slot: number) => teamColor(teamList.find((t) => t.slot === slot));

  // Announcement lockout: no pick clock runs; `announceUntil` bounds the window.
  // Beats are driven off elapsed fraction so the show fills whatever waitingSec is.
  const announcing = draft.status === 'PICK_IN' && !!draft.pendingPick;
  const announceLeft = remainingMs(draft.announceUntil, serverOffsetMs, now);
  const waitFraction = waitingMs > 0 ? 1 - announceLeft / waitingMs : 1;
  const beat: AnnounceBeat =
    waitFraction < BEAT_PAUSE
      ? 'pickIn'
      : waitFraction < BEAT_REVEAL
        ? 'pause'
        : waitFraction < BEAT_ONCLOCK
          ? 'reveal'
          : 'onClock';
  const phase: Phase = ((): Phase => {
    if (draft.status === 'COMPLETE') return 'complete';
    if (draft.status === 'REVEALING') return 'revealing';
    if (draft.status === 'SETUP' || draft.status === 'ORDER_SET') return 'pre';
    if (draft.status === 'STARTING') return 'starting';
    if (draft.status === 'PAUSED') return 'paused';
    if (announcing) return 'announcing';
    return 'clock';
  })();

  const onClockSlot = state.onClockTeamSlot();
  // Before a team is on the clock (pre/starting) the draft is at round 1, pick 1;
  // after it completes, the final round/pick. Never show the full round count as
  // if the draft were already there.
  const liveRound = onClockSlot
    ? roundForOverall(draft.pointer, settings.teams)
    : phase === 'complete'
      ? settings.rounds
      : 1;
  const headerPick =
    phase === 'complete'
      ? totalPicks
      : onClockSlot && draft.pointer <= totalPicks
        ? draft.pointer
        : phase === 'starting'
          ? 1
          : null;

  // The team picking first (order[0]) fronts the starting hype moment.
  const firstSlot = draft.order[0];
  const startingRemaining = remainingMs(draft.liveAt, serverOffsetMs, now);

  const recent = draft.picks.slice(-8).reverse();
  const onDeck = onDeckPicks(draft, 3);
  const exportHref = `/export${state.draftId ? `?draft=${state.draftId}` : ''}`;

  // Clock visuals (clock phase). The ring rides the on-clock team's color, then
  // escalates to amber < 30s and red < 10s so urgency always overrides identity.
  const onClockColor = onClockSlot ? colorOf(onClockSlot) : '#e2e8f0';
  const urgent = remaining <= 10_000;
  const warning = remaining <= 30_000 && !urgent;
  const clockColor = urgent ? '#ef4444' : warning ? '#f59e0b' : onClockColor;
  const fraction = timerMs > 0 ? remaining / timerMs : 0;

  return (
    <div
      className="relative flex h-screen w-screen flex-col overflow-hidden bg-slate-950 text-white"
      style={rootStyle}
    >
      {vignette}
      <TopStrip
        round={liveRound}
        rounds={settings.rounds}
        pickNo={headerPick}
        totalPicks={totalPicks}
        status={draft.status}
        connected={connected}
      />

      {phase === 'pre' ? (
        <PreDraft draft={draft} teamName={teamName} colorOf={colorOf} />
      ) : phase === 'revealing' ? (
        <RevealShow
          draft={draft}
          now={now}
          serverOffsetMs={serverOffsetMs}
          teamName={teamName}
          colorOf={colorOf}
        />
      ) : phase === 'starting' ? (
        <StartingHero
          remaining={startingRemaining}
          firstTeamName={firstSlot ? teamName(firstSlot) : '—'}
          accent={firstSlot ? colorOf(firstSlot) : '#f59e0b'}
          urgent={startingRemaining <= 10_000}
        />
      ) : phase === 'complete' ? (
        <CompleteView
          draft={draft}
          playerName={nameOf}
          teamName={teamName}
          exportHref={exportHref}
        />
      ) : phase === 'paused' ? (
        <div className="flex flex-1 overflow-hidden">
          <PausedHero teamName={onClockSlot ? teamName(onClockSlot) : '—'} color={onClockColor} />
          <RecentPicks
            picks={recent}
            playerName={nameOf}
            playerTeam={playerTeam}
            teamName={teamName}
            colorOf={colorOf}
          />
        </div>
      ) : (
        <div className="relative flex flex-1 overflow-hidden">
          <div className="flex flex-1 flex-col overflow-hidden">
            <ClockHero
              teamName={onClockSlot ? teamName(onClockSlot) : '—'}
              accent={onClockColor}
              overall={draft.pointer}
              round={liveRound}
              fraction={fraction}
              clockLabel={formatClock(remaining)}
              color={clockColor}
              urgent={urgent}
            />
            <OnDeck items={onDeck} teamName={teamName} colorOf={colorOf} />
          </div>
          <RecentPicks
            picks={recent}
            playerName={nameOf}
            playerTeam={playerTeam}
            teamName={teamName}
            colorOf={colorOf}
          />
          {phase === 'announcing' && draft.pendingPick && (
            <AnnounceTakeover
              beat={beat}
              pick={draft.pendingPick}
              nextTeamName={onClockSlot ? teamName(onClockSlot) : '—'}
              nextColor={onClockColor}
              playerName={nameOf}
              playerTeam={playerTeam}
              teamName={teamName}
              colorOf={colorOf}
            />
          )}
        </div>
      )}
    </div>
  );
}

/** The next `count` upcoming picks (team + round), derived via the one ordering. */
function onDeckPicks(draft: DraftState, count: number) {
  const { teams } = draft.settings;
  // Order isn't set until the draft starts; slotForOverallPick would throw on an
  // incomplete order, so there's nothing on deck yet.
  if (draft.order.length !== teams) return [];
  const total = teams * draft.settings.rounds;
  const out: { overall: number; round: number; slot: number }[] = [];
  for (let overall = draft.pointer + 1; overall <= total && out.length < count; overall++) {
    out.push({
      overall,
      round: roundForOverall(overall, teams),
      slot: slotForOverallPick(overall, teams, draft.order, draft.settings.mode),
    });
  }
  return out;
}
