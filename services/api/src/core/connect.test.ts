import { describe, expect, it } from 'vitest';
import { harness } from '../test-helpers.js';
import { onConnect, onDisconnect } from './connect.js';

describe('connection lifecycle', () => {
  it('registers a connection with its role and prunes it on disconnect', async () => {
    const { deps, persistence } = harness();
    await onConnect(deps, 'c3', 'admin');
    expect(persistence.connections.find((c) => c.connectionId === 'c3')).toMatchObject({
      role: 'admin',
      leagueId: 'L1',
    });

    await onDisconnect(deps, 'c3');
    expect(persistence.connections.find((c) => c.connectionId === 'c3')).toBeUndefined();
  });
});
