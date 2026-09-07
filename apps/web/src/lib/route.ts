/**
 * The path switch (AD-7), promoted to real navigation.
 *
 * Still no router dependency — five routes over one store do not need one — but
 * the current route is now *state* rather than a value read once at render. That
 * is what makes the browser's Back button work and lets a refresh land where you
 * were, instead of the admin console tracking its screen in a `useState` the URL
 * knows nothing about.
 */
import { useSyncExternalStore } from 'react';

export type Route = 'station' | 'board' | 'admin' | 'admin-new' | 'export';

/**
 * Bare `/` lands on **admin**, not station. A station with no draft id has nothing
 * to render and used to hang on "Connecting…" forever, so the base URL — the thing
 * people actually paste and bookmark — was a dead end. Admin is the one view that
 * works from a cold start: it authenticates, and lists every draft you have.
 */
export function routeFor(path: string): Route {
  if (path.startsWith('/board')) return 'board';
  if (path.startsWith('/export')) return 'export';
  if (path.startsWith('/station')) return 'station';
  // Exact, unlike the prefix matches above: `/admin/new` is a leaf, and a prefix
  // test would quietly swallow any `/admin/new…` route added later.
  if (path === '/admin/new' || path === '/admin/new/') return 'admin-new';
  return 'admin';
}

/** Fired on `navigate` — `popstate` only covers Back/Forward, not pushState. */
const ROUTE_EVENT = 'opendraft:route';

function subscribe(onChange: () => void): () => void {
  window.addEventListener('popstate', onChange);
  window.addEventListener(ROUTE_EVENT, onChange);
  return () => {
    window.removeEventListener('popstate', onChange);
    window.removeEventListener(ROUTE_EVENT, onChange);
  };
}

/** The current URL, as an identity that changes whenever navigation happens. */
function snapshot(): string {
  return `${location.pathname}${location.search}`;
}

/** Path only — `routeFor` must not see a query string. */
function pathOf(href: string): string {
  const q = href.indexOf('?');
  return q < 0 ? href : href.slice(0, q);
}

/**
 * Which draft the URL names, if any.
 *
 * The address bar is the source of truth for what the console has open, so that
 * Back and Forward move between drafts rather than leaving a draft on screen
 * that the URL no longer names.
 */
export function draftParamOf(href: string): string | null {
  const q = href.indexOf('?');
  return q < 0 ? null : new URLSearchParams(href.slice(q)).get('draft');
}

/** The current URL. Re-renders on Back/Forward and on `navigate`. */
export function useHref(): string {
  return useSyncExternalStore(subscribe, snapshot, () => '/');
}

export function useRoute(): Route {
  return routeFor(pathOf(useHref()));
}

/** The `?draft=` the URL currently names. */
export function useDraftParam(): string | null {
  return draftParamOf(useHref());
}

/**
 * Client-side navigation. `to` is a path with optional query — `/admin`,
 * `/admin/new`, `/admin?draft=<id>`.
 *
 * Replaces rather than pushes when the target is where we already are, so
 * repeatedly leaving a draft can't stack identical entries the operator then has
 * to press Back through.
 */
export function navigate(to: string): void {
  if (to === snapshot()) return;
  history.pushState(null, '', to);
  window.dispatchEvent(new Event(ROUTE_EVENT));
}
