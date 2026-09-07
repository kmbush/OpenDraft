/**
 * App bootstrap: resolve the current draft + connection role from the
 * URL/localStorage, open the WS connection, and mount. The league theme is
 * applied in <App/> once the league metadata loads (AD-10).
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.js';
import './index.css';
import { connect } from './net.js';
import { useLiveStore } from './store/store.js';

/** Mirrors `currentRoute` in App.tsx — bare `/` is admin, station owns `/station`. */
function roleForPath(): 'station' | 'board' | 'admin' {
  // /export is a read-only recap board — connect as a passive board viewer.
  if (location.pathname.startsWith('/board') || location.pathname.startsWith('/export'))
    return 'board';
  if (location.pathname.startsWith('/station')) return 'station';
  return 'admin';
}

const role = roleForPath();
const fromUrl = new URLSearchParams(location.search).get('draft') ?? undefined;

/**
 * Admin lands on the hub, and only an explicit `?draft=` opens a draft.
 *
 * The saved id is a convenience for the screens with no other way to find a
 * draft — a board or station handed a bare URL. For the console it was a trap:
 * it reopened whatever you last touched before you could choose, which is the
 * opposite of what a hub is for. Opening one from the hub puts `?draft=` in the
 * URL, so a refresh still lands you back inside it.
 */
const draftId =
  role === 'admin' ? fromUrl : (fromUrl ?? localStorage.getItem('opendraft.draftId') ?? undefined);

if (draftId) {
  useLiveStore.getState().setDraftId(draftId);
  connect(draftId, role);
}

const queryClient = new QueryClient();
const container = document.getElementById('root');
if (container) {
  createRoot(container).render(
    <StrictMode>
      <QueryClientProvider client={queryClient}>
        <App />
      </QueryClientProvider>
    </StrictMode>,
  );
}
