/**
 * CLI: fetch the live Sleeper pool → build a ranking-stripped snapshot → write it
 * to `data/bundled-snapshot.json`. That committed file is the automatic fallback
 * when a live fetch fails or the endpoint changes (AD-5).
 *
 * This is the impure edge (network, clock, fs) — the builder it calls stays pure.
 * S3 upload is deferred to the infra/api unit; for now we write to disk.
 *
 * Run: `pnpm --filter @opendraft/pool build:snapshot`
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildSnapshot } from './build.js';
import { DEFAULT_KEEP_PER_POSITION } from './config.js';
import { fetchSleeperPlayers } from './sleeper.js';

/** Local build date as a YYYY-MM-DD snapshot id (clock lives here, not the builder). */
function todayId(): string {
  return new Date().toISOString().slice(0, 10);
}

async function main(): Promise<void> {
  const here = dirname(fileURLToPath(import.meta.url));
  const outPath = join(here, '..', 'data', 'bundled-snapshot.json');

  console.log('Fetching Sleeper pool…');
  const raw = await fetchSleeperPlayers();
  const rawCount = Object.keys(raw).length;

  const snapshot = buildSnapshot(raw, {
    snapshotId: todayId(),
    keepPerPosition: DEFAULT_KEEP_PER_POSITION,
  });

  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, `${JSON.stringify(snapshot, null, 2)}\n`);

  const byPosition = snapshot.players.reduce<Record<string, number>>((acc, p) => {
    acc[p.position] = (acc[p.position] ?? 0) + 1;
    return acc;
  }, {});
  console.log(`Sleeper players: ${rawCount}`);
  console.log(`Snapshot ${snapshot.snapshotId}: ${snapshot.players.length} players`);
  console.log(`By position: ${JSON.stringify(byPosition)}`);
  console.log(`Wrote ${outPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
