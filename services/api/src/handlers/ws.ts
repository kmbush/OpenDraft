/**
 * WebSocket Lambda entrypoints (thin — all logic is in core/*). Routes:
 * `$connect`, `$disconnect`, and a default action route.
 */
import type {
  APIGatewayProxyResultV2,
  APIGatewayProxyWebsocketEventV2,
  APIGatewayProxyWebsocketHandlerV2,
} from 'aws-lambda';
import { onConnect, onDisconnect } from '../core/connect.js';
import { dispatchAction, sendSync } from '../core/dispatch.js';
import type { InboundEnvelope } from '../core/envelope.js';
import { buildDeps } from '../env.js';
import type { ConnectionRole } from '../ports.js';

const deps = buildDeps();
const OK: APIGatewayProxyResultV2 = { statusCode: 200, body: '' };

function connectionId(event: APIGatewayProxyWebsocketEventV2): string {
  return event.requestContext.connectionId;
}

function parseEnvelope(body: string | undefined): InboundEnvelope | null {
  if (!body) return null;
  try {
    const v: unknown = JSON.parse(body);
    if (typeof v !== 'object' || v === null) return null;
    const e = v as Record<string, unknown>;
    if (typeof e.type !== 'string' || typeof e.draftId !== 'string') return null;
    return e as unknown as InboundEnvelope;
  } catch {
    return null;
  }
}

export const connect: APIGatewayProxyWebsocketHandlerV2 = async (event) => {
  const q = (event as { queryStringParameters?: Record<string, string | undefined> })
    .queryStringParameters;
  const role = (q?.role as ConnectionRole | undefined) ?? 'station';
  await onConnect(deps, connectionId(event), role);
  return OK;
};

export const disconnect: APIGatewayProxyWebsocketHandlerV2 = async (event) => {
  await onDisconnect(deps, connectionId(event));
  return OK;
};

export const action: APIGatewayProxyWebsocketHandlerV2 = async (event) => {
  const envelope = parseEnvelope(event.body);
  if (!envelope) return { statusCode: 400, body: 'bad envelope' };
  if (envelope.type === 'SYNC') {
    await sendSync(deps, connectionId(event), envelope.draftId);
  } else {
    await dispatchAction(deps, connectionId(event), envelope);
  }
  return OK;
};
