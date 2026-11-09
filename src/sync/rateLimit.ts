import type { D1Like } from './d1Db.ts';

/** Sliding window shared by login, signup, and Apple sign-in. */
export const AUTH_WINDOW_MS = 15 * 60 * 1000;
/** Failed username/password logins for one username inside the window. */
export const LOGIN_MAX_FAILURES_PER_USERNAME = 8;
/** Failed username/password logins from one IP inside the window. */
export const LOGIN_MAX_FAILURES_PER_IP = 30;
/** Signup attempts (success or taken) from one IP inside the window. */
export const SIGNUP_MAX_ATTEMPTS_PER_IP = 10;
/** Failed Sign in with Apple token checks from one IP inside the window. */
export const APPLE_MAX_FAILURES_PER_IP = 20;

export const RATE_LIMIT_ERROR = 'Too many attempts. Try again later.';

export interface AuthAttemptStore {
  countSince(bucket: string, since: number): Promise<number>;
  oldestSince(bucket: string, since: number): Promise<number | null>;
  record(bucket: string, at: number): Promise<void>;
  clear(bucket: string): Promise<void>;
}

export interface RateLimitDecision {
  limited: boolean;
  retryAfterSec: number;
}

/** Prefer Cloudflare's connecting IP; fall back to the first X-Forwarded-For hop. */
export function clientIp(request: Request): string {
  const cf = request.headers.get('cf-connecting-ip')?.trim();
  if (cf) return cf;
  const first = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  if (first) return first;
  return 'unknown';
}

export function loginUserBucket(username: string): string {
  return `login:user:${username}`;
}

export function loginIpBucket(ip: string): string {
  return `login:ip:${ip}`;
}

export function signupIpBucket(ip: string): string {
  return `signup:ip:${ip}`;
}

export function appleIpBucket(ip: string): string {
  return `apple:ip:${ip}`;
}

export async function checkLimit(
  store: AuthAttemptStore,
  bucket: string,
  max: number,
  now = Date.now(),
  windowMs = AUTH_WINDOW_MS,
): Promise<RateLimitDecision> {
  const since = now - windowMs;
  const count = await store.countSince(bucket, since);
  if (count < max) return { limited: false, retryAfterSec: 0 };
  const oldest = await store.oldestSince(bucket, since);
  const until = (oldest ?? now) + windowMs;
  return { limited: true, retryAfterSec: Math.max(1, Math.ceil((until - now) / 1000)) };
}

export class MemoryAuthAttemptStore implements AuthAttemptStore {
  private readonly rows = new Map<string, number[]>();

  countSince(bucket: string, since: number): Promise<number> {
    return Promise.resolve((this.rows.get(bucket) ?? []).filter((time) => time > since).length);
  }

  oldestSince(bucket: string, since: number): Promise<number | null> {
    const times = (this.rows.get(bucket) ?? []).filter((time) => time > since);
    return Promise.resolve(times.length ? Math.min(...times) : null);
  }

  record(bucket: string, at: number): Promise<void> {
    const times = this.rows.get(bucket) ?? [];
    times.push(at);
    this.rows.set(bucket, times);
    return Promise.resolve();
  }

  clear(bucket: string): Promise<void> {
    this.rows.delete(bucket);
    return Promise.resolve();
  }
}

export class D1AuthAttemptStore implements AuthAttemptStore {
  private readonly db: D1Like;

  constructor(db: D1Like) {
    this.db = db;
  }

  async countSince(bucket: string, since: number): Promise<number> {
    const row = await this.db.prepare(
      'SELECT COUNT(*) AS n FROM auth_attempts WHERE bucket = ? AND attempted_at > ?',
    ).bind(bucket, since).first<{ n: number }>();
    return Number(row?.n ?? 0);
  }

  async oldestSince(bucket: string, since: number): Promise<number | null> {
    const row = await this.db.prepare(
      'SELECT MIN(attempted_at) AS oldest FROM auth_attempts WHERE bucket = ? AND attempted_at > ?',
    ).bind(bucket, since).first<{ oldest: number | null }>();
    return row?.oldest ?? null;
  }

  async record(bucket: string, at: number): Promise<void> {
    await this.db.prepare(
      'INSERT INTO auth_attempts (bucket, attempted_at) VALUES (?, ?)',
    ).bind(bucket, at).run();
    await this.db.prepare(
      'DELETE FROM auth_attempts WHERE bucket = ? AND attempted_at <= ?',
    ).bind(bucket, at - AUTH_WINDOW_MS).run();
  }

  async clear(bucket: string): Promise<void> {
    await this.db.prepare('DELETE FROM auth_attempts WHERE bucket = ?').bind(bucket).run();
  }
}
