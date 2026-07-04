/**
 * Player station (DESIGN §7): the on-clock team's roster + the available pool
 * grouped by position, alphabetical within group (NO rank/ADP, no such control —
 * CONVENTIONS §5). Select → Draft emits SUBMIT_PICK optimistically.
 */
import { useMemo, useState } from 'react';
import { indexPlayers, usePool } from '../hooks/usePool.js';
import { groupAvailable } from '../lib/pool.js';
import { POSITION_LABEL } from '../lib/positions.js';
import { takenIds } from '../store/reducer.js';
import { useLiveStore } from '../store/store.js';

export function StationView() {
  const state = useLiveStore();
  const { draft } = state;
  const players = usePool(draft?.poolSnapshotId);
  const [filter, setFilter] = useState('');

  const onClockSlot = state.onClockTeamSlot();
  const onClockTeam = draft?.teams.find((t) => t.slot === onClockSlot) ?? null;
  const taken = useMemo(() => takenIds(state), [state]);
  const groups = useMemo(() => groupAvailable(players, taken, filter), [players, taken, filter]);
  const byId = useMemo(() => indexPlayers(players), [players]);

  if (!draft) return <p className="muted">Connecting to the draft…</p>;

  const roster = draft.picks.filter((p) => p.teamSlot === onClockSlot);
  const canPick = onClockSlot !== null && !state.optimistic;

  return (
    <div className="station">
      <div className="banner" style={{ background: 'var(--color-primary)' }}>
        {onClockTeam ? (
          <>
            You're picking for: <strong>{onClockTeam.name}</strong>
          </>
        ) : draft.status === 'COMPLETE' ? (
          'Draft complete'
        ) : (
          'Waiting for the draft to start…'
        )}
      </div>

      {state.lastReject && (
        <p className="reject" role="alert">
          {state.lastReject.code}: {state.lastReject.message}
        </p>
      )}

      <section className="roster">
        <h2>Roster so far</h2>
        {roster.length === 0 ? (
          <p className="muted">No picks yet.</p>
        ) : (
          <ol>
            {roster.map((pick) => {
              const player = byId.get(pick.playerId);
              return (
                <li key={pick.overall}>
                  {pick.position} —{' '}
                  {player ? `${player.firstName} ${player.lastName}` : pick.playerId}
                </li>
              );
            })}
          </ol>
        )}
      </section>

      <section className="pool">
        <input
          type="search"
          placeholder="Filter by name"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          aria-label="Filter players by name"
        />
        {groups.map((group) => (
          <div key={group.position} className="pos-group">
            <h3>{POSITION_LABEL[group.position]}</h3>
            <ul>
              {group.players.map((player) => (
                <li key={player.id}>
                  <span>
                    {player.firstName} {player.lastName}
                  </span>
                  <button
                    type="button"
                    disabled={!canPick}
                    onClick={() => state.submitPick({ id: player.id, position: player.position })}
                  >
                    Draft
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </section>
    </div>
  );
}
