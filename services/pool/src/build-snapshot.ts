/**
 * CLI: fetch the live Sleeper pool → build a ranking-stripped snapshot → write it
 * to `data/bundled-snapshot.json`. That committed file is the offline fallback —
 * it backs local dev and any deploy whose S3 pool is unreachable (AD-5).
 *
 * To put a snapshot in front of a real draft, use `publish:snapshot` instead: it
 * uploads a dated, immutable object plus the `latest.json` pointer the admin reads.
 *
 * This is the impure edge (network, clock, fs) — the builder it calls stays pure.
 *
 * Run: `pnpm --filter @opendraft/pool build:snapshot`
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { countByPosition, fetchAndBuildSnapshot, todayId } from './snapshot-job.js';

async function main(): Promise<void> {
  const here = dirname(fileURLToPath(import.meta.url));
  const outPath = join(here, '..', 'data', 'bundled-snapshot.json');

  console.log('Fetching Sleeper pool…');
  const { snapshot, rawCount } = await fetchAndBuildSnapshot(todayId());

  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, `${JSON.stringify(snapshot, null, 2)}\n`);

  console.log(`Sleeper players: ${rawCount}`);
  console.log(`Snapshot ${snapshot.snapshotId}: ${snapshot.players.length} players`);
  console.log(`By position: ${JSON.stringify(countByPosition(snapshot))}`);
  console.log(`Wrote ${outPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
