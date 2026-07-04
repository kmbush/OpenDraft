/**
 * Public surface of @opendraft/api — the transport-neutral core + ports + AWS
 * adapters. The Lambda entrypoints live in `src/handlers/*` and are referenced
 * directly by Terraform; they are NOT re-exported here because importing them
 * eagerly builds AWS-backed deps from env.
 */
export type {
  Broadcaster,
  CommitResult,
  ConnectionRecord,
  ConnectionRole,
  Deps,
  Environment,
  Persistence,
  PoolLoader,
  Scheduler,
  Secrets,
} from './ports.js';

export { dispatchAction, sendSync } from './core/dispatch.js';
export { onConnect, onDisconnect } from './core/connect.js';
export { onTimerFire, type TimerFire } from './core/autopick.js';
export { handleHttp, type HttpRequest, type HttpResponse } from './core/http.js';
export { issueSession, verifyPasscode, verifySession, type SessionClaims } from './core/auth.js';
export {
  ADMIN_EVENTS,
  type InboundEnvelope,
  makeReject,
  mapEnvelopeToEvent,
} from './core/envelope.js';

export { buildDeps } from './env.js';
export { DynamoPersistence } from './adapters/dynamo-persistence.js';
export { ApiGatewayBroadcaster } from './adapters/apigw-broadcaster.js';
export { EventBridgeScheduler } from './adapters/eventbridge-scheduler.js';
export { S3PoolLoader } from './adapters/s3-pool-loader.js';
export { SsmSecrets } from './adapters/ssm-secrets.js';
