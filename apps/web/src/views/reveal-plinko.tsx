/**
 * "Plinko" — the peg-board reveal.
 *
 * One puck per beat, in the team's colour, dropped through a field of pegs into
 * its slot. Slots fill from the worst pick inward, so the last puck falls alone
 * onto an otherwise finished board: first overall.
 *
 * The bounce is precomputed rather than simulated (see `lib/plinko`) — physics
 * can't be resumed, and a board reconnecting mid-show has no state to resume
 * from. Each puck's path is a pure function of its slot and the elapsed time.
 */
import { REVEAL_FINALE_MS, pickRevealAtMs } from '@opendraft/shared';
import { CircleDot } from 'lucide-react';
import { Confetti } from '../components/confetti.js';
import { useRafNow } from '../hooks/useRafNow.js';
import { estimatedServerNow } from '../lib/clock.js';
import { cn } from '../lib/cn.js';
import { PEG_ROWS, pegOffset, plinkoPath, puckAt } from '../lib/plinko.js';
import { readableOn } from '../lib/teams.js';
import { RevealCountdown, type RevealGameProps } from './reveal.js';

/** How long a puck spends falling. Must not exceed the lead-in before beat one. */
const DROP_MS = 1400;

/** Percent-of-field helper — the whole board is laid out in percentages so it scales to any TV. */
const pct = (n: number) => `${n}%`;

function PegField({ cols, strike }: { cols: number; strike: { row: number; x: number } | null }) {
  const rows = Array.from({ length: PEG_ROWS }, (_, r) => r);
  return (
    <>
      {rows.map((r) =>
        Array.from({ length: cols }, (_, c) => {
          // Offset comes from the puck's own geometry, so bounces land on pegs.
          const x = c + pegOffset(r, cols);
          if (x > cols - 1) return null;
          // Light the peg the puck is passing — a strike you can see is what
          // separates a bouncing puck from one drifting through a dot grid.
          const hit = strike !== null && strike.row === r && Math.abs(strike.x - x) < 0.4;
          return (
            <span
              // biome-ignore lint/suspicious/noArrayIndexKey: pegs are a fixed positional grid
              key={`${r}-${c}`}
              className={cn(
                'absolute -translate-x-1/2 -translate-y-1/2 rounded-full transition-none',
                hit
                  ? 'h-[1.6vh] w-[1.6vh] bg-white shadow-[0_0_2vh_rgba(255,255,255,0.9)]'
                  : 'h-[1.1vh] w-[1.1vh] bg-white/40 shadow-[0_0_6px_rgba(255,255,255,0.25)]',
              )}
              style={{
                left: pct((x / (cols - 1)) * 100),
                top: pct(((r + 1) / (PEG_ROWS + 1)) * 100),
              }}
            />
          );
        }),
      )}
    </>
  );
}

export function PlinkoReveal({ draft, now, serverOffsetMs, teamName, colorOf }: RevealGameProps) {
  // A puck sampled on the board's 250ms ticker teleports between positions; a
  // falling object needs frames.
  const rafNow = useRafNow();
  const reveal = draft.reveal;
  if (!reveal) return null;

  const teams = draft.order.length;
  const elapsed = estimatedServerNow(rafNow || now, serverOffsetMs) - reveal.revealAt;
  if (elapsed < 0) return <RevealCountdown remaining={-elapsed} />;

  const cols = Math.max(2, teams);
  const finaleAt = pickRevealAtMs(1, teams);
  const outro = elapsed >= finaleAt + REVEAL_FINALE_MS;

  // A puck is in flight for DROP_MS before its beat, then rests in its slot.
  const pucks = draft.order.map((slot, i) => {
    const pickNo = i + 1;
    const landAt = pickRevealAtMs(pickNo, teams);
    // Slots fill outward from the worst pick, so #1's slot is the last one free.
    const col = teams - pickNo;
    return { slot, pickNo, landAt, col, launched: elapsed >= landAt - DROP_MS };
  });

  const landed = pucks.filter((p) => elapsed >= p.landAt);

  // At most one puck is in flight at a time, so the struck peg is unambiguous.
  const flying = pucks.find((p) => p.launched && elapsed < p.landAt);
  const strike = (() => {
    if (!flying) return null;
    const pos = puckAt(
      plinkoPath(flying.slot + 1, flying.col, cols),
      (elapsed - (flying.landAt - DROP_MS)) / DROP_MS,
    );
    return pos.striking ? { row: pos.row, x: pos.x } : null;
  })();

  return (
    <div className="relative flex flex-1 flex-col items-center gap-[2vh] overflow-hidden px-8 py-[3vh]">
      <div className="flex items-center gap-3">
        <CircleDot className="h-6 w-6 text-amber-400" />
        <p className="font-black uppercase tracking-[0.35em] text-amber-400/90 md:text-2xl">
          {outro ? 'The Order Is Set' : 'The Drop'}
        </p>
      </div>

      <div className="relative w-full max-w-[min(90vw,1100px)] flex-1">
        {/* Peg field — pucks fall through this region. */}
        <div className="absolute inset-x-[4%] top-0 bottom-[16%]">
          <PegField cols={cols} strike={strike} />

          {pucks.map((p) => {
            if (!p.launched) return null;
            const path = plinkoPath(p.slot + 1, p.col, cols);
            const progress = (elapsed - (p.landAt - DROP_MS)) / DROP_MS;
            const pos = puckAt(path, progress);
            const resting = elapsed >= p.landAt;
            if (resting) return null; // handed off to the slot row below
            const color = colorOf(p.slot);
            return (
              <span
                key={p.slot}
                className={cn(
                  'absolute z-20 flex h-[5vh] w-[5vh] -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full font-black text-[2.2vh] ring-2 ring-white/50',
                  // Squash on the peg strike — the whole reason it reads as a bounce.
                  pos.striking && 'scale-90',
                )}
                style={{
                  left: pct((pos.x / (cols - 1)) * 100),
                  top: pct(pos.y * 100),
                  background: color,
                  color: readableOn(color),
                  boxShadow: `0 0 3vh ${color}, 0 0 6vh ${color}66`,
                }}
              >
                {/* A marking on the rim, so the spin is visible while the number stays upright. */}
                <span
                  className="pointer-events-none absolute inset-0 rounded-full"
                  style={{
                    rotate: `${pos.spin}deg`,
                    background: `conic-gradient(from 0deg, ${readableOn(color)}44 0deg 18deg, transparent 18deg 180deg, ${readableOn(color)}44 180deg 198deg, transparent 198deg)`,
                  }}
                />
                <span className="relative">{p.pickNo}</span>
              </span>
            );
          })}
        </div>

        {/* Slots along the bottom — a puck lands and becomes its slot's card. */}
        <div
          className="absolute inset-x-[4%] bottom-0 grid h-[15%] gap-[0.6%]"
          style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
        >
          {Array.from({ length: cols }, (_, c) => {
            const p = pucks.find((x) => x.col === c && elapsed >= x.landAt);
            if (!p) {
              return (
                <span
                  // biome-ignore lint/suspicious/noArrayIndexKey: slots are fixed board positions
                  key={c}
                  className="flex items-end justify-center rounded-md border border-white/10 border-b-2 bg-white/[0.03] pb-1 text-[1.4vh] text-white/25"
                >
                  {teams - c}
                </span>
              );
            }
            const color = colorOf(p.slot);
            const first = p.pickNo === 1;
            return (
              <span
                // biome-ignore lint/suspicious/noArrayIndexKey: slots are fixed board positions
                key={c}
                className={cn(
                  'flex flex-col items-center justify-center gap-0.5 overflow-hidden rounded-md px-1 font-black leading-tight',
                  first && 'ring-2 ring-amber-300',
                )}
                style={{
                  background: color,
                  color: readableOn(color),
                  boxShadow: `0 0 2.5vh ${color}88`,
                }}
              >
                <span className="text-[1.2vh] uppercase tracking-widest opacity-80">
                  {first ? '1st' : `#${p.pickNo}`}
                </span>
                <span className="max-w-full truncate text-[1.6vh] uppercase">
                  {teamName(p.slot)}
                </span>
              </span>
            );
          })}
        </div>
      </div>

      <p className="text-center text-sm uppercase tracking-[0.3em] text-white/40">
        {landed.length} of {teams} dropped
      </p>
      {elapsed >= finaleAt && <Confetti count={140} />}
    </div>
  );
}
