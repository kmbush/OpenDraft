import { describe, expect, it } from 'vitest';
import { routeFor } from './route.js';

describe('routeFor', () => {
  it('lands the base URL on admin — the thing people paste and bookmark', () => {
    expect(routeFor('/')).toBe('admin');
    expect(routeFor('/admin')).toBe('admin');
    expect(routeFor('/admin/')).toBe('admin');
  });

  it('routes the standalone screens', () => {
    expect(routeFor('/board')).toBe('board');
    expect(routeFor('/station')).toBe('station');
    expect(routeFor('/export')).toBe('export');
  });

  it('separates the new-draft form from the hub', () => {
    expect(routeFor('/admin/new')).toBe('admin-new');
  });

  it('does not mistake a deeper admin path for the new-draft form', () => {
    // The prefix trap: `/admin/newsletter` must not open the new-draft form.
    expect(routeFor('/admin/newsletter')).toBe('admin');
    expect(routeFor('/admin/new/extra')).toBe('admin');
  });

  it('falls back to admin for anything unrecognised, never a dead end', () => {
    expect(routeFor('/nope')).toBe('admin');
    expect(routeFor('')).toBe('admin');
  });
});
