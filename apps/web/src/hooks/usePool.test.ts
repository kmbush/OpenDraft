import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchLatestSnapshotId, readSnapshotId } from './usePool.js';

/** Stub `fetch` with one JSON-ish response. */
function stubFetch(body: unknown, { ok = true, type = 'application/json' } = {}) {
  const res = {
    ok,
    headers: { get: (h: string) => (h === 'content-type' ? type : null) },
    json: async () => body,
  };
  return vi.spyOn(globalThis, 'fetch').mockResolvedValue(res as unknown as Response);
}

afterEach(() => vi.restoreAllMocks());

describe('readSnapshotId', () => {
  it('reads the publisher pointer shape', () => {
    expect(readSnapshotId({ snapshotId: '2026-08-25' })).toBe('2026-08-25');
  });

  it('reads a whole snapshot too — the dev harness serves the pool for every path', () => {
    expect(readSnapshotId({ snapshotId: '2026-08-25', source: 'sleeper', players: [] })).toBe(
      '2026-08-25',
    );
  });

  it('trims surrounding whitespace', () => {
    expect(readSnapshotId({ snapshotId: '  2026-08-25 ' })).toBe('2026-08-25');
  });

  it.each([
    ['null', null],
    ['a string', 'nope'],
    ['no snapshotId', { source: 'sleeper' }],
    ['a blank id', { snapshotId: '   ' }],
    ['a non-string id', { snapshotId: 20260825 }],
  ])('returns null for %s', (_label, value) => {
    expect(readSnapshotId(value)).toBeNull();
  });
});

describe('fetchLatestSnapshotId', () => {
  it('resolves the published pointer', async () => {
    stubFetch({ snapshotId: '2026-08-25' });
    await expect(fetchLatestSnapshotId()).resolves.toBe('2026-08-25');
  });

  it('never caches — a stale pointer would pin new drafts to an old pool', async () => {
    const spy = stubFetch({ snapshotId: '2026-08-25' });
    await fetchLatestSnapshotId();
    expect(spy).toHaveBeenCalledWith(expect.stringContaining('/latest.json'), {
      cache: 'no-store',
    });
  });

  it('returns null on the CloudFront SPA fallback (HTML with a 200)', async () => {
    stubFetch('<!doctype html>', { type: 'text/html' });
    await expect(fetchLatestSnapshotId()).resolves.toBeNull();
  });

  it('returns null on a non-ok response', async () => {
    stubFetch({ snapshotId: '2026-08-25' }, { ok: false });
    await expect(fetchLatestSnapshotId()).resolves.toBeNull();
  });

  it('returns null when the pointer is unreachable', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('offline'));
    await expect(fetchLatestSnapshotId()).resolves.toBeNull();
  });
});
