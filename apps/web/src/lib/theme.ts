/**
 * Theme application via CSS custom properties (DESIGN AD-10, CONVENTIONS §4.7).
 * A single default theme ships now; per-league theming is data, set at load —
 * no rebuild, no hard-coded brand colors in components.
 */
import type { Theme } from '@opendraft/shared';

export const DEFAULT_THEME: Theme = {
  colors: { primary: '#2563eb', secondary: '#0f172a', accent: '#f59e0b' },
};

export function applyTheme(theme: Theme = DEFAULT_THEME): void {
  const root = document.documentElement;
  root.style.setProperty('--color-primary', theme.colors.primary);
  root.style.setProperty('--color-secondary', theme.colors.secondary);
  root.style.setProperty('--color-accent', theme.colors.accent);
}
