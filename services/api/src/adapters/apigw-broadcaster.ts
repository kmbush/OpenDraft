/**
 * API Gateway Management API `Broadcaster` (DESIGN AD-1). Posts a message to one
 * WS connection and reports `GoneException` so the caller prunes the stale
 * connection.
 */
import {
  ApiGatewayManagementApiClient,
  PostToConnectionCommand,
} from '@aws-sdk/client-apigatewaymanagementapi';
import type { OutboundMessage } from '@opendraft/shared';
import type { Broadcaster } from '../ports.js';

export class ApiGatewayBroadcaster implements Broadcaster {
  private readonly client: ApiGatewayManagementApiClient;

  constructor(endpoint: string, client?: ApiGatewayManagementApiClient) {
    this.client = client ?? new ApiGatewayManagementApiClient({ endpoint });
  }

  async post(connectionId: string, message: OutboundMessage): Promise<'ok' | 'gone'> {
    try {
      await this.client.send(
        new PostToConnectionCommand({
          ConnectionId: connectionId,
          Data: new TextEncoder().encode(JSON.stringify(message)),
        }),
      );
      return 'ok';
    } catch (e) {
      if ((e as { name?: string })?.name === 'GoneException') return 'gone';
      throw e;
    }
  }
}
