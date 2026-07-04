/**
 * WS lifecycle: register/prune connections. The full-snapshot `SYNC` on connect
 * lives in `dispatch.sendSync` and is sent once the client requests it (or on
 * first message) so the client can rebuild wholesale (DESIGN §5.5).
 */
import type { ConnectionRole, Deps } from '../ports.js';

/** Register a new connection with its role (default station). */
export async function onConnect(
  deps: Deps,
  connectionId: string,
  role: ConnectionRole,
): Promise<void> {
  await deps.persistence.putConnection({
    connectionId,
    leagueId: deps.env.leagueId,
    role,
    connectedAt: deps.env.now(),
  });
}

/** Prune a disconnected connection (a refresh/drop is a non-event — §5.5). */
export async function onDisconnect(deps: Deps, connectionId: string): Promise<void> {
  await deps.persistence.deleteConnection(deps.env.leagueId, connectionId);
}
