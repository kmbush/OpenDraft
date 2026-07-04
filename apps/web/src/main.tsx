/**
 * App bootstrap: apply the theme, resolve the current draft + connection role
 * from the URL/localStorage, open the WS connection, and mount.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.js';
import './index.css';
import { applyTheme } from './lib/theme.js';
import { connect } from './net.js';
import { useLiveStore } from './store/store.js';

applyTheme();

function roleForPath(): 'station' | 'board' | 'admin' {
  if (location.pathname.startsWith('/board')) return 'board';
  if (location.pathname.startsWith('/admin')) return 'admin';
  return 'station';
}

const draftId =
  new URLSearchParams(location.search).get('draft') ??
  localStorage.getItem('opendraft.draftId') ??
  undefined;

if (draftId) {
  useLiveStore.getState().setDraftId(draftId);
  connect(draftId, roleForPath());
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
