import { describe, expect, it } from 'vitest';
import type { D1Like, D1Statement } from './d1Db';
import {
  AUTH_WINDOW_MS,
  D1AuthAttemptStore,
  LOGIN_MAX_FAILURES_PER_IP,
  LOGIN_MAX_FAILURES_PER_USERNAME,
  MemoryAuthAttemptStore,
  checkLimit,
  clientIp,
  loginIpBucket,
  loginUserBucket,
} from './rateLimit';

class FakeD1 implements D1Like {
  rows: { bucket: string; attempted_at: number }[] = [];

  prepare(query: string): D1Statement {
    const sql = query.replace(/\s+/g, ' ').trim();
    const self = this;
    const stmt = {
      values: [] as unknown[],
      bind(...values: unknown[]) {
        this.values = values;
        return this;
      },
      async first<T>() {
        if (sql.includes('COUNT(*)')) {
          const [bucket, since] = this.values as [string, number];
          const n = self.rows.filter((row) => row.bucket === bucket && row.attempted_at > since).length;
          return { n } as T;
        }
        if (sql.includes('MIN(attempted_at)')) {
          const [bucket, since] = this.values as [string, number];
          const times = self.rows.filter((row) => row.bucket === bucket && row.attempted_at > since).map((row) => row.attempted_at);
          return { oldest: times.length ? Math.min(...times) : null } as T;
        }
        return null;
      },
      async all<T>() {
        return { results: [] as T[] };
      },
      async run() {
        if (sql.startsWith('INSERT INTO auth_attempts')) {
          const [bucket, attempted_at] = this.values as [string, number];
          self.rows.push({ bucket, attempted_at });
        } else if (sql.includes('attempted_at <=')) {
          const [bucket, before] = this.values as [string, number];
          self.rows = self.rows.filter((row) => !(row.bucket === bucket && row.attempted_at <= before));
        } else if (sql.startsWith('DELETE FROM auth_attempts WHERE bucket = ?')) {
          const [bucket] = this.values as [string];
          self.rows = self.rows.filter((row) => row.bucket !== bucket);
        }
        return {};
      },
    };
    return stmt;
  }
}

describe('client IP', () => {
  it('prefers CF-Connecting-IP, then the first X-Forwarded-For hop', () => {
    const cf = new Request('https://w.example/', { headers: { 'cf-connecting-ip': '203.0.113.9', 'x-forwarded-for': '10.0.0.1, 10.0.0.2' } });
    expect(clientIp(cf)).toBe('203.0.113.9');
    const xff = new Request('https://w.example/', { headers: { 'x-forwarded-for': '198.51.100.4, 10.0.0.1' } });
    expect(clientIp(xff)).toBe('198.51.100.4');
    expect(clientIp(new Request('https://w.example/'))).toBe('unknown');
  });
});

describe('sliding window', () => {
  it('is under the limit, then at the limit, then free after the window', async () => {
    const store = new MemoryAuthAttemptStore();
    const bucket = loginUserBucket('kaleb');
    const start = 1_800_000_000_000;
    for (let i = 0; i < LOGIN_MAX_FAILURES_PER_USERNAME; i += 1) {
      expect((await checkLimit(store, bucket, LOGIN_MAX_FAILURES_PER_USERNAME, start + i)).limited).toBe(false);
      await store.record(bucket, start + i);
    }
    const blocked = await checkLimit(store, bucket, LOGIN_MAX_FAILURES_PER_USERNAME, start + 100);
    expect(blocked.limited).toBe(true);
    expect(blocked.retryAfterSec).toBeGreaterThan(0);
    expect(blocked.retryAfterSec).toBeLessThanOrEqual(Math.ceil(AUTH_WINDOW_MS / 1000));

    const still = await checkLimit(store, bucket, LOGIN_MAX_FAILURES_PER_USERNAME, start + AUTH_WINDOW_MS - 1);
    expect(still.limited).toBe(true);
    // The oldest attempt expires at now === attempted_at + window.
    const open = await checkLimit(store, bucket, LOGIN_MAX_FAILURES_PER_USERNAME, start + AUTH_WINDOW_MS);
    expect(open.limited).toBe(false);
  });

  it('username and IP buckets are independent', async () => {
    const store = new MemoryAuthAttemptStore();
    const now = 1_800_000_000_000;
    await store.record(loginUserBucket('alice'), now);
    expect((await checkLimit(store, loginUserBucket('alice'), 1, now + 1)).limited).toBe(true);
    expect((await checkLimit(store, loginUserBucket('bob'), 1, now + 1)).limited).toBe(false);
    expect((await checkLimit(store, loginIpBucket('1.1.1.1'), LOGIN_MAX_FAILURES_PER_IP, now + 1)).limited).toBe(false);
  });

  it('the D1 store matches the in-memory one', async () => {
    const store = new D1AuthAttemptStore(new FakeD1());
    const bucket = loginIpBucket('203.0.113.10');
    const start = 1_700_000_000_000;
    await store.record(bucket, start);
    await store.record(bucket, start + 10);
    expect(await store.countSince(bucket, start - 1)).toBe(2);
    expect(await store.oldestSince(bucket, start - 1)).toBe(start);
    await store.record(bucket, start + AUTH_WINDOW_MS + 50);
    expect(await store.countSince(bucket, start + AUTH_WINDOW_MS + 50 - AUTH_WINDOW_MS)).toBe(1);
    await store.clear(bucket);
    expect(await store.countSince(bucket, 0)).toBe(0);
  });
});
