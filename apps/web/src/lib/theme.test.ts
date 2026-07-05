import { describe, expect, it } from 'vitest';
import { themeVars } from './theme.js';

describe('themeVars', () => {
  it('returns no overrides for an unset or invalid accent', () => {
    expect(themeVars()).toEqual({});
    expect(themeVars('')).toEqual({});
    expect(themeVars('red')).toEqual({});
    expect(themeVars('#12')).toEqual({});
  });

  it('drives both accent and primary from the league accent', () => {
    expect(themeVars('#3b82f6')).toMatchObject({
      '--color-accent': '#3b82f6',
      '--color-primary': '#3b82f6',
    });
  });

  it('picks a contrasting foreground: white on a dark accent, near-black on a light one', () => {
    expect(themeVars('#3b82f6')['--color-primary-foreground']).toBe('#ffffff');
    expect(themeVars('#f59e0b')['--color-accent-foreground']).toBe('#0b1220');
  });
});
