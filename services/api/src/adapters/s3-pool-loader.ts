/**
 * S3 `PoolLoader` adapter (DESIGN AD-5). Reads `pools/<snapshotId>.json` and
 * caches it in module memory (snapshots are immutable per id, so the cache never
 * goes stale within a warm Lambda).
 */
import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3';
import type { PoolSnapshot } from '@opendraft/shared';
import type { PoolLoader } from '../ports.js';

export class S3PoolLoader implements PoolLoader {
  private readonly cache = new Map<string, PoolSnapshot>();

  constructor(
    private readonly bucket: string,
    private readonly prefix = 'pools/',
    private readonly client: S3Client = new S3Client({}),
  ) {}

  async load(snapshotId: string): Promise<PoolSnapshot> {
    const cached = this.cache.get(snapshotId);
    if (cached) return cached;

    const res = await this.client.send(
      new GetObjectCommand({ Bucket: this.bucket, Key: `${this.prefix}${snapshotId}.json` }),
    );
    const body = await res.Body?.transformToString();
    if (!body) throw new Error(`Empty pool snapshot: ${snapshotId}`);
    const snapshot = JSON.parse(body) as PoolSnapshot;
    this.cache.set(snapshotId, snapshot);
    return snapshot;
  }
}
