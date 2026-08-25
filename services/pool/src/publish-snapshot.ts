/**
 * CLI: fetch the live Sleeper pool → build a ranking-stripped snapshot → upload it
 * to the S3 pool bucket as `<prefix><snapshotId>.json`, then repoint
 * `<prefix>latest.json` at it.
 *
 * This is the step that used to be missing: refreshing the pool is now one command
 * and needs no code change or redeploy (DESIGN AD-5).
 *
 * **Dated objects are immutable.** The web client caches a pool in IndexedDB keyed
 * by snapshot id, so rewriting an id already in the wild would never reach clients
 * that hold it — and would mutate the pool under an in-flight draft. The upload
 * refuses to overwrite an existing object unless `--force` is passed. `latest.json`
 * is the only mutable object, and it is a tiny pointer served `must-revalidate`.
 *
 * Run: POOL_BUCKET=<bucket> pnpm --filter @opendraft/pool publish:snapshot
 *   --id <snapshotId>   override the YYYY-MM-DD default
 *   --dry-run           build and report, upload nothing
 *   --force             allow overwriting an existing dated object
 *   --no-latest         upload the dated object without repointing latest.json
 */
import {
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
  type S3ServiceException,
} from '@aws-sdk/client-s3';
import { countByPosition, fetchAndBuildSnapshot, todayId } from './snapshot-job.js';

/** One year, the max age a CDN should hold an object that can never change. */
const IMMUTABLE_CACHE = 'public, max-age=31536000, immutable';
/** The pointer must be re-read on every draft creation, so it may not be cached. */
const POINTER_CACHE = 'public, max-age=0, must-revalidate';

function flag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

function option(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required (see infra/README.md §5)`);
  return value;
}

async function exists(s3: S3Client, Bucket: string, Key: string): Promise<boolean> {
  try {
    await s3.send(new HeadObjectCommand({ Bucket, Key }));
    return true;
  } catch (err) {
    // A missing object is the expected path, not an error worth surfacing.
    if ((err as S3ServiceException).$metadata?.httpStatusCode === 404) return false;
    throw err;
  }
}

async function main(): Promise<void> {
  const dryRun = flag('dry-run');
  const snapshotId = option('id')?.trim() || todayId();
  const bucket = dryRun ? (process.env.POOL_BUCKET ?? '(dry-run)') : required('POOL_BUCKET');
  const prefix = process.env.POOL_PREFIX ?? 'pools/';
  const key = `${prefix}${snapshotId}.json`;
  const latestKey = `${prefix}latest.json`;

  console.log('Fetching Sleeper pool…');
  const { snapshot, rawCount } = await fetchAndBuildSnapshot(snapshotId);
  const body = `${JSON.stringify(snapshot)}\n`;

  console.log(`Sleeper players: ${rawCount}`);
  console.log(`Snapshot ${snapshot.snapshotId}: ${snapshot.players.length} players`);
  console.log(`By position: ${JSON.stringify(countByPosition(snapshot))}`);

  if (!snapshot.players.length) {
    throw new Error('Refusing to publish an empty pool — check the Sleeper response.');
  }

  if (dryRun) {
    console.log(`\nDry run — would upload ${body.length} bytes to s3://${bucket}/${key}`);
    if (!flag('no-latest')) console.log(`Dry run — would repoint s3://${bucket}/${latestKey}`);
    return;
  }

  const s3 = new S3Client({});

  if (!flag('force') && (await exists(s3, bucket, key))) {
    throw new Error(
      `s3://${bucket}/${key} already exists. Dated snapshots are immutable — publish under a new --id, or pass --force if you are certain no client has loaded it.`,
    );
  }

  await s3.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: body,
      ContentType: 'application/json',
      CacheControl: IMMUTABLE_CACHE,
    }),
  );
  console.log(`\nUploaded s3://${bucket}/${key}`);

  if (flag('no-latest')) {
    console.log(`Left ${latestKey} untouched (--no-latest).`);
    return;
  }

  await s3.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: latestKey,
      Body: `${JSON.stringify({ snapshotId: snapshot.snapshotId })}\n`,
      ContentType: 'application/json',
      CacheControl: POINTER_CACHE,
    }),
  );
  console.log(`Repointed s3://${bucket}/${latestKey} → ${snapshot.snapshotId}`);
  console.log('\nNew drafts will pick this up automatically. No redeploy needed.');
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
