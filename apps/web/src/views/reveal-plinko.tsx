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
import { Fragment } from 'react';
import { Confetti } from '../components/confetti.js';
import { useStepCue } from '../hooks/useBoardSounds.js';
import { useRafNow } from '../hooks/useRafNow.js';
import { estimatedServerNow } from '../lib/clock.js';
import { cn } from '../lib/cn.js';
import { PEG_ROWS, pegOffset, plinkoPath, puckAt, slotColumns } from '../lib/plinko.js';
import { readableOn } from '../lib/teams.js';
import { RevealCountdown, type RevealGameProps } from './reveal.js';

/** How long a puck spends falling. Must not exceed the lead-in before beat one. */
const DROP_MS = 1400;

/** How long a slot flares after a puck hits it. */
const IMPACT_MS = 340;

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

export function PlinkoReveal({
  draft,
  now,
  serverOffsetMs,
  teamName,
  colorOf,
  play,
}: RevealGameProps) {
  // A puck sampled on the board's 250ms ticker teleports between positions; a
  // falling object needs frames.
  const rafNow = useRafNow();
  const reveal = draft.reveal;
  const teams = draft.order.length;
  // Computed above the early returns below, because the cues are hooks.
  const elapsed = reveal ? estimatedServerNow(rafNow || now, serverOffsetMs) - reveal.revealAt : -1;
  const landedCount = draft.order.filter((_, i) => elapsed >= pickRevealAtMs(i + 1, teams)).length;

  // The peg knock lands with the puck.
  useStepCue(landedCount, 'reveal-beat', play);
  useStepCue(elapsed >= pickRevealAtMs(1, teams) ? 1 : 0, 'reveal-finale', play);

  if (!reveal) return null;
  if (elapsed < 0) return <RevealCountdown remaining={-elapsed} />;

  const cols = Math.max(2, teams);
  const finaleAt = pickRevealAtMs(1, teams);
  const outro = elapsed >= finaleAt + REVEAL_FINALE_MS;

  // Scattered, not left-to-right: a board that fills in order gives away where
  // every remaining puck must land, the finale included.
  const columns = slotColumns(reveal.revealAt, teams);

  // A puck is in flight for DROP_MS before its beat, then rests in its slot.
  const pucks = draft.order.map((slot, i) => {
    const pickNo = i + 1;
    const landAt = pickRevealAtMs(pickNo, teams);
    const col = columns[i] ?? 0;
    return { slot, pickNo, landAt, col, launched: elapsed >= landAt - DROP_MS };
  });

  const landed = pucks.filter((p) => elapsed >= p.landAt);
  // The last puck is in flight: dim the board around it.
  const finaleDrop = elapsed >= finaleAt - DROP_MS && elapsed < finaleAt + IMPACT_MS;

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
        {/* Everything dims for the final drop, so one puck owns the screen. */}
        <div
          className="pointer-events-none absolute -inset-8 z-30 bg-black transition-opacity duration-700"
          style={{ opacity: finaleDrop ? 0.55 : 0 }}
        />
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
            const last = p.pickNo === 1;
            return (
              <Fragment key={p.slot}>
                {/* Trail: the puck's own recent past, fading. Reads as speed. */}
                {[0.05, 0.1, 0.16].map((back, k) => {
                  const ghost = puckAt(path, progress - back);
                  if (progress - back <= 0) return null;
                  return (
                    <span
                      // biome-ignore lint/suspicious/noArrayIndexKey: fixed trail positions
                      key={k}
                      className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-1/2 rounded-full"
                      style={{
                        left: pct((ghost.x / (cols - 1)) * 100),
                        top: pct(ghost.y * 100),
                        height: `${(last ? 6.5 : 5) * (0.7 - k * 0.15)}vh`,
                        width: `${(last ? 6.5 : 5) * (0.7 - k * 0.15)}vh`,
                        background: color,
                        opacity: 0.3 - k * 0.09,
                      }}
                    />
                  );
                })}
                <span
                  className={cn(
                    'absolute z-20 flex -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full font-black ring-2 ring-white/50',
                    last
                      ? 'h-[6.5vh] w-[6.5vh] text-[2.8vh] ring-4'
                      : 'h-[5vh] w-[5vh] text-[2.2vh]',
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
              </Fragment>
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
                  className="flex items-center justify-center rounded-md border border-white/10 border-b-2 bg-white/[0.03]"
                >
                  <span className="h-[0.7vh] w-[0.7vh] rounded-full bg-white/20" />
                </span>
              );
            }
            const color = colorOf(p.slot);
            const first = p.pickNo === 1;
            // Impact: a slot flares and settles over the third of a second after
            // the puck arrives, so a landing registers as a hit.
            const sinceHit = elapsed - p.landAt;
            const impact = sinceHit < IMPACT_MS ? 1 - sinceHit / IMPACT_MS : 0;
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
                  boxShadow: `0 0 ${2.5 + impact * 4}vh ${color}${impact > 0 ? 'ee' : '88'}`,
                  transform: `translateY(${impact * 0.7}vh) scaleY(${1 - impact * 0.12})`,
                  filter: impact > 0 ? `brightness(${1 + impact * 0.9})` : undefined,
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
      {elapsed >= finaleAt && (
        <Confetti count={180} colors={[colorOf(draft.order[0] ?? 0), '#f8fafc']} />
      )}
    </div>
  );
}
