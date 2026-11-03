import { afterEach, describe, expect, it, vi } from 'vitest';
import { resetAppleKeyCache, verifyAppleIdentityToken } from './appleJwt';
import { handleSyncRequest } from './handler';
import { MemorySyncDb } from './memoryDb';
import { SESSION_TTL_MS, type Account, type IdentityResolver } from './types';

const appConfig = { devSignIn: false, mode: 'cloud' as const, appleAudience: 'com.k24corp.workbench' };
const post = (body: unknown) => new Request('https://w.example/api/v1/auth/apple', {
  method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
});

afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); resetAppleKeyCache(); });

describe('Apple sign-in without an email', () => {
  it('a new account with no email is a real 400, not a 200 with an error inside', async () => {
    const db = new MemorySyncDb();
    const identity: IdentityResolver = { resolve: async () => ({ appleSub: 'new-sub', email: undefined, displayName: 'K', provider: 'apple' }) as never };
    const res = await handleSyncRequest(post({ identityToken: 'x' }), { db, identity, config: appConfig });
    expect(res.status).toBe(400);
    const body = await res.json() as { error: string; token?: string };
    expect(body.error).toMatch(/email/);
    expect(body.token).toBeUndefined();
    expect(await db.findAccountBySub('new-sub')).toBeNull();
  });

  it('an existing account still signs in without an email', async () => {
    const db = new MemorySyncDb();
    await db.createAccount({ id: 'a1', appleSub: 'old-sub', email: 'k@example.com', username: '', displayName: 'K', provider: 'apple', createdAt: 1 });
    const identity: IdentityResolver = { resolve: async () => ({ appleSub: 'old-sub', email: undefined, displayName: 'K', provider: 'apple' }) as never };
    const res = await handleSyncRequest(post({ identityToken: 'x' }), { db, identity, config: appConfig });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ account: { id: 'a1' } });
  });
});

describe('sessions expire', () => {
  const account: Account = { id: 'a1', appleSub: 's', email: '', username: 'k', displayName: 'K', provider: 'password', createdAt: 1 };

  it('a session works for 90 days, then is refused', async () => {
    const db = new MemorySyncDb();
    await db.createAccount(account);
    const start = 1_800_000_000_000;
    await db.createSession('tok', 'a1', start);
    expect(await db.accountForSession('tok', start + SESSION_TTL_MS - 1000)).toMatchObject({ id: 'a1' });
    expect(await db.accountForSession('tok', start + SESSION_TTL_MS + 1000)).toBeNull();
    expect(SESSION_TTL_MS).toBe(90 * 24 * 60 * 60 * 1000);
  });

  it('an expired session gets 401 from the API', async () => {
    const db = new MemorySyncDb();
    await db.createAccount(account);
    await db.createSession('old', 'a1', Date.now() - SESSION_TTL_MS - 1000);
    await db.createSession('new', 'a1', Date.now());
    const identity: IdentityResolver = { resolve: async () => ({ error: 'unused', status: 400 }) };
    const get = (token: string) => handleSyncRequest(new Request('https://w.example/api/v1/projects', { headers: { authorization: `Bearer ${token}` } }), { db, identity, config: appConfig });
    expect((await get('old')).status).toBe(401);
    expect((await get('new')).status).toBe(200);
  });
});

describe('Apple key rotation', () => {
  const b64url = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
  const b64urlJson = (value: unknown) => b64url(new TextEncoder().encode(JSON.stringify(value)));
  const keyPair = crypto.subtle.generateKey(
    { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
    true, ['sign', 'verify'],
  ) as Promise<CryptoKeyPair>;

  async function token(kid: string) {
    const { privateKey } = await keyPair;
    const header = b64urlJson({ alg: 'RS256', kid });
    const payload = b64urlJson({ iss: 'https://appleid.apple.com', aud: 'com.k24corp.workbench', sub: 'sub-1', exp: Math.floor(Date.now() / 1000) + 600 });
    const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', privateKey, new TextEncoder().encode(`${header}.${payload}`));
    return `${header}.${payload}.${b64url(new Uint8Array(sig))}`;
  }
  async function keySet(kid: string) {
    const jwk = await crypto.subtle.exportKey('jwk', (await keyPair).publicKey);
    return { keys: [{ kid, kty: jwk.kty, n: jwk.n, e: jwk.e, alg: 'RS256', use: 'sig' }] };
  }

  it('an unknown key id refetches Apple’s keys (once a minute at most)', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(1_800_000_000_000);
    let served = await keySet('old-kid');
    const fetchMock = vi.fn(async () => Response.json(served));
    vi.stubGlobal('fetch', fetchMock);

    expect(await verifyAppleIdentityToken(await token('old-kid'), 'com.k24corp.workbench')).toMatchObject({ sub: 'sub-1' });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // Apple rotates: the cached set (still within its hour) doesn't have the new key.
    vi.setSystemTime(1_800_000_000_000 + 5 * 60 * 1000);
    served = await keySet('new-kid');
    expect(await verifyAppleIdentityToken(await token('new-kid'), 'com.k24corp.workbench')).toMatchObject({ sub: 'sub-1' });
    expect(fetchMock).toHaveBeenCalledTimes(2);

    // A bogus key id right after doesn't hammer Apple.
    await expect(verifyAppleIdentityToken(await token('bogus'), 'com.k24corp.workbench')).rejects.toThrow(/not found/);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
