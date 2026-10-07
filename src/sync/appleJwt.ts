interface AppleJwk {
  kid: string;
  kty: string;
  n: string;
  e: string;
  alg?: string;
  use?: string;
}

let cachedKeys: { keys: AppleJwk[]; fetchedAt: number } | null = null;

function decodeBase64Url(value: string): string {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((value.length + 3) % 4);
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function signatureBytes(value: string): Uint8Array<ArrayBuffer> {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((value.length + 3) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(new ArrayBuffer(binary.length));
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

async function appleKeys(): Promise<AppleJwk[]> {
  if (cachedKeys && Date.now() - cachedKeys.fetchedAt < 60 * 60 * 1000) return cachedKeys.keys;
  const response = await fetch('https://appleid.apple.com/auth/keys');
  if (!response.ok) throw new Error('Apple key set is unavailable.');
  const body = await response.json() as { keys?: AppleJwk[] };
  const keys = body.keys ?? [];
  cachedKeys = { keys, fetchedAt: Date.now() };
  return keys;
}

/**
 * Verifies a Sign in with Apple identity token.
 * No client secret is required: Apple publishes the RS256 keys.
 */
export async function verifyAppleIdentityToken(
  token: string,
  audience: string,
): Promise<{ sub: string; email?: string }> {
  const parts = token.split('.');
  if (parts.length !== 3) throw new Error('Token is not a JWT.');
  const [encodedHeader, encodedPayload, encodedSignature] = parts;
  const header = JSON.parse(decodeBase64Url(encodedHeader)) as { alg?: string; kid?: string };
  const payload = JSON.parse(decodeBase64Url(encodedPayload)) as {
    iss?: string;
    aud?: string | string[];
    exp?: number;
    sub?: string;
    email?: string;
  };
  if (header.alg !== 'RS256' || !header.kid) throw new Error('Unexpected Apple token header.');
  const jwk = (await appleKeys()).find((key) => key.kid === header.kid);
  if (!jwk) throw new Error('Apple signing key was not found.');
  const key = await crypto.subtle.importKey(
    'jwk',
    { kty: jwk.kty, n: jwk.n, e: jwk.e, alg: 'RS256', ext: true, key_ops: ['verify'] },
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['verify'],
  );
  const valid = await crypto.subtle.verify(
    'RSASSA-PKCS1-v1_5',
    key,
    signatureBytes(encodedSignature),
    new TextEncoder().encode(`${encodedHeader}.${encodedPayload}`),
  );
  if (!valid) throw new Error('Apple token signature is invalid.');
  if (payload.iss !== 'https://appleid.apple.com') throw new Error('Unexpected token issuer.');
  const audiences = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
  if (!audiences.includes(audience)) throw new Error('Token audience does not match this app.');
  if (!payload.exp || payload.exp * 1000 < Date.now()) throw new Error('Apple token has expired.');
  if (!payload.sub) throw new Error('Apple token is missing a subject.');
  return { sub: payload.sub, email: payload.email };
}
