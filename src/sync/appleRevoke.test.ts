import { describe, expect, it, vi } from 'vitest';
import {
  APPLE_REVOKE_URL,
  APPLE_TOKEN_URL,
  appleRevokeConfig,
  createAppleClientSecret,
  revokeAppleAuthorization,
  type AppleRevokeConfig,
} from './appleRevoke';
import { handleSyncRequest } from './handler';
import { MemorySyncDb } from './memoryDb';
import type { Account, IdentityResolver } from './types';
import { aiOptions, appleRevokeOption } from './worker';

const b64url = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
const fromB64url = (s: string) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4)), (c) => c.charCodeAt(0));
const jwtWithSub = (sub: string) => `${b64url(new TextEncoder().encode('{"alg":"none"}'))}.${b64url(new TextEncoder().encode(JSON.stringify({ sub })))}.x`;

async function testKey() {
  const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']) as CryptoKeyPair;
  const pkcs8 = new Uint8Array(await crypto.subtle.exportKey('pkcs8', pair.privateKey));
  const body = btoa(String.fromCharCode(...pkcs8)).replace(/(.{64})/g, '$1\n');
  return { pem: `-----BEGIN PRIVATE KEY-----\n${body}\n-----END PRIVATE KEY-----\n`, publicKey: pair.publicKey };
}

async function config(): Promise<{ cfg: AppleRevokeConfig; publicKey: CryptoKey }> {
  const { pem, publicKey } = await testKey();
  return { cfg: { teamId: 'TEAM123456', keyId: 'KEY1234567', privateKey: pem, clientId: 'com.antigravity.furniture3d' }, publicKey };
}

const ok = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });

describe('Apple client secret', () => {
  it('is an ES256 JWT Apple will accept, verifiable with the key', async () => {
    const { cfg, publicKey } = await config();
    const secret = await createAppleClientSecret(cfg, 1_800_000_000);
    const [h, p, sig] = secret.split('.');
    expect(JSON.parse(new TextDecoder().decode(fromB64url(h)))).toEqual({ alg: 'ES256', kid: 'KEY1234567', typ: 'JWT' });
    expect(JSON.parse(new TextDecoder().decode(fromB64url(p)))).toEqual({
      iss: 'TEAM123456', iat: 1_800_000_000, exp: 1_800_000_300, aud: 'https://appleid.apple.com', sub: 'com.antigravity.furniture3d',
    });
    const valid = await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, publicKey, fromB64url(sig), new TextEncoder().encode(`${h}.${p}`));
    expect(valid).toBe(true);
  });

  it('accepts a key pasted with literal \\n line breaks', async () => {
    const { cfg } = await config();
    const secret = await createAppleClientSecret({ ...cfg, privateKey: cfg.privateKey.replace(/\n/g, '\\n') });
    expect(secret.split('.')).toHaveLength(3);
  });

  it('config needs team, key id and key; client id defaults to the bundle id', () => {
    expect(appleRevokeConfig({}, 'com.antigravity.furniture3d')).toBeNull();
    expect(appleRevokeConfig({ APPLE_TEAM_ID: 'T', APPLE_KEY_ID: 'K' }, 'b')).toBeNull();
    expect(appleRevokeConfig({ APPLE_TEAM_ID: 'T', APPLE_KEY_ID: 'K', APPLE_PRIVATE_KEY: 'P' }, 'com.antigravity.furniture3d'))
      .toEqual({ teamId: 'T', keyId: 'K', privateKey: 'P', clientId: 'com.antigravity.furniture3d' });
    expect(appleRevokeConfig({ APPLE_TEAM_ID: 'T', APPLE_KEY_ID: 'K', APPLE_PRIVATE_KEY: 'P', APPLE_CLIENT_ID: 'other' }, 'b')?.clientId).toBe('other');
  });
});

describe('revokeAppleAuthorization', () => {
  it('exchanges the code, then revokes the refresh token', async () => {
    const { cfg } = await config();
    const fetchImpl = vi.fn(async (url: string | URL | Request) => {
      if (String(url) === APPLE_TOKEN_URL) return ok({ access_token: 'at', refresh_token: 'rt', id_token: jwtWithSub('apple-sub-1') });
      return new Response('', { status: 200 });
    });
    const result = await revokeAppleAuthorization('code-1', 'apple-sub-1', cfg, fetchImpl as unknown as typeof fetch);
    expect(result).toEqual({ revoked: true });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    const [tokenUrl, tokenInit] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(tokenUrl).toBe(APPLE_TOKEN_URL);
    const tokenBody = tokenInit.body as URLSearchParams;
    expect(tokenBody.get('grant_type')).toBe('authorization_code');
    expect(tokenBody.get('code')).toBe('code-1');
    expect(tokenBody.get('client_id')).toBe('com.antigravity.furniture3d');
    expect(tokenBody.get('client_secret')?.split('.')).toHaveLength(3);
    const [revokeUrl, revokeInit] = fetchImpl.mock.calls[1] as unknown as [string, RequestInit];
    expect(revokeUrl).toBe(APPLE_REVOKE_URL);
    const revokeBody = revokeInit.body as URLSearchParams;
    expect(revokeBody.get('token')).toBe('rt');
    expect(revokeBody.get('token_type_hint')).toBe('refresh_token');
    expect(revokeBody.get('client_id')).toBe('com.antigravity.furniture3d');
  });

  it('falls back to the access token when there is no refresh token', async () => {
    const { cfg } = await config();
    const fetchImpl = vi.fn(async (url: string | URL | Request) => String(url) === APPLE_TOKEN_URL
      ? ok({ access_token: 'at', id_token: jwtWithSub('s') }) : new Response('', { status: 200 }));
    expect(await revokeAppleAuthorization('c', 's', cfg, fetchImpl as unknown as typeof fetch)).toEqual({ revoked: true });
    const body = (fetchImpl.mock.calls[1] as unknown as [string, RequestInit])[1].body as URLSearchParams;
    expect(body.get('token')).toBe('at');
    expect(body.get('token_type_hint')).toBe('access_token');
  });

  it('does nothing without secrets or a code', async () => {
    const fetchImpl = vi.fn();
    expect(await revokeAppleAuthorization('c', 's', null, fetchImpl)).toEqual({ revoked: false, reason: 'not_configured' });
    const { cfg } = await config();
    expect(await revokeAppleAuthorization(undefined, 's', cfg, fetchImpl)).toEqual({ revoked: false, reason: 'no_code' });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('refuses to revoke a code for a different Apple ID', async () => {
    const { cfg } = await config();
    const fetchImpl = vi.fn(async () => ok({ refresh_token: 'rt', id_token: jwtWithSub('someone-else') }));
    expect(await revokeAppleAuthorization('c', 'me', cfg, fetchImpl as unknown as typeof fetch)).toEqual({ revoked: false, reason: 'subject_mismatch' });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('reports Apple errors and network failures without throwing', async () => {
    const { cfg } = await config();
    const bad = vi.fn(async () => new Response('{"error":"invalid_grant"}', { status: 400 }));
    expect(await revokeAppleAuthorization('c', 's', cfg, bad as unknown as typeof fetch)).toEqual({ revoked: false, reason: 'exchange_failed' });
    const revokeFails = vi.fn(async (url: string | URL | Request) => String(url) === APPLE_TOKEN_URL
      ? ok({ refresh_token: 'rt', id_token: jwtWithSub('s') }) : new Response('', { status: 400 }));
    expect(await revokeAppleAuthorization('c', 's', cfg, revokeFails as unknown as typeof fetch)).toEqual({ revoked: false, reason: 'revoke_failed' });
    const offline = vi.fn(async () => { throw new TypeError('offline'); });
    expect(await revokeAppleAuthorization('c', 's', cfg, offline as unknown as typeof fetch)).toEqual({ revoked: false, reason: 'error' });
    expect(await revokeAppleAuthorization('c', 's', { ...cfg, privateKey: 'not a key' }, offline as unknown as typeof fetch)).toEqual({ revoked: false, reason: 'error' });
  });
});

describe('DELETE /me with Sign in with Apple', () => {
  const identity: IdentityResolver = { resolve: async () => ({ error: 'unused', status: 400 }) };
  const appConfig = { devSignIn: false, mode: 'cloud' as const, appleAudience: 'com.antigravity.furniture3d' };

  async function setup(provider: Account['provider']) {
    const db = new MemorySyncDb();
    const account: Account = { id: 'acct-1', appleSub: provider === 'apple' ? 'apple-sub-1' : 'name:kaleb', email: '', username: '', displayName: 'K', provider, createdAt: 1 };
    await db.createAccount(account);
    await db.createSession('tok', account.id, 1);
    return { db, account };
  }
  const del = (body?: unknown) => new Request('https://w.example/api/v1/me', {
    method: 'DELETE', headers: { authorization: 'Bearer tok', ...(body ? { 'content-type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined,
  });

  it('revokes with the code from the app, then deletes the account', async () => {
    const { db } = await setup('apple');
    const appleRevoke = vi.fn(async () => ({ revoked: true as const }));
    const res = await handleSyncRequest(del({ authorizationCode: 'code-1' }), { db, identity, config: appConfig, appleRevoke });
    const body = await res.json() as { deleted: boolean; appleRevoked: boolean; message: string };
    expect(res.status).toBe(200);
    expect(body).toMatchObject({ deleted: true, appleRevoked: true });
    expect(body.message).toMatch(/removed from Sign in with Apple/);
    expect(appleRevoke).toHaveBeenCalledWith(expect.objectContaining({ appleSub: 'apple-sub-1' }), 'code-1');
    expect(await db.findAccountBySub('apple-sub-1')).toBeNull();
    expect(await db.accountForSession('tok')).toBeNull();
  });

  it('still deletes when revocation fails or throws, and says how to finish in Settings', async () => {
    for (const appleRevoke of [vi.fn(async () => ({ revoked: false as const, reason: 'exchange_failed' as const })), vi.fn(async () => { throw new Error('boom'); })]) {
      const { db } = await setup('apple');
      const res = await handleSyncRequest(del({ authorizationCode: 'c' }), { db, identity, config: appConfig, appleRevoke });
      const body = await res.json() as { deleted: boolean; appleRevoked: boolean; message: string };
      expect(body).toMatchObject({ deleted: true, appleRevoked: false });
      expect(body.message).toMatch(/Settings/);
      expect(await db.findAccountBySub('apple-sub-1')).toBeNull();
    }
  });

  it('username accounts and bodiless requests skip revocation', async () => {
    const { db } = await setup('password');
    const appleRevoke = vi.fn(async () => ({ revoked: true as const }));
    const res = await handleSyncRequest(del(), { db, identity, config: appConfig, appleRevoke });
    expect(await res.json()).toMatchObject({ deleted: true, appleRevoked: false });
    expect(appleRevoke).not.toHaveBeenCalled();
  });

  it('the Worker wiring uses the APPLE_* secrets and the account’s Apple subject', async () => {
    const { pem } = await testKey();
    const fetchImpl = vi.fn(async (url: string | URL | Request) => String(url) === APPLE_TOKEN_URL
      ? ok({ refresh_token: 'rt', id_token: jwtWithSub('apple-sub-1') }) : new Response('', { status: 200 }));
    const revoke = appleRevokeOption({ APPLE_TEAM_ID: 'T', APPLE_KEY_ID: 'K', APPLE_PRIVATE_KEY: pem }, 'com.antigravity.furniture3d', fetchImpl as unknown as typeof fetch)!;
    const { account } = await setup('apple');
    expect(await revoke(account, 'code')).toEqual({ revoked: true });
    const unset = appleRevokeOption({}, 'com.antigravity.furniture3d', fetchImpl as unknown as typeof fetch)!;
    expect(await unset(account, 'code')).toEqual({ revoked: false, reason: 'not_configured' });
  });
});

describe('Worker: Describe it cloud route is off for 1.0', () => {
  it('does not mount the AI route unless the flag is on', async () => {
    expect(aiOptions({})).toBeUndefined();
    expect(aiOptions({}, true)).toMatchObject({ requireSignIn: true });
    const db = new MemorySyncDb();
    const res = await handleSyncRequest(new Request('https://w.example/api/v1/ai/describe', { method: 'POST', body: '{"prompt":"a shelf"}' }), {
      db, identity: { resolve: async () => ({ error: 'x', status: 400 }) }, config: { devSignIn: false, mode: 'cloud', appleAudience: 'a' }, ai: aiOptions({}),
    });
    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({ code: 'not_configured' });
  });
});
