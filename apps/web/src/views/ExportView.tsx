/**
 * Post-draft board + PDF export (pillar #3, AD-9). A print-ready recap grid:
 * columns are teams in draft-order, rows are rounds, each cell the player that
 * team drafted that round. Standalone page (no admin chrome, same separation as
 * board/station); a print-hidden control bar carries the "Download PDF" button,
 * which is just `window.print()` → the browser's Save-as-PDF (AD-9). Print CSS in
 * index.css hides the chrome, forces a light landscape palette, and keeps the
 * grid legible. No ADP/ranking anywhere — position colors are a category cue only.
 */
import type { Pick, Position, RosterFormat } from '@opendraft/shared';
import { FileDown, Printer } from 'lucide-react';
import { useMemo } from 'react';
import { BrandMark } from '../components/brand-mark.js';
import { useLeague } from '../hooks/useLeague.js';
import { indexPlayers, usePool } from '../hooks/usePool.js';
import { buildBoardGrid } from '../lib/board.js';
import { cn } from '../lib/cn.js';
import { POSITION_COLOR } from '../lib/positions.js';
import { teamColor } from '../lib/teams.js';
import { useLiveStore } from '../store/store.js';

const DEFAULT_LEAGUE_NAME = 'Fantasy Draft';

/** Human label for the roster shape, derived from the format (no preset stored). */
function formatLabel(rf: RosterFormat): string {
  if (rf.starters.DL || rf.starters.LB || rf.starters.DB) return 'IDP';
  if (rf.flex.some((f) => f.kind === 'SUPERFLEX')) return 'Superflex';
  return 'Standard';
}

/** Small position badge — the shared color map, purely a category cue. */
function PositionTag({ position }: { position: Position }) {
  const c = POSITION_COLOR[position];
  return (
    <span
      className="inline-flex h-4 items-center justify-center rounded px-1 text-[9px] font-black uppercase leading-none tracking-wide"
      style={{ color: c, backgroundColor: `${c}1f`, boxShadow: `inset 0 0 0 1px ${c}66` }}
    >
      {position}
    </span>
  );
}

/** One drafted-player cell, or a quiet placeholder for an unfilled slot. */
function BoardCell({ pick, name, team }: { pick: Pick | null; name: string; team: string }) {
  if (!pick) {
    return (
      <td className="border border-border p-1.5 align-top">
        <span className="text-muted-foreground/30">—</span>
      </td>
    );
  }
  return (
    <td className="border border-border p-1.5 align-top">
      <div className="flex items-center justify-between gap-1">
        <PositionTag position={pick.position} />
        <span className="text-[9px] font-semibold tabular-nums text-muted-foreground">
          {pick.overall}
        </span>
      </div>
      <div className="mt-0.5 truncate text-[11px] font-semibold leading-tight">
        {name}
        {team && <span className="ml-1 font-normal text-muted-foreground">{team}</span>}
      </div>
    </td>
  );
}

export function ExportView() {
  const { draft } = useLiveStore();
  const pool = usePool(draft?.poolSnapshotId);
  const byId = useMemo(() => indexPlayers(pool.players), [pool.players]);
  const league = useLeague();

  if (!draft) {
    return (
      <div className="flex min-h-screen items-center justify-center text-muted-foreground">
        Connecting to the draft…
      </div>
    );
  }

  const { settings, teams: teamList, order, picks } = draft;
  const grid = buildBoardGrid(picks, settings.teams, settings.rounds, order);
  const teamOf = (slot: number) => teamList.find((t) => t.slot === slot);
  const name = league?.name?.trim() || DEFAULT_LEAGUE_NAME;
  const nameOf = (id: string) => {
    const p = byId.get(id);
    return p ? `${p.firstName} ${p.lastName}` : id;
  };
  const teamOfPlayer = (id: string) => byId.get(id)?.team ?? '';

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* On-screen control bar — hidden in print (AD-9). */}
      <div className="no-print sticky top-0 z-10 flex items-center justify-between gap-4 border-b border-border bg-card/90 px-6 py-3 backdrop-blur">
        <div className="flex items-center gap-2">
          <BrandMark nameClassName="font-bold" />
          <span className="text-sm text-muted-foreground">· Draft board</span>
        </div>
        <button
          type="button"
          onClick={() => window.print()}
          className="inline-flex h-9 items-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:opacity-90"
        >
          <FileDown className="h-4 w-4" /> Download PDF
        </button>
      </div>

      <main className="print-exact mx-auto max-w-[1600px] px-6 py-6">
        {/* Board header / meta — printed with the board. */}
        <header className="mb-4 flex flex-wrap items-end justify-between gap-2">
          <div className="flex items-center gap-3">
            {league?.theme?.logo && (
              <img
                src={league.theme.logo}
                alt=""
                className="h-11 w-auto max-w-[160px] object-contain"
              />
            )}
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.25em] text-accent">
                Final Draft Board
              </p>
              <h1 className="text-2xl font-black tracking-tight">{name}</h1>
            </div>
          </div>
          <p className="text-sm text-muted-foreground">
            {settings.teams} teams · {settings.rounds} rounds · {settings.mode} ·{' '}
            {formatLabel(settings.rosterFormat)}
          </p>
        </header>

        <div className="overflow-x-auto">
          <table className="print-board w-full table-fixed border-collapse text-left">
            <thead>
              <tr>
                <th className="w-8 border border-border bg-muted p-1.5 text-center text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                  Rd
                </th>
                {grid.columns.map((slot) => {
                  const team = teamOf(slot);
                  const color = teamColor(team);
                  return (
                    <th
                      key={slot}
                      className="border border-border bg-muted p-1.5"
                      style={{ borderTop: `3px solid ${color}` }}
                    >
                      <div className="flex items-center gap-1.5">
                        <span
                          className="h-2.5 w-2.5 shrink-0 rounded-full"
                          style={{ backgroundColor: color }}
                          aria-hidden
                        />
                        <span className="min-w-0 flex-1 truncate text-[11px] font-bold leading-tight">
                          {team?.name ?? `Team ${slot}`}
                        </span>
                      </div>
                      {team?.ownerLabel && (
                        <div className="truncate text-[9px] leading-tight text-muted-foreground">
                          {team.ownerLabel}
                        </div>
                      )}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {grid.rows.map((row, r) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: rows are fixed positional rounds
                <tr key={r} className={cn(r % 2 === 1 && 'bg-muted/40')}>
                  <th className="border border-border bg-muted/60 p-1.5 text-center text-xs font-black tabular-nums">
                    {r + 1}
                  </th>
                  {row.map((cell, c) => (
                    <BoardCell
                      // biome-ignore lint/suspicious/noArrayIndexKey: cells are fixed positional columns
                      key={c}
                      pick={cell}
                      name={cell ? nameOf(cell.playerId) : ''}
                      team={cell ? teamOfPlayer(cell.playerId) : ''}
                    />
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p className="no-print mt-4 flex items-center gap-2 text-xs text-muted-foreground">
          <Printer className="h-3.5 w-3.5" /> Tip: choose “Save as PDF” and landscape in the print
          dialog.
        </p>
      </main>
    </div>
  );
}
