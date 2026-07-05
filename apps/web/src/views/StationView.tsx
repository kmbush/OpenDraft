/**
 * Player station (DESIGN §7): the shared drafting device. Stations aren't
 * team-bound — the station always picks for whoever is on the clock, with a
 * clear "picking for <team>" framing. The available pool is grouped by position,
 * alphabetical within group (NO rank/ADP, no such control — CONVENTIONS §5).
 * Select → Draft emits SUBMIT_PICK optimistically (the pick lands in the roster
 * immediately, then reconciles on PICK_MADE/REJECT). Every phase — connecting,
 * pre-draft, on the clock, paused, complete, plus pool loading/empty/error —
 * renders a real, styled state so it is never a silent blank screen.
 *
 * Identity: shares the OpenDraft look with the Board — amber accent + the shared
 * POSITION_COLOR coding — on a light, high-readability surface for picking.
 */
import { roundForOverall } from '@opendraft/engine';
import type { Pick, Player, Position } from '@opendraft/shared';
import { AlertCircle, Clock, Loader2, Pause, Search, Trophy, X, Zap } from 'lucide-react';
import { useMemo, useState } from 'react';
import { AppHeader } from '../components/app-header.js';
import { Alert, AlertDescription, AlertTitle } from '../components/ui/alert.js';
import { Badge } from '../components/ui/badge.js';
import { Button } from '../components/ui/button.js';
import { Card, CardContent } from '../components/ui/card.js';
import { Input } from '../components/ui/input.js';
import { indexPlayers, usePool } from '../hooks/usePool.js';
import { useTicker } from '../hooks/useTicker.js';
import { formatClock, remainingMs } from '../lib/clock.js';
import { cn } from '../lib/cn.js';
import { groupAvailable } from '../lib/pool.js';
import { POSITION_COLOR, POSITION_LABEL, positionRank } from '../lib/positions.js';
import { readableOn, teamColor } from '../lib/teams.js';
import { takenIds } from '../store/reducer.js';
import { useLiveStore } from '../store/store.js';

/** Shared position color-coded badge (category cue only, never a value signal). */
function PositionBadge({ position, className }: { position: Position; className?: string }) {
  const c = POSITION_COLOR[position];
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-md font-bold uppercase leading-none tracking-wide',
        className,
      )}
      style={{ color: c, backgroundColor: `${c}1a`, boxShadow: `inset 0 0 0 1px ${c}55` }}
    >
      {position}
    </span>
  );
}

/** Full-page frame: slim header + a centered body column. */
function Frame({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
    </div>
  );
}

// --- Heroes ----------------------------------------------------------------

/** Energetic hero filled with the on-clock team's color; this station picks for it. */
function OnClockHero({
  teamName,
  ownerLabel,
  color,
  round,
  overall,
  clockLabel,
  urgent,
}: {
  teamName: string;
  ownerLabel?: string;
  color: string;
  round: number;
  overall: number;
  clockLabel: string;
  urgent: boolean;
}) {
  const fg = readableOn(color);
  return (
    <section
      className="animate-rise relative overflow-hidden rounded-2xl shadow-lg"
      style={{ backgroundColor: color, color: fg }}
    >
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-white/25 via-transparent to-black/15" />
      <div className="relative flex flex-wrap items-center justify-between gap-x-8 gap-y-5 px-6 py-6 sm:px-8">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.2em]">
            <Zap className="h-4 w-4" /> You're on the clock
          </p>
          <p className="mt-3 text-xs font-semibold uppercase tracking-wide opacity-70">
            Picking for
          </p>
          <h1 className="mt-0.5 truncate text-3xl font-black tracking-tight sm:text-4xl">
            {teamName}
          </h1>
          {ownerLabel && (
            <p className="mt-0.5 truncate text-sm font-medium opacity-80">{ownerLabel}</p>
          )}
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right leading-tight">
            <div className="text-[10px] font-bold uppercase tracking-[0.2em] opacity-70">Round</div>
            <div className="text-2xl font-black tabular-nums">{round}</div>
          </div>
          <div className="h-10 w-px" style={{ backgroundColor: `${fg}33` }} />
          <div className="text-right leading-tight">
            <div className="text-[10px] font-bold uppercase tracking-[0.2em] opacity-70">Pick</div>
            <div className="text-2xl font-black tabular-nums">#{overall}</div>
          </div>
          <div
            className={cn(
              'flex items-center gap-2 rounded-xl px-4 py-2.5 text-3xl font-black tabular-nums tracking-tight',
              urgent && 'animate-clock-pulse bg-red-600 text-white',
            )}
            style={urgent ? undefined : { backgroundColor: `${fg}1f` }}
          >
            <Clock className="h-6 w-6" /> {clockLabel}
          </div>
        </div>
      </div>
    </section>
  );
}

/** Calm neutral hero for pre-draft / paused. */
function WaitingHero({
  icon,
  title,
  subtitle,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
}) {
  return (
    <Card className="animate-rise">
      <CardContent className="flex items-center gap-4 py-6">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
          {icon}
        </div>
        <div>
          <h1 className="text-xl font-bold tracking-tight">{title}</h1>
          <p className="text-sm text-muted-foreground">{subtitle}</p>
        </div>
      </CardContent>
    </Card>
  );
}

/** Celebratory (but restrained — the Board owns the confetti) complete hero. */
function CompleteHero({ picks, rounds }: { picks: number; rounds: number }) {
  return (
    <section className="animate-rise relative overflow-hidden rounded-2xl border border-accent/40 bg-gradient-to-br from-amber-50 to-card px-6 py-7 shadow-sm sm:px-8">
      <div className="flex items-center gap-4">
        <Trophy className="h-10 w-10 shrink-0 text-accent" />
        <div>
          <h1 className="text-2xl font-black tracking-tight">Draft complete</h1>
          <p className="text-sm text-muted-foreground">
            {picks} picks · {rounds} rounds in the books
          </p>
        </div>
      </div>
    </section>
  );
}

// --- Roster ----------------------------------------------------------------

interface RosterEntry {
  key: string | number;
  name: string;
  position: Position;
  pending: boolean;
}

/** Group a team's picks (+ an optional optimistic pick) by position. */
function rosterGroups(entries: RosterEntry[]) {
  const buckets = new Map<Position, RosterEntry[]>();
  for (const e of entries) {
    const bucket = buckets.get(e.position);
    if (bucket) bucket.push(e);
    else buckets.set(e.position, [e]);
  }
  return [...buckets.entries()].sort(([a], [b]) => positionRank(a) - positionRank(b));
}

function RosterPanel({ entries }: { entries: RosterEntry[] }) {
  const groups = rosterGroups(entries);
  return (
    <Card className="lg:col-span-1">
      <div className="flex items-center justify-between border-b border-border px-5 py-4">
        <h2 className="text-sm font-bold uppercase tracking-wide text-muted-foreground">Roster</h2>
        <Badge variant="secondary">{entries.length}</Badge>
      </div>
      <CardContent className="p-4">
        {entries.length === 0 ? (
          <p className="px-1 py-6 text-center text-sm text-muted-foreground">
            No picks yet — they'll appear here as they're drafted.
          </p>
        ) : (
          <div className="space-y-4">
            {groups.map(([position, list]) => (
              <div key={position}>
                <div className="mb-1.5 flex items-center gap-2">
                  <span
                    className="h-3.5 w-1 rounded-full"
                    style={{ backgroundColor: POSITION_COLOR[position] }}
                  />
                  <span className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                    {POSITION_LABEL[position]}
                  </span>
                </div>
                <ul className="space-y-1">
                  {list.map((e) => (
                    <li
                      key={e.key}
                      className={cn(
                        'flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-sm',
                        e.pending ? 'animate-pick-in bg-accent/10' : 'animate-rise',
                      )}
                    >
                      <PositionBadge position={e.position} className="h-6 w-9 text-xs" />
                      <span className="min-w-0 flex-1 truncate font-medium">{e.name}</span>
                      {e.pending && (
                        <Loader2
                          className="h-3.5 w-3.5 shrink-0 animate-spin text-muted-foreground"
                          aria-label="drafting"
                        />
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// --- Available pool --------------------------------------------------------

function PoolPanel({
  status,
  groups,
  totalCount,
  filter,
  onFilter,
  canPick,
  onDraft,
}: {
  status: ReturnType<typeof usePool>['status'];
  groups: ReturnType<typeof groupAvailable>;
  totalCount: number;
  filter: string;
  onFilter: (v: string) => void;
  canPick: boolean;
  onDraft: (id: string, position: Position) => void;
}) {
  return (
    <Card className="lg:col-span-2">
      <div className="space-y-3 border-b border-border p-5">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold uppercase tracking-wide text-muted-foreground">
            Available players
          </h2>
          {status === 'ready' && (
            <Badge variant="outline">{totalCount.toLocaleString()} available</Badge>
          )}
        </div>
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            placeholder="Search by name…"
            value={filter}
            onChange={(e) => onFilter(e.target.value)}
            aria-label="Filter players by name"
            className="pl-9 pr-9"
          />
          {filter && (
            <button
              type="button"
              onClick={() => onFilter('')}
              aria-label="Clear search"
              className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-full p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>
      <CardContent className="p-3">
        <PoolBody
          status={status}
          groups={groups}
          filtering={filter.length > 0}
          canPick={canPick}
          onDraft={onDraft}
        />
      </CardContent>
    </Card>
  );
}

function PoolBody({
  status,
  groups,
  filtering,
  canPick,
  onDraft,
}: {
  status: ReturnType<typeof usePool>['status'];
  groups: ReturnType<typeof groupAvailable>;
  filtering: boolean;
  canPick: boolean;
  onDraft: (id: string, position: Position) => void;
}) {
  if (status === 'none') {
    return (
      <Alert variant="warning" className="m-2">
        <AlertCircle className="h-4 w-4 shrink-0" />
        <div>
          <AlertTitle>No player pool loaded</AlertTitle>
          <AlertDescription>Set a pool for this draft in Admin.</AlertDescription>
        </div>
      </Alert>
    );
  }
  if (status === 'loading') {
    return (
      <div className="flex items-center justify-center gap-3 py-16 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" /> Loading players…
      </div>
    );
  }
  if (status === 'error') {
    return (
      <Alert variant="destructive" className="m-2">
        <AlertCircle className="h-4 w-4 shrink-0" />
        <div>
          <AlertTitle>Couldn't load the player pool</AlertTitle>
          <AlertDescription>Check the connection and refresh to try again.</AlertDescription>
        </div>
      </Alert>
    );
  }
  if (groups.length === 0) {
    return (
      <p className="py-16 text-center text-sm text-muted-foreground">
        {filtering ? 'No players match your search.' : 'Every player has been drafted.'}
      </p>
    );
  }
  return (
    <div className="max-h-[62vh] overflow-y-auto px-2 pb-2">
      {groups.map((group) => {
        const c = POSITION_COLOR[group.position];
        return (
          <section key={group.position} className="mb-5 last:mb-0">
            <header
              className="sticky top-0 z-10 -mx-2 flex items-center gap-2.5 border-b border-border bg-card/95 px-2 py-2 backdrop-blur"
              style={{ borderLeft: `3px solid ${c}` }}
            >
              <h3 className="text-sm font-bold uppercase tracking-wide text-foreground">
                {POSITION_LABEL[group.position]}
              </h3>
              <Badge variant="secondary" className="ml-auto">
                {group.players.length}
              </Badge>
            </header>
            <ul className="mt-1">
              {group.players.map((player) => (
                <PlayerRow key={player.id} player={player} canPick={canPick} onDraft={onDraft} />
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

function PlayerRow({
  player,
  canPick,
  onDraft,
}: {
  player: Player;
  canPick: boolean;
  onDraft: (id: string, position: Position) => void;
}) {
  return (
    <li className="group flex items-center justify-between gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-muted">
      <div className="flex min-w-0 items-center gap-3">
        <PositionBadge position={player.position} className="h-6 w-9 text-xs" />
        <span className="truncate font-medium">
          {player.firstName} {player.lastName}
        </span>
      </div>
      <Button
        size="sm"
        disabled={!canPick}
        onClick={() => onDraft(player.id, player.position)}
        className="shrink-0 shadow-sm transition-transform active:scale-95 disabled:opacity-40"
      >
        Draft
      </Button>
    </li>
  );
}

// --- Root ------------------------------------------------------------------

export function StationView() {
  const state = useLiveStore();
  const { draft, serverOffsetMs, optimistic } = state;
  const pool = usePool(draft?.poolSnapshotId);
  const now = useTicker();
  const [filter, setFilter] = useState('');

  const onClockSlot = state.onClockTeamSlot();
  const onClockTeam = draft?.teams.find((t) => t.slot === onClockSlot) ?? null;
  const taken = useMemo(() => takenIds(state), [state]);
  const groups = useMemo(
    () => groupAvailable(pool.players, taken, filter),
    [pool.players, taken, filter],
  );
  const byId = useMemo(() => indexPlayers(pool.players), [pool.players]);

  // Roster for the on-clock team, plus the optimistic pick so a draft feels
  // instant before PICK_MADE reconciles it (§4.1). The pending entry is styled
  // distinctly and disappears when the authoritative pick arrives.
  const rosterEntries = useMemo<RosterEntry[]>(() => {
    if (onClockSlot === null || !draft) return [];
    const picks = draft.picks.filter((p: Pick) => p.teamSlot === onClockSlot);
    const entries: RosterEntry[] = picks.map((p) => ({
      key: p.overall,
      name: byId.get(p.playerId)
        ? `${byId.get(p.playerId)?.firstName} ${byId.get(p.playerId)?.lastName}`
        : p.playerId,
      position: p.position,
      pending: false,
    }));
    if (optimistic && optimistic.teamSlot === onClockSlot) {
      const player = byId.get(optimistic.playerId);
      if (player && !picks.some((p) => p.playerId === optimistic.playerId)) {
        entries.push({
          key: `optimistic-${optimistic.playerId}`,
          name: `${player.firstName} ${player.lastName}`,
          position: player.position,
          pending: true,
        });
      }
    }
    return entries;
  }, [draft, onClockSlot, optimistic, byId]);

  if (!draft) {
    return (
      <Frame>
        <div className="flex min-h-[60vh] items-center justify-center">
          <div className="flex items-center gap-3 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" /> Connecting to the draft…
          </div>
        </div>
      </Frame>
    );
  }

  const live = draft.status === 'ON_CLOCK' || draft.status === 'PICK_IN';
  const onClock = live && onClockSlot !== null;
  const canPick = onClock && !optimistic && pool.status === 'ready';
  const round = onClockSlot ? roundForOverall(draft.pointer, draft.settings.teams) : 0;
  const remaining = remainingMs(draft.pickDeadline, serverOffsetMs, now);
  const totalCount = groups.reduce((n, g) => n + g.players.length, 0);

  return (
    <Frame>
      <div className="space-y-6">
        {draft.status === 'COMPLETE' ? (
          <CompleteHero picks={draft.picks.length} rounds={draft.settings.rounds} />
        ) : onClock && onClockTeam ? (
          <OnClockHero
            teamName={onClockTeam.name}
            ownerLabel={onClockTeam.ownerLabel}
            color={teamColor(onClockTeam)}
            round={round}
            overall={draft.pointer}
            clockLabel={formatClock(remaining)}
            urgent={remaining <= 10_000}
          />
        ) : draft.status === 'PAUSED' ? (
          <WaitingHero
            icon={<Pause className="h-6 w-6" />}
            title="Draft paused"
            subtitle="Hang tight — the commissioner will resume shortly."
          />
        ) : (
          <WaitingHero
            icon={<Clock className="h-6 w-6" />}
            title="Waiting for the draft to start"
            subtitle={`${draft.settings.teams} teams · ${draft.settings.rounds} rounds · ${draft.settings.timerSec}s clock`}
          />
        )}

        {state.lastReject && (
          <Alert variant="warning">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <div>
              <AlertTitle>Pick not accepted</AlertTitle>
              <AlertDescription>{state.lastReject.message}</AlertDescription>
            </div>
          </Alert>
        )}

        <div className="grid gap-6 lg:grid-cols-3">
          <RosterPanel entries={rosterEntries} />
          <PoolPanel
            status={pool.status}
            groups={groups}
            totalCount={totalCount}
            filter={filter}
            onFilter={setFilter}
            canPick={canPick}
            onDraft={(id, position) => state.submitPick({ id, position })}
          />
        </div>
      </div>
    </Frame>
  );
}
