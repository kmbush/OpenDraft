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
import { AlertCircle, Clock, Loader2, Lock, Pause, Search, Trophy, X, Zap } from 'lucide-react';
import { useMemo, useState } from 'react';
import { AppHeader } from '../components/app-header.js';
import { PositionBadge } from '../components/position-badge.js';
import { Alert, AlertDescription, AlertTitle } from '../components/ui/alert.js';
import { Badge } from '../components/ui/badge.js';
import { Button } from '../components/ui/button.js';
import { Card, CardContent } from '../components/ui/card.js';
import { Input } from '../components/ui/input.js';
import { Modal } from '../components/ui/modal.js';
import { indexPlayers, playerName, usePool } from '../hooks/usePool.js';
import { useTicker } from '../hooks/useTicker.js';
import { formatClock, remainingMs } from '../lib/clock.js';
import { cn } from '../lib/cn.js';
import { groupAvailable, playerMeta } from '../lib/pool.js';
import { POSITION_COLOR, POSITION_LABEL, positionRank } from '../lib/positions.js';
import {
  type RosterSlot,
  type SlotPick,
  assignRosterSlots,
  rosterPositions,
} from '../lib/roster.js';
import { readableOn, teamColor } from '../lib/teams.js';
import { takenIds } from '../store/reducer.js';
import { useLiveStore } from '../store/store.js';

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

/** One roster slot row: the slot label + its player, or a clear empty placeholder. */
function RosterSlotRow({ slot, name, meta }: { slot: RosterSlot; name: string; meta: string }) {
  const { pick } = slot;
  return (
    <li
      className={cn(
        'flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-sm',
        pick?.pending
          ? 'animate-pick-in bg-accent/10'
          : pick
            ? 'animate-rise'
            : 'border border-dashed border-border/70',
      )}
    >
      <span className="w-16 shrink-0 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
        {slot.label}
      </span>
      {pick ? (
        <>
          <PositionBadge position={pick.position} className="h-6 w-9 shrink-0 rounded-md text-xs" />
          <span className="min-w-0 flex-1 truncate">
            <span className="font-medium">{name}</span>
            {meta && <span className="ml-1.5 text-xs text-muted-foreground">{meta}</span>}
          </span>
          {pick.pending && (
            <Loader2
              className="h-3.5 w-3.5 shrink-0 animate-spin text-muted-foreground"
              aria-label="drafting"
            />
          )}
        </>
      ) : (
        <span className="flex-1 text-sm text-muted-foreground/50">empty</span>
      )}
    </li>
  );
}

function RosterPanel({
  slots,
  nameOf,
  metaOf,
}: {
  slots: RosterSlot[];
  nameOf: (id: string) => string;
  metaOf: (id: string) => string;
}) {
  const filled = slots.filter((s) => s.pick).length;
  return (
    <Card className="lg:col-span-1">
      <div className="flex items-center justify-between border-b border-border px-5 py-4">
        <h2 className="text-sm font-bold uppercase tracking-wide text-muted-foreground">Roster</h2>
        {slots.length > 0 && (
          <Badge variant="secondary">
            {filled}/{slots.length}
          </Badge>
        )}
      </div>
      <CardContent className="p-4">
        {slots.length === 0 ? (
          <p className="px-1 py-6 text-center text-sm text-muted-foreground">
            Roster slots appear once a team is on the clock.
          </p>
        ) : (
          <ul className="space-y-1">
            {slots.map((slot, i) => (
              <RosterSlotRow
                // biome-ignore lint/suspicious/noArrayIndexKey: slots are a fixed positional list
                key={i}
                slot={slot}
                name={slot.pick ? nameOf(slot.pick.playerId) : ''}
                meta={slot.pick ? metaOf(slot.pick.playerId) : ''}
              />
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

// --- Available pool --------------------------------------------------------

/** A single position (or "All") filter pill above the pool. Grouping cue, never value. */
function FilterPill({
  label,
  active,
  color,
  onClick,
}: {
  label: string;
  active: boolean;
  color?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'rounded-full border px-3 py-1 text-xs font-bold uppercase tracking-wide transition-colors',
        active
          ? 'border-transparent bg-foreground text-background'
          : 'border-border text-muted-foreground hover:bg-muted hover:text-foreground',
      )}
      style={active && color ? { backgroundColor: color, color: '#fff' } : undefined}
    >
      {label}
    </button>
  );
}

/** Row of position filters: [All] + one per position the roster actually uses. */
function PositionFilterBar({
  positions,
  active,
  onSelect,
}: {
  positions: Position[];
  active: Position | 'ALL';
  onSelect: (p: Position | 'ALL') => void;
}) {
  if (positions.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      <FilterPill label="All" active={active === 'ALL'} onClick={() => onSelect('ALL')} />
      {positions.map((p) => (
        <FilterPill
          key={p}
          label={p}
          color={POSITION_COLOR[p]}
          active={active === p}
          onClick={() => onSelect(p)}
        />
      ))}
    </div>
  );
}

function PoolPanel({
  status,
  groups,
  totalCount,
  filter,
  onFilter,
  positions,
  posFilter,
  onPosFilter,
  showBye,
  canPick,
  onDraft,
}: {
  status: ReturnType<typeof usePool>['status'];
  groups: ReturnType<typeof groupAvailable>;
  totalCount: number;
  filter: string;
  onFilter: (v: string) => void;
  positions: Position[];
  posFilter: Position | 'ALL';
  onPosFilter: (p: Position | 'ALL') => void;
  showBye: boolean;
  canPick: boolean;
  onDraft: (player: Player) => void;
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
            placeholder="Search by name or team…"
            value={filter}
            onChange={(e) => onFilter(e.target.value)}
            aria-label="Filter players by name or team"
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
        <PositionFilterBar positions={positions} active={posFilter} onSelect={onPosFilter} />
      </div>
      <CardContent className="p-3">
        <PoolBody
          status={status}
          groups={groups}
          filtering={filter.length > 0}
          showBye={showBye}
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
  showBye,
  canPick,
  onDraft,
}: {
  status: ReturnType<typeof usePool>['status'];
  groups: ReturnType<typeof groupAvailable>;
  filtering: boolean;
  showBye: boolean;
  canPick: boolean;
  onDraft: (player: Player) => void;
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
                <PlayerRow
                  key={player.id}
                  player={player}
                  showBye={showBye}
                  canPick={canPick}
                  onDraft={onDraft}
                />
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
  showBye,
  canPick,
  onDraft,
}: {
  player: Player;
  showBye: boolean;
  canPick: boolean;
  onDraft: (player: Player) => void;
}) {
  const meta = playerMeta(player, showBye);
  return (
    <li className="group flex items-center justify-between gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-muted">
      <div className="flex min-w-0 items-center gap-3">
        <PositionBadge position={player.position} className="h-6 w-9 shrink-0 rounded-md text-xs" />
        <span className="min-w-0 truncate">
          <span className="font-medium">
            {player.firstName} {player.lastName}
          </span>
          {meta && <span className="ml-2 text-xs text-muted-foreground">{meta}</span>}
        </span>
      </div>
      <Button
        size="sm"
        disabled={!canPick}
        onClick={() => onDraft(player)}
        className="shrink-0 shadow-sm transition-transform active:scale-95 disabled:opacity-40"
      >
        Draft
      </Button>
    </li>
  );
}

/** Confirm-before-draft modal (mirrors the admin ConfirmDialog pattern). */
function DraftConfirmDialog({
  player,
  meta,
  onConfirm,
  onClose,
}: {
  player: Player;
  meta: string;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <Modal onClose={onClose}>
      <CardContent className="space-y-4 p-6">
        <div>
          <h2 className="text-lg font-black tracking-tight">
            Draft {player.firstName} {player.lastName}?
          </h2>
          <p className="mt-1 flex items-center gap-2 text-sm text-muted-foreground">
            <PositionBadge
              position={player.position}
              className="h-5 w-8 shrink-0 rounded-md text-[11px]"
            />
            {meta || POSITION_LABEL[player.position]}
          </p>
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={() => {
              onConfirm();
              onClose();
            }}
          >
            <Zap className="h-4 w-4" /> Draft
          </Button>
        </div>
      </CardContent>
    </Modal>
  );
}

// --- Root ------------------------------------------------------------------

export function StationView() {
  const state = useLiveStore();
  const { draft, serverOffsetMs, optimistic } = state;
  const pool = usePool(draft?.poolSnapshotId);
  const now = useTicker();
  const [filter, setFilter] = useState('');
  const [posFilter, setPosFilter] = useState<Position | 'ALL'>('ALL');
  const [confirming, setConfirming] = useState<Player | null>(null);

  const showBye = draft?.settings.showByeWeeks !== false;
  const onClockSlot = state.onClockTeamSlot();
  const onClockTeam = draft?.teams.find((t) => t.slot === onClockSlot) ?? null;
  const taken = useMemo(() => takenIds(state), [state]);
  const byId = useMemo(() => indexPlayers(pool.players), [pool.players]);
  const nameOf = (id: string): string => playerName(byId, id);
  const metaOf = (id: string): string => {
    const p = byId.get(id);
    return p ? playerMeta(p, showBye) : '';
  };

  // Only offer players the roster can actually hold — a standard (no-IDP) league
  // hides DL/LB/DB, a no-K/DEF league hides those, etc. (#4).
  const rosterFormat = draft?.settings.rosterFormat;
  const allowed = useMemo(
    () => (rosterFormat ? rosterPositions(rosterFormat) : null),
    [rosterFormat],
  );
  // Filter buttons: [All] + one per position the roster uses, in display order.
  const filterPositions = useMemo(
    () => (allowed ? [...allowed].sort((a, b) => positionRank(a) - positionRank(b)) : []),
    [allowed],
  );
  const groups = useMemo(() => {
    const g = groupAvailable(pool.players, taken, filter).filter(
      (x) =>
        (!allowed || allowed.has(x.position)) && (posFilter === 'ALL' || x.position === posFilter),
    );
    return g;
  }, [pool.players, taken, filter, allowed, posFilter]);

  // The on-clock team's picks laid into labeled starter/flex/bench slots, plus the
  // optimistic pick so a draft fills a slot instantly before PICK_MADE reconciles
  // it (§4.1). The pending slot is styled distinctly and settles when it arrives.
  const rosterSlots = useMemo<RosterSlot[]>(() => {
    if (onClockSlot === null || !draft) return [];
    const picks: SlotPick[] = draft.picks
      .filter((p: Pick) => p.teamSlot === onClockSlot)
      .sort((a, b) => a.overall - b.overall)
      .map((p) => ({ playerId: p.playerId, position: p.position }));
    if (optimistic && optimistic.teamSlot === onClockSlot) {
      const player = byId.get(optimistic.playerId);
      if (player && !picks.some((p) => p.playerId === optimistic.playerId)) {
        picks.push({ playerId: optimistic.playerId, position: player.position, pending: true });
      }
    }
    return assignRosterSlots(picks, draft.settings.rosterFormat);
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

  // Only ON_CLOCK can draft. PICK_IN is the hard announcement lockout: the pointer
  // has moved to this station's next team, but the server rejects every pick until
  // the announcement finishes — so the Draft buttons stay disabled (mirrors the
  // engine's ANNOUNCING reject).
  const onClock = draft.status === 'ON_CLOCK' && onClockSlot !== null;
  const announcing = draft.status === 'PICK_IN';
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
        ) : announcing ? (
          <WaitingHero
            icon={<Lock className="h-6 w-6" />}
            title="The pick is being announced…"
            subtitle="You're up in a moment — drafting unlocks when the board calls the next team."
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
          <RosterPanel slots={rosterSlots} nameOf={nameOf} metaOf={metaOf} />
          <PoolPanel
            status={pool.status}
            groups={groups}
            totalCount={totalCount}
            filter={filter}
            onFilter={setFilter}
            positions={filterPositions}
            posFilter={posFilter}
            onPosFilter={setPosFilter}
            showBye={showBye}
            canPick={canPick}
            onDraft={setConfirming}
          />
        </div>
      </div>

      {confirming && (
        <DraftConfirmDialog
          player={confirming}
          meta={playerMeta(confirming, showBye)}
          onConfirm={() => state.submitPick({ id: confirming.id, position: confirming.position })}
          onClose={() => setConfirming(null)}
        />
      )}
    </Frame>
  );
}
