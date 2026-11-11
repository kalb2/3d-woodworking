import { afterEach, describe, expect, it, vi } from 'vitest';
import { resetAppleKeyCache } from './appleJwt';
import { handleSyncRequest, SYNC_PAYLOAD_MAX_CHARS } from './handler';
import { createIdentityResolver } from './identity';
import { MemorySyncDb } from './memoryDb';
import {
  APPLE_MAX_FAILURES_PER_IP,
  AUTH_WINDOW_MS,
  LOGIN_MAX_FAILURES_PER_IP,
  LOGIN_MAX_FAILURES_PER_USERNAME,
  MemoryAuthAttemptStore,
  RATE_LIMIT_ERROR,
  SIGNUP_MAX_ATTEMPTS_PER_IP,
} from './rateLimit';
import { acceptedAppleAudiences, type IdentityResolver } from './types';

const config = { devSignIn: false, mode: 'cloud' as const, appleAudience: 'com.k24corp.workbench' };
const unused: IdentityResolver = { resolve: async () => ({ error: 'unused', status: 400 }) };

function opts(db: MemorySyncDb, extra: { rateLimit?: MemoryAuthAttemptStore; now?: () => number; identity?: IdentityResolver } = {}) {
  return {
    db,
    identity: extra.identity ?? unused,
    config,
    rateLimit: extra.rateLimit ?? new MemoryAuthAttemptStore(),
    now: extra.now,
  };
}

function jsonRequest(path: string, body: unknown, extra: { ip?: string; method?: string; token?: string } = {}) {
  const headers = new Headers({ 'content-type': 'application/json' });
  if (extra.ip) headers.set('cf-connecting-ip', extra.ip);
  if (extra.token) headers.set('authorization', `Bearer ${extra.token}`);
  return new Request(`https://w.example/api/v1${path}`, {
    method: extra.method ?? 'POST',
    headers,
    body: extra.method === 'GET' ? undefined : JSON.stringify(body),
  });
}

async function signup(db: MemorySyncDb, username: string, password = 'correcthorse', ip = '203.0.113.1', rateLimit?: MemoryAuthAttemptStore) {
  return handleSyncRequest(jsonRequest('/auth/signup', { username, password }, { ip }), opts(db, { rateLimit }));
}

afterEach(() => { vi.unstubAllGlobals(); resetAppleKeyCache(); });

describe('username auth', () => {
  it('signs up and logs in with the same password', async () => {
    const db = new MemorySyncDb();
    const created = await signup(db, 'kaleb');
    expect(created.status).toBe(200);
    const session = await created.json() as { token: string; account: { username: string; provider: string } };
    expect(session.token).toMatch(/^[0-9a-f-]{36}$/i);
    expect(session.account).toMatchObject({ username: 'kaleb', provider: 'password' });

    const ok = await handleSyncRequest(jsonRequest('/auth/login', { username: 'Kaleb', password: 'correcthorse' }, { ip: '203.0.113.2' }), opts(db));
    expect(ok.status).toBe(200);
    expect(await ok.json()).toMatchObject({ account: { username: 'kaleb' } });

    const bad = await handleSyncRequest(jsonRequest('/auth/login', { username: 'kaleb', password: 'wronghorse' }, { ip: '203.0.113.2' }), opts(db));
    expect(bad.status).toBe(401);
    expect(await bad.json()).toEqual({ error: 'Username or password is wrong.' });

    const missing = await handleSyncRequest(jsonRequest('/auth/login', { username: 'nobody', password: 'correcthorse' }, { ip: '203.0.113.2' }), opts(db));
    expect(missing.status).toBe(401);
    expect(await missing.json()).toEqual({ error: 'Username or password is wrong.' });
  });

  it('a garbage or missing bearer token is 401', async () => {
    const db = new MemorySyncDb();
    const created = await signup(db, 'tokenuser');
    const { token } = await created.json() as { token: string };
    const get = (header?: string) => handleSyncRequest(new Request('https://w.example/api/v1/me', {
      headers: header ? { authorization: header } : {},
    }), opts(db));
    expect((await get()).status).toBe(401);
    expect((await get('Bearer')).status).toBe(401);
    expect((await get('Bearer not-a-real-token')).status).toBe(401);
    expect((await get('Bearer !!!garbage!!!')).status).toBe(401);
    expect(await (await get('Bearer !!!garbage!!!')).json()).toEqual({ error: 'Session expired.' });
    expect((await get(`Bearer ${token}`)).status).toBe(200);
  });
});

describe('login rate limits', () => {
  it('allows failures under the cap, locks at the cap, then unlocks after the window', async () => {
    const db = new MemorySyncDb();
    const rateLimit = new MemoryAuthAttemptStore();
    let now = 1_800_000_000_000;
    await signup(db, 'alice', 'correcthorse', '198.51.100.1', rateLimit);

    const login = (password: string, ip = '198.51.100.9') => handleSyncRequest(
      jsonRequest('/auth/login', { username: 'alice', password }, { ip }),
      opts(db, { rateLimit, now: () => now }),
    );

    for (let i = 0; i < LOGIN_MAX_FAILURES_PER_USERNAME; i += 1) {
      now += 1000;
      const res = await login('wronghorse');
      expect(res.status).toBe(401);
    }
    now += 1000;
    const locked = await login('wronghorse');
    expect(locked.status).toBe(429);
    expect(locked.headers.get('retry-after')).toMatch(/^[1-9][0-9]*$/);
    expect(await locked.json()).toEqual({ error: RATE_LIMIT_ERROR });

    const evenGood = await login('correcthorse');
    expect(evenGood.status).toBe(429);

    now += AUTH_WINDOW_MS + 1;
    const after = await login('wronghorse');
    expect(after.status).toBe(401);
    const ok = await login('correcthorse');
    expect(ok.status).toBe(200);
  });

  it('locks one username without blocking another, until the IP cap hits', async () => {
    const db = new MemorySyncDb();
    const rateLimit = new MemoryAuthAttemptStore();
    let now = 1_810_000_000_000;
    await signup(db, 'alice', 'correcthorse', '203.0.113.20', rateLimit);
    await signup(db, 'bob', 'correcthorse', '203.0.113.21', rateLimit);
    const login = (username: string, ip: string) => handleSyncRequest(
      jsonRequest('/auth/login', { username, password: 'wronghorse' }, { ip }),
      opts(db, { rateLimit, now: () => now }),
    );

    const sharedIp = '203.0.113.50';
    for (let i = 0; i < LOGIN_MAX_FAILURES_PER_USERNAME; i += 1) {
      now += 1;
      expect((await login('alice', sharedIp)).status).toBe(401);
    }
    now += 1;
    expect((await login('alice', sharedIp)).status).toBe(429);
    expect((await login('alice', '203.0.113.51')).status).toBe(429);
    expect((await login('bob', sharedIp)).status).toBe(401);

    // Fill the shared IP with other usernames so Bob's own cap is not what trips first.
    const extra = LOGIN_MAX_FAILURES_PER_IP - LOGIN_MAX_FAILURES_PER_USERNAME - 1;
    for (let i = 0; i < extra; i += 1) {
      now += 1;
      expect((await login(`guest${i}`, sharedIp)).status).toBe(401);
    }
    now += 1;
    expect((await login('carol', sharedIp)).status).toBe(429);
    expect((await login('bob', sharedIp)).status).toBe(429);
    expect((await login('bob', '203.0.113.77')).status).toBe(401);
  });

  it('a successful login clears the username failures', async () => {
    const db = new MemorySyncDb();
    const rateLimit = new MemoryAuthAttemptStore();
    let now = 1_820_000_000_000;
    await signup(db, 'retry', 'correcthorse', '203.0.113.30', rateLimit);
    const login = (password: string) => handleSyncRequest(
      jsonRequest('/auth/login', { username: 'retry', password }, { ip: '203.0.113.31' }),
      opts(db, { rateLimit, now: () => now }),
    );
    for (let i = 0; i < 3; i += 1) {
      now += 1;
      expect((await login('wronghorse')).status).toBe(401);
    }
    now += 1;
    expect((await login('correcthorse')).status).toBe(200);
    for (let i = 0; i < LOGIN_MAX_FAILURES_PER_USERNAME; i += 1) {
      now += 1;
      expect((await login('wronghorse')).status).toBe(401);
    }
    now += 1;
    expect((await login('wronghorse')).status).toBe(429);
  });
});

describe('signup and Apple rate limits', () => {
  it('caps signups per IP and leaves another IP alone', async () => {
    const db = new MemorySyncDb();
    const rateLimit = new MemoryAuthAttemptStore();
    let now = 1_830_000_000_000;
    const attempt = (username: string, ip: string) => handleSyncRequest(
      jsonRequest('/auth/signup', { username, password: 'correcthorse' }, { ip }),
      opts(db, { rateLimit, now: () => now }),
    );
    expect((await attempt('firstuser', '198.51.100.8')).status).toBe(200);
    for (let i = 1; i < SIGNUP_MAX_ATTEMPTS_PER_IP; i += 1) {
      now += 1;
      expect((await attempt('firstuser', '198.51.100.8')).status).toBe(409);
    }
    now += 1;
    const blocked = await attempt('newname', '198.51.100.8');
    expect(blocked.status).toBe(429);
    expect(await blocked.json()).toEqual({ error: RATE_LIMIT_ERROR });
    now += 1;
    expect((await attempt('othernet', '198.51.100.9')).status).toBe(200);
  });

  it('caps failed Apple token checks per IP', async () => {
    const db = new MemorySyncDb();
    const rateLimit = new MemoryAuthAttemptStore();
    let now = 1_840_000_000_000;
    const identity: IdentityResolver = { resolve: async () => ({ error: 'Apple identity token was rejected.', status: 401 }) };
    const post = (ip: string) => handleSyncRequest(
      jsonRequest('/auth/apple', { identityToken: 'nope' }, { ip }),
      opts(db, { rateLimit, now: () => now, identity }),
    );
    for (let i = 0; i < APPLE_MAX_FAILURES_PER_IP; i += 1) {
      now += 1;
      expect((await post('203.0.113.80')).status).toBe(401);
    }
    now += 1;
    expect((await post('203.0.113.80')).status).toBe(429);
    expect((await post('203.0.113.81')).status).toBe(401);
  });
});

describe('Apple audience through the handler', () => {
  const b64url = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
  const b64urlJson = (value: unknown) => b64url(new TextEncoder().encode(JSON.stringify(value)));
  const keyPair = crypto.subtle.generateKey(
    { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
    true, ['sign', 'verify'],
  ) as Promise<CryptoKeyPair>;

  async function appleToken(aud: string) {
    const { privateKey } = await keyPair;
    const header = b64urlJson({ alg: 'RS256', kid: 'handler-kid' });
    const payload = b64urlJson({ iss: 'https://appleid.apple.com', aud, sub: 'handler-sub', exp: Math.floor(Date.now() / 1000) + 600, email: 'k@example.com' });
    const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', privateKey, new TextEncoder().encode(`${header}.${payload}`));
    return `${header}.${payload}.${b64url(new Uint8Array(sig))}`;
  }

  async function stubKeys() {
    const jwk = await crypto.subtle.exportKey('jwk', (await keyPair).publicKey);
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ keys: [{ kid: 'handler-kid', kty: jwk.kty, n: jwk.n, e: jwk.e, alg: 'RS256', use: 'sig' }] })));
  }

  it('accepts the current and pre-rename bundle ids and rejects any other audience', async () => {
    await stubKeys();
    const db = new MemorySyncDb();
    const identity = createIdentityResolver({ allowDev: false, appleAudience: acceptedAppleAudiences() });
    const post = async (aud: string) => handleSyncRequest(
      jsonRequest('/auth/apple', { identityToken: await appleToken(aud) }, { ip: '203.0.113.90' }),
      opts(db, { identity }),
    );
    expect((await post('com.k24corp.workbench')).status).toBe(200);
    expect((await post('com.antigravity.furniture3d')).status).toBe(200);
    const other = await post('com.example.other');
    expect(other.status).toBe(401);
  });
});

describe('sync payload size', () => {
  it('accepts a body at the limit and refuses one character over', async () => {
    const db = new MemorySyncDb();
    const created = await signup(db, 'syncer');
    const { token } = await created.json() as { token: string };
    const record = { id: 'p1', updatedAt: 1, project: { id: 'p1', name: 'Desk', objects: [] } };
    const valid = JSON.stringify({ records: [record] });
    expect(valid.length).toBeLessThan(SYNC_PAYLOAD_MAX_CHARS);

    const put = (raw: string) => handleSyncRequest(new Request('https://w.example/api/v1/projects', {
      method: 'PUT',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: raw,
    }), opts(db));

    expect((await put(valid)).status).toBe(200);

    const atLimit = 'x'.repeat(SYNC_PAYLOAD_MAX_CHARS);
    expect(atLimit.length).toBe(SYNC_PAYLOAD_MAX_CHARS);
    const at = await put(atLimit);
    expect(at.status).toBe(400);
    expect(await at.json()).toEqual({ error: 'Expected JSON.' });

    const over = await put('x'.repeat(SYNC_PAYLOAD_MAX_CHARS + 1));
    expect(over.status).toBe(413);
    expect(await over.json()).toEqual({ error: 'Sync payload is too large.' });
  });
});
