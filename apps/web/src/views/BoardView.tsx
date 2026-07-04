/**
 * Draft board (DESIGN §7): on-the-clock team, round, recent picks, and a
 * countdown rendered from `pickDeadline` corrected by the clock offset (AD-1,
 * §5.5). Basic "the pick is in" state; Phase 2 adds the animation.
 */
import { useMemo } from 'react';
import { indexPlayers, usePool } from '../hooks/usePool.js';
import { useTicker } from '../hooks/useTicker.js';
import { formatClock, remainingMs } from '../lib/clock.js';
import { useLiveStore } from '../store/store.js';

export function BoardView() {
  const state = useLiveStore();
  const { draft, serverOffsetMs } = state;
  const now = useTicker();
  const players = usePool(draft?.poolSnapshotId);
  const byId = useMemo(() => indexPlayers(players), [players]);

  if (!draft) return <p className="muted">Connecting to the draft…</p>;

  const onClockSlot = state.onClockTeamSlot();
  const onClockTeam = draft.teams.find((t) => t.slot === onClockSlot) ?? null;
  const round = onClockSlot
    ? Math.ceil(draft.pointer / draft.settings.teams)
    : draft.settings.rounds;
  const remaining = remainingMs(draft.pickDeadline, serverOffsetMs, now);
  const recent = draft.picks.slice(-6).reverse();
  const justPicked = draft.status === 'PICK_IN' && draft.pendingPick;

  const name = (id: string) => {
    const p = byId.get(id);
    return p ? `${p.firstName} ${p.lastName}` : id;
  };

  return (
    <div className="board">
      {draft.status === 'COMPLETE' ? (
        <h1>Draft complete</h1>
      ) : justPicked ? (
        <div className="pick-in" style={{ color: 'var(--color-accent)' }}>
          <h1>The pick is in!</h1>
          <p>
            {draft.teams.find((t) => t.slot === draft.pendingPick?.teamSlot)?.name} selected{' '}
            {name(draft.pendingPick?.playerId ?? '')}
            {draft.pendingPick?.auto ? ' (auto)' : ''}
          </p>
        </div>
      ) : (
        <div className="on-clock">
          <h1>On the clock: {onClockTeam?.name ?? '—'}</h1>
          <p className="round">Round {round}</p>
          <p className="clock" aria-live="polite">
            {formatClock(remaining)}
          </p>
        </div>
      )}

      <section className="ticker">
        <h2>Recent picks</h2>
        <ol>
          {recent.map((pick) => (
            <li key={pick.overall}>
              #{pick.overall} {draft.teams.find((t) => t.slot === pick.teamSlot)?.name}:{' '}
              {name(pick.playerId)}
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
