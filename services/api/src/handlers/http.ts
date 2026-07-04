/**
 * HTTP API Lambda entrypoint (thin — routing/logic in core/http). Maps the
 * API Gateway v2 event to a transport-neutral `HttpRequest` and back.
 */
import type { APIGatewayProxyHandlerV2 } from 'aws-lambda';
import { type HttpRequest, handleHttp } from '../core/http.js';
import { buildDeps } from '../env.js';

const deps = buildDeps();

export const handler: APIGatewayProxyHandlerV2 = async (event) => {
  const req: HttpRequest = {
    method: event.requestContext.http.method,
    path: event.requestContext.http.path,
    headers: event.headers ?? {},
    ...(event.body !== undefined ? { body: event.body } : {}),
  };
  const res = await handleHttp(deps, req);
  return {
    statusCode: res.status,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(res.body),
  };
};
