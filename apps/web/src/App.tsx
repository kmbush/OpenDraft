/**
 * Route shell (AD-7): one app, path-scoped views over one store + WS client.
 * A tiny path switch avoids a router dependency for four routes.
 */
import { AdminView } from './views/AdminView.js';
import { BoardView } from './views/BoardView.js';
import { StationView } from './views/StationView.js';

function currentView() {
  const path = location.pathname;
  if (path.startsWith('/board')) return <BoardView />;
  if (path.startsWith('/admin')) return <AdminView />;
  return <StationView />;
}

export function App() {
  return (
    <div className="app">
      <nav className="nav">
        <a href="/station">Station</a>
        <a href="/board">Board</a>
        <a href="/admin">Admin</a>
      </nav>
      <main>{currentView()}</main>
    </div>
  );
}
