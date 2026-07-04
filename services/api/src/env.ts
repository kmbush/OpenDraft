/**
 * Compose the concrete AWS-backed `Deps` from environment variables. This is the
 * single place env vars are read, so it doubles as the infra contract the
 * Terraform must satisfy. Handlers call this once at module load (warm reuse).
 */
import { randomUUID } from 'node:crypto';
import { ApiGatewayBroadcaster } from './adapters/apigw-broadcaster.js';
import { DynamoPersistence } from './adapters/dynamo-persistence.js';
import { EventBridgeScheduler } from './adapters/eventbridge-scheduler.js';
import { S3PoolLoader } from './adapters/s3-pool-loader.js';
import { SsmSecrets } from './adapters/ssm-secrets.js';
import type { Deps, Environment } from './ports.js';

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

function num(name: string, fallback: number): number {
  const raw = process.env[name];
  const parsed = raw ? Number(raw) : Number.NaN;
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function buildDeps(): Deps {
  const env: Environment = {
    now: () => Date.now(),
    rng: () => Math.random(),
    newId: () => randomUUID(),
    leagueId: required('LEAGUE_ID'),
    sessionTtlSec: num('SESSION_TTL_SEC', 3600),
    authMaxAttempts: num('AUTH_MAX_ATTEMPTS', 5),
    authWindowSec: num('AUTH_WINDOW_SEC', 900),
  };

  return {
    persistence: new DynamoPersistence(required('TABLE_NAME')),
    broadcaster: new ApiGatewayBroadcaster(required('WS_API_ENDPOINT')),
    scheduler: new EventBridgeScheduler({
      targetArn: required('SCHEDULER_TARGET_ARN'),
      roleArn: required('SCHEDULER_ROLE_ARN'),
      ...(process.env.SCHEDULER_GROUP_NAME ? { groupName: process.env.SCHEDULER_GROUP_NAME } : {}),
    }),
    pool: new S3PoolLoader(required('POOL_BUCKET'), process.env.POOL_PREFIX ?? 'pools/'),
    secrets: new SsmSecrets({
      passcodeHashParam: required('SSM_PASSCODE_HASH_PARAM'),
      hmacKeyParam: required('SSM_HMAC_KEY_PARAM'),
    }),
    env,
  };
}
