import { describe, expect, it } from 'vitest';
import { batchRecords, PRODUCTION_SYNC_URL, resolveSyncBaseUrl, SYNC_BATCH_LIMIT } from './client';
import { changedRecords, knownVersions } from './merge';
import type { SyncRecord } from './types';

const record = (id: string, size: number, updatedAt = 1): SyncRecord => ({
  id, updatedAt, project: { id, name: 'x'.repeat(size) } as never,
});

describe('sync server URL', () => {
  it('uses the configured URL, else the live Worker in production builds, else the dev server', () => {
    expect(PRODUCTION_SYNC_URL).toBe('https://workbench-sync.k24corp.workers.dev');
    expect(resolveSyncBaseUrl({ VITE_SYNC_API_URL: 'https://example.com/', PROD: true })).toBe('https://example.com');
    expect(resolveSyncBaseUrl({ VITE_SYNC_API_URL: '  ', PROD: true })).toBe(PRODUCTION_SYNC_URL);
    expect(resolveSyncBaseUrl({ PROD: true })).toBe(PRODUCTION_SYNC_URL);
    expect(resolveSyncBaseUrl({ PROD: false })).toBe('');
  });
});

describe('batching uploads under the Worker’s 2 MB limit', () => {
  it('splits records into bodies under the limit, keeping every record once', () => {
    const records = Array.from({ length: 10 }, (_, i) => record(`p${i}`, 300));
    const { batches, tooLarge } = batchRecords(records, 1000);
    expect(tooLarge).toEqual([]);
    expect(batches.length).toBeGreaterThan(1);
    for (const batch of batches) expect(JSON.stringify({ records: batch }).length).toBeLessThanOrEqual(1000);
    expect(batches.flat().map((r) => r.id)).toEqual(records.map((r) => r.id));
  });

  it('a record too big on its own is reported, not sent', () => {
    const { batches, tooLarge } = batchRecords([record('small', 10), record('huge', 5000)], 1000);
    expect(batches).toEqual([[expect.objectContaining({ id: 'small' })]]);
    expect(tooLarge.map((r) => r.id)).toEqual(['huge']);
  });

  it('the default limit is safely under the server’s 2,000,000', () => {
    expect(SYNC_BATCH_LIMIT).toBeLessThan(2_000_000);
    const { batches } = batchRecords(Array.from({ length: 5 }, (_, i) => record(`p${i}`, 600_000)));
    expect(batches.length).toBeGreaterThanOrEqual(3);
    for (const batch of batches) expect(JSON.stringify({ records: batch }).length).toBeLessThan(2_000_000);
  });
});

describe('only changed projects upload', () => {
  it('compares against what the server held after the last sync', () => {
    const server = [record('a', 1, 10), record('b', 1, 20)];
    const local = [record('a', 1, 10), record('b', 1, 25), record('c', 1, 5)];
    expect(changedRecords(local, knownVersions(server)).map((r) => r.id)).toEqual(['b', 'c']);
    expect(changedRecords(local, null)).toHaveLength(3);
  });

  it('a restore in the same millisecond as the delete still uploads', () => {
    const tombstone: SyncRecord = { id: 'a', updatedAt: 50, deletedAt: 50 };
    expect(changedRecords([record('a', 1, 50)], knownVersions([tombstone])).map((r) => r.id)).toEqual(['a']);
    expect(changedRecords([tombstone], knownVersions([tombstone]))).toEqual([]);
  });
});
