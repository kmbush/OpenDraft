/**
 * "Split-Flap" — the departure-board reveal.
 *
 * A whole wall of mechanical flaps clattering at once, rows locking bottom-up
 * (worst pick first) until one line is still tumbling alone: first overall.
 *
 * Every glyph is a pure function of `(row, column, elapsed)` — see `lib/splitflap`
 * — so a board that reconnects mid-show renders the exact right frame rather than
 * restarting the clatter.
 */
import { REVEAL_FINALE_MS, pickRevealAtMs } from '@opendraft/shared';
import { Plane } from 'lucide-react';
import { Confetti } from '../components/confetti.js';
import { estimatedServerNow } from '../lib/clock.js';
import { cn } from '../lib/cn.js';
import { boardRow, boardWidth, flapGlyph, flapLockAtMs } from '../lib/splitflap.js';
import { readableOn } from '../lib/teams.js';
import { RevealCountdown, type RevealGameProps } from './reveal.js';

/** One mechanical flap. */
function Flap({
  char,
  locked,
  color,
  big,
}: {
  char: string;
  locked: boolean;
  color?: string;
  big?: boolean;
}) {
  return (
    <span
      className={cn(
        'relative inline-flex items-center justify-center overflow-hidden rounded-[3px] border border-black/40 font-black tabular-nums leading-none transition-colors duration-150',
        big ? 'h-[9vh] w-[6vh] text-[5vh]' : 'h-[4.6vh] w-[3.1vh] text-[2.6vh]',
        locked ? 'text-black' : 'bg-neutral-900 text-white/80',
      )}
      style={locked && color ? { background: color, color: readableOn(color) } : undefined}
    >
      {/* The hinge line down the middle is what sells it as a flap, not a tile. */}
      <span className="pointer-events-none absolute inset-x-0 top-1/2 z-10 h-px bg-black/50" />
      {char === ' ' ? ' ' : char}
    </span>
  );
}

function FlapRow({
  label,
  name,
  cols,
  color,
  elapsed,
  lockAt,
  row,
  big,
}: {
  label: string;
  name: string;
  cols: number;
  color: string;
  elapsed: number;
  lockAt: number;
  row: number;
  big?: boolean;
}) {
  const text = boardRow(name, cols);
  return (
    <div className="flex items-center gap-3">
      <span
        className={cn(
          'w-[7ch] shrink-0 text-right font-black tabular-nums tracking-tight text-amber-400/90',
          big ? 'text-[3vh]' : 'text-[2vh]',
        )}
      >
        {label}
      </span>
      <div className="flex gap-[3px]">
        {Array.from(text).map((ch, col) => (
          <Flap
            // biome-ignore lint/suspicious/noArrayIndexKey: flaps are fixed positional slots
            key={`${row}-${col}`}
            big={big}
            color={color}
            locked={elapsed >= flapLockAtMs(lockAt, col, cols)}
            char={flapGlyph(ch, elapsed, lockAt, row, col, cols)}
          />
        ))}
      </div>
    </div>
  );
}

export function SplitFlapReveal({
  draft,
  now,
  serverOffsetMs,
  teamName,
  colorOf,
}: RevealGameProps) {
  const reveal = draft.reveal;
  if (!reveal) return null;

  const teams = draft.order.length;
  const elapsed = estimatedServerNow(now, serverOffsetMs) - reveal.revealAt;
  if (elapsed < 0) return <RevealCountdown remaining={-elapsed} />;

  const names = draft.order.map((slot) => teamName(slot));
  const cols = boardWidth(names);
  const finaleAt = pickRevealAtMs(1, teams);
  const finaleOpen = elapsed >= finaleAt;
  const outro = elapsed >= finaleAt + REVEAL_FINALE_MS;
  const locked = draft.order.filter((_, i) => elapsed >= pickRevealAtMs(i + 1, teams)).length;

  return (
    <div className="relative flex flex-1 flex-col items-center gap-[2vh] overflow-hidden px-8 py-[3vh]">
      <div className="flex items-center gap-3">
        <Plane className="h-6 w-6 text-amber-400" />
        <p className="font-black uppercase tracking-[0.35em] text-amber-400/90 md:text-2xl">
          {outro ? 'The Order Is Set' : 'Departures'}
        </p>
      </div>

      {/* The board proper — a dark machine face the flaps are set into. */}
      <div className="flex flex-col items-center gap-[1vh] rounded-2xl border border-white/10 bg-black/50 px-[3vh] py-[2vh] shadow-2xl">
        {/* #1 rides at the top, tumbling alone once every other row has stopped. */}
        <FlapRow
          big
          row={0}
          label="1ST"
          cols={cols}
          name={names[0] ?? ''}
          color={colorOf(draft.order[0] ?? 0)}
          elapsed={elapsed}
          lockAt={finaleAt}
        />
        <div className="my-[0.5vh] h-px w-full bg-white/10" />
        {draft.order.slice(1).map((slot, i) => {
          const pickNo = i + 2;
          return (
            <FlapRow
              key={slot}
              row={pickNo}
              label={`#${pickNo}`}
              cols={cols}
              name={names[i + 1] ?? ''}
              color={colorOf(slot)}
              elapsed={elapsed}
              lockAt={pickRevealAtMs(pickNo, teams)}
            />
          );
        })}
      </div>

      <p className="text-center text-sm uppercase tracking-[0.3em] text-white/40">
        {locked} of {teams} locked
      </p>
      {finaleOpen && <Confetti count={140} />}
    </div>
  );
}
