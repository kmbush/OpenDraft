/**
 * Team identity: the per-team color cue used across all three screens. Amber
 * stays the app/brand accent; a team's color is applied only when that specific
 * team is the subject (the on-clock hero, a roster header, a recent-pick dot).
 * It is deliberately a *different* cue from POSITION_COLOR — team color rides on
 * dots / borders / hero fills, position color stays on the player badge — so the
 * two never compete. Nothing here is a ranking/value signal (CONVENTIONS §5).
 */
import type { Team } from '@opendraft/shared';

/** Neutral fallback for a team with no color set (matches the API default). */
export const NEUTRAL_TEAM_COLOR = '#64748b';

/**
 * 16 distinct, TV-friendly hues stepping around the wheel — saturated enough to
 * read on the dark board yet legible on the light station/admin. Teams auto-get
 * a distinct color by slot; the admin can override per team.
 */
export const TEAM_COLORS: readonly string[] = [
  '#e11d48', // rose
  '#f97316', // orange
  '#f59e0b', // amber
  '#eab308', // yellow
  '#84cc16', // lime
  '#22c55e', // green
  '#10b981', // emerald
  '#14b8a6', // teal
  '#06b6d4', // cyan
  '#0ea5e9', // sky
  '#3b82f6', // blue
  '#6366f1', // indigo
  '#8b5cf6', // violet
  '#a855f7', // purple
  '#d946ef', // fuchsia
  '#ec4899', // pink
];

/** The distinct default color for a 1-based team slot. */
export const teamColorForSlot = (slot: number): string =>
  TEAM_COLORS[(slot - 1) % TEAM_COLORS.length] ?? NEUTRAL_TEAM_COLOR;

/** A team's color, falling back to neutral when unset. */
export const teamColor = (team?: Pick<Team, 'color'>): string => team?.color ?? NEUTRAL_TEAM_COLOR;

/**
 * A legible foreground (near-black or white) for text laid over `hex`, chosen by
 * perceived luminance — so a hero filled with any team color stays readable.
 */
export function readableOn(hex: string): string {
  const n = Number.parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 0xff;
  const g = (n >> 8) & 0xff;
  const b = n & 0xff;
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.6 ? '#0b1220' : '#ffffff';
}
