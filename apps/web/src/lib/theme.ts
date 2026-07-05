/**
 * Theme application via CSS custom properties (DESIGN AD-10, CONVENTIONS §4.7).
 * A league sets one brand accent; we retint the app's accent + primary tokens
 * (buttons, eyebrows, admin/station accents) from it at load — data, no rebuild.
 * Team colors and position colors are their own cues and are never touched here.
 */
import { readableOn } from './teams.js';

/** The amber brand accent used when a league sets no theme. */
export const DEFAULT_ACCENT = '#f59e0b';

/**
 * Accent choices offered in setup. A curated subset of the team palette — each
 * hue is saturated enough to read on the dark board yet legible on the light
 * station/admin, so no pick can produce an illegible accent.
 */
export const ACCENT_PALETTE: readonly string[] = [
  DEFAULT_ACCENT, // amber (brand default)
  '#e11d48', // rose
  '#f97316', // orange
  '#22c55e', // green
  '#14b8a6', // teal
  '#0ea5e9', // sky
  '#3b82f6', // blue
  '#6366f1', // indigo
  '#8b5cf6', // violet
  '#ec4899', // pink
];

const isHex = (v: string): boolean => /^#[0-9a-fA-F]{6}$/.test(v);

/**
 * The CSS-var overrides for a league accent. Pure so it can be unit-tested; an
 * empty map (unset/invalid accent) means "keep the ship defaults" (blue primary,
 * amber accent from index.css). The accent drives both the accent and primary
 * tokens so eyebrows and buttons brand together; foregrounds are chosen for
 * contrast on the accent (readableOn) so text on buttons stays legible.
 */
export function themeVars(accent?: string): Record<string, string> {
  if (!accent || !isHex(accent)) return {};
  const fg = readableOn(accent);
  return {
    '--color-accent': accent,
    '--color-accent-foreground': fg,
    '--color-primary': accent,
    '--color-primary-foreground': fg,
  };
}

/** Apply (or reset) the league accent as CSS custom properties on :root. */
export function applyTheme(accent?: string): void {
  const root = document.documentElement;
  const vars = themeVars(accent);
  for (const prop of [
    '--color-accent',
    '--color-accent-foreground',
    '--color-primary',
    '--color-primary-foreground',
  ]) {
    const value = vars[prop];
    if (value) root.style.setProperty(prop, value);
    else root.style.removeProperty(prop);
  }
}
