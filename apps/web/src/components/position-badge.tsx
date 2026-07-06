/**
 * The one position color-coded badge, shared by every surface (board, station,
 * admin, export). A category cue only — NEVER a ranking/value signal (CONVENTIONS
 * §5). `tint` tunes the fill/ring/weight so it reads on the dark board vs the
 * light picking surfaces; `className` carries sizing + rounding per call site.
 */
import type { Position } from '@opendraft/shared';
import { cn } from '../lib/cn.js';
import { POSITION_COLOR } from '../lib/positions.js';

type BadgeTint = 'dark' | 'light' | 'print';

/** Per-surface fill opacity, ring width/opacity, and font weight (hex-suffix tints). */
const TINTS: Record<
  BadgeTint,
  { fill: string; ringWidth: string; ringAlpha: string; weight: string }
> = {
  dark: { fill: '22', ringWidth: '1.5px', ringAlpha: '66', weight: 'font-black' },
  light: { fill: '1a', ringWidth: '1px', ringAlpha: '55', weight: 'font-bold' },
  print: { fill: '1f', ringWidth: '1px', ringAlpha: '66', weight: 'font-black' },
};

export function PositionBadge({
  position,
  tint = 'light',
  className,
}: {
  position: Position;
  tint?: BadgeTint;
  className?: string;
}) {
  const c = POSITION_COLOR[position];
  const t = TINTS[tint];
  return (
    <span
      className={cn(
        'inline-flex items-center justify-center uppercase leading-none tracking-wide',
        t.weight,
        className,
      )}
      style={{
        color: c,
        backgroundColor: `${c}${t.fill}`,
        boxShadow: `inset 0 0 0 ${t.ringWidth} ${c}${t.ringAlpha}`,
      }}
    >
      {position}
    </span>
  );
}
