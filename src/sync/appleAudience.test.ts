import { afterEach, describe, expect, it, vi } from 'vitest';
import { verifyAppleIdentityToken } from './appleJwt';
import { createIdentityResolver } from './identity';
import { APPLE_AUDIENCE, LEGACY_APPLE_AUDIENCES, acceptedAppleAudiences } from './types';

const b64url = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
const b64urlJson = (value: unknown) => b64url(new TextEncoder().encode(JSON.stringify(value)));

const keyPair = crypto.subtle.generateKey(
  { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
  true,
  ['sign', 'verify'],
) as Promise<CryptoKeyPair>;

async function appleToken(aud: string | string[], sub = 'apple-sub-1'): Promise<string> {
  const { privateKey } = await keyPair;
  const header = b64urlJson({ alg: 'RS256', kid: 'test-kid' });
  const payload = b64urlJson({ iss: 'https://appleid.apple.com', aud, sub, exp: Math.floor(Date.now() / 1000) + 600, email: 'k@example.com' });
  const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', privateKey, new TextEncoder().encode(`${header}.${payload}`));
  return `${header}.${payload}.${b64url(new Uint8Array(signature))}`;
}

async function stubAppleKeys() {
  const jwk = await crypto.subtle.exportKey('jwk', (await keyPair).publicKey);
  vi.stubGlobal('fetch', vi.fn(async () => Response.json({ keys: [{ kid: 'test-kid', kty: jwk.kty, n: jwk.n, e: jwk.e, alg: 'RS256', use: 'sig' }] })));
}

afterEach(() => vi.unstubAllGlobals());

describe('bundle id', () => {
  it('is com.k24corp.workbench, with the old id kept as legacy', () => {
    expect(APPLE_AUDIENCE).toBe('com.k24corp.workbench');
    expect(LEGACY_APPLE_AUDIENCES).toEqual(['com.antigravity.furniture3d']);
    expect(acceptedAppleAudiences()).toEqual(['com.k24corp.workbench', 'com.antigravity.furniture3d']);
    expect(acceptedAppleAudiences('com.example.override')).toEqual(['com.example.override', 'com.k24corp.workbench', 'com.antigravity.furniture3d']);
    expect(acceptedAppleAudiences('com.antigravity.furniture3d')).toEqual(['com.antigravity.furniture3d', 'com.k24corp.workbench']);
  });
});

describe('Sign in with Apple audience', () => {
  it('accepts identity tokens for the new and the pre-rename bundle id', async () => {
    await stubAppleKeys();
    const audiences = acceptedAppleAudiences();
    expect(await verifyAppleIdentityToken(await appleToken('com.k24corp.workbench'), audiences)).toMatchObject({ sub: 'apple-sub-1' });
    expect(await verifyAppleIdentityToken(await appleToken('com.antigravity.furniture3d'), audiences)).toMatchObject({ sub: 'apple-sub-1' });
    expect(await verifyAppleIdentityToken(await appleToken(['other', 'com.k24corp.workbench']), audiences)).toMatchObject({ sub: 'apple-sub-1' });
  });

  it('rejects other audiences, and a single audience string still works', async () => {
    await stubAppleKeys();
    await expect(verifyAppleIdentityToken(await appleToken('com.example.other'), acceptedAppleAudiences())).rejects.toThrow(/audience/);
    await expect(verifyAppleIdentityToken(await appleToken('com.antigravity.furniture3d'), 'com.k24corp.workbench')).rejects.toThrow(/audience/);
    expect(await verifyAppleIdentityToken(await appleToken('com.k24corp.workbench'), 'com.k24corp.workbench')).toMatchObject({ sub: 'apple-sub-1' });
  });

  it('the identity resolver signs in tokens from both bundle ids', async () => {
    await stubAppleKeys();
    const resolver = createIdentityResolver({ allowDev: false, appleAudience: acceptedAppleAudiences() });
    for (const aud of ['com.k24corp.workbench', 'com.antigravity.furniture3d']) {
      expect(await resolver.resolve({ identityToken: await appleToken(aud) })).toMatchObject({ appleSub: 'apple-sub-1', provider: 'apple' });
    }
    expect(await resolver.resolve({ identityToken: await appleToken('com.example.other') })).toMatchObject({ status: 401 });
  });
});
