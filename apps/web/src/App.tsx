/**
 * Route shell (AD-7): one app, path-scoped views over one store + WS client.
 * A tiny path switch avoids a router dependency for the routes.
 *
 * Nav separation (owner's ask): Station, Board, and the /export recap board are
 * standalone pages with no cross-nav — the Board is a chrome-free TV showpiece,
 * the Station owns its own slim header, Export is a print-ready sheet. Admin is
 * the only hub: it wears the shared header and links out to the others from its
 * own in-page buttons.
 */
import { useEffect } from 'react';
import { AppHeader } from './components/app-header.js';
import { useLeague } from './hooks/useLeague.js';
import { useTimerNudge } from './hooks/useTimerNudge.js';
import { applyTheme } from './lib/theme.js';
import { AdminView } from './views/AdminView.js';
import { BoardView } from './views/BoardView.js';
import { ExportView } from './views/ExportView.js';
import { StationView } from './views/StationView.js';

type Route = 'station' | 'board' | 'admin' | 'export';

function currentRoute(): Route {
  const path = location.pathname;
  if (path.startsWith('/board')) return 'board';
  if (path.startsWith('/export')) return 'export';
  if (path.startsWith('/admin')) return 'admin';
  return 'station';
}

export function App() {
  // Retint the app accent from the league theme once its metadata loads. Runs on
  // every route (the chrome-free board needs it too), before the route branch.
  const accent = useLeague()?.theme?.colors?.accent;
  useEffect(() => applyTheme(accent), [accent]);

  // Any connected screen nudges timed transitions (AD-1); the server dedupes.
  useTimerNudge();

  const route = currentRoute();
  if (route === 'board') return <BoardView />;
  if (route === 'export') return <ExportView />;
  if (route === 'station') return <StationView />;
  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main className="mx-auto max-w-6xl px-4 py-6">
        <AdminView />
      </main>
    </div>
  );
}
