/**
 * Sign in with Apple token revocation (runs in the sync Worker).
 *
 * When an Apple account deletes its Workbench account, the app gets a fresh
 * authorization code from the Apple sheet and sends it with DELETE /me. The
 * Worker exchanges it at appleid.apple.com/auth/token for a refresh token, then
 * revokes that at appleid.apple.com/auth/revoke, which removes The Workbench
 * from the user's "Sign in with Apple" apps. Both calls need a client secret:
 * an ES256 JWT signed with the Sign in with Apple .p8 key.
 *
 * Worker secrets (not committed; see worker/wrangler.toml):
 *   APPLE_TEAM_ID      Apple Developer Team ID (10 chars)
 *   APPLE_KEY_ID       Key ID of the Sign in with Apple key (10 chars)
 *   APPLE_PRIVATE_KEY  Contents of AuthKey_<KEY_ID>.p8 (PEM, PKCS#8)
 *   APPLE_CLIENT_ID    Optional. Defaults to the bundle id (APPLE_AUDIENCE).
 */

export const APPLE_TOKEN_URL = 'https://appleid.apple.com/auth/token';
export const APPLE_REVOKE_URL = 'https://appleid.apple.com/auth/revoke';

export interface AppleRevokeConfig {
  teamId: string;
  keyId: string;
  /** PEM (-----BEGIN PRIVATE KEY-----) or bare base64 PKCS#8. Literal "\n" is accepted. */
  privateKey: string;
  clientId: string;
}

export interface AppleRevokeEnv {
  APPLE_TEAM_ID?: string;
  APPLE_KEY_ID?: string;
  APPLE_PRIVATE_KEY?: string;
  APPLE_CLIENT_ID?: string;
}

export type AppleRevokeResult =
  | { revoked: true }
  | { revoked: false; reason: 'not_configured' | 'no_code' | 'exchange_failed' | 'subject_mismatch' | 'revoke_failed' | 'error' };

/** Null until the three key secrets are set. */
export function appleRevokeConfig(env: AppleRevokeEnv, defaultClientId: string): AppleRevokeConfig | null {
  const teamId = env.APPLE_TEAM_ID?.trim();
  const keyId = env.APPLE_KEY_ID?.trim();
  const privateKey = env.APPLE_PRIVATE_KEY?.trim();
  if (!teamId || !keyId || !privateKey) return null;
  return { teamId, keyId, privateKey, clientId: env.APPLE_CLIENT_ID?.trim() || defaultClientId };
}

function base64UrlFromBytes(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function base64UrlJson(value: unknown): string {
  return base64UrlFromBytes(new TextEncoder().encode(JSON.stringify(value)));
}

function pkcs8Bytes(pem: string): Uint8Array<ArrayBuffer> {
  const body = pem
    .replace(/\\n/g, '\n')
    .replace(/-----BEGIN [^-]+-----/g, '')
    .replace(/-----END [^-]+-----/g, '')
    .replace(/\s+/g, '');
  const binary = atob(body);
  const bytes = new Uint8Array(new ArrayBuffer(binary.length));
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

/**
 * The client_secret Apple expects: ES256 JWT, iss = team, sub = client id,
 * aud = https://appleid.apple.com, short-lived (5 minutes; Apple allows up to 6 months).
 */
export async function createAppleClientSecret(config: AppleRevokeConfig, nowSeconds = Math.floor(Date.now() / 1000)): Promise<string> {
  const key = await crypto.subtle.importKey(
    'pkcs8',
    pkcs8Bytes(config.privateKey),
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign'],
  );
  const header = base64UrlJson({ alg: 'ES256', kid: config.keyId, typ: 'JWT' });
  const payload = base64UrlJson({
    iss: config.teamId,
    iat: nowSeconds,
    exp: nowSeconds + 300,
    aud: 'https://appleid.apple.com',
    sub: config.clientId,
  });
  // WebCrypto ECDSA returns r||s (IEEE P1363), which is the JWS ES256 format.
  const signature = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    key,
    new TextEncoder().encode(`${header}.${payload}`),
  );
  return `${header}.${payload}.${base64UrlFromBytes(new Uint8Array(signature))}`;
}

function jwtSubject(token: string | undefined): string | null {
  if (!token) return null;
  const part = token.split('.')[1];
  if (!part) return null;
  try {
    const padded = part.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((part.length + 3) % 4);
    const parsed = JSON.parse(atob(padded)) as { sub?: unknown };
    return typeof parsed.sub === 'string' ? parsed.sub : null;
  } catch {
    return null;
  }
}

function form(values: Record<string, string>): URLSearchParams {
  return new URLSearchParams(values);
}

/**
 * Exchange the authorization code, check it belongs to `expectedSub`, revoke the
 * refresh token (or the access token if Apple didn't return one). Never throws.
 */
export async function revokeAppleAuthorization(
  authorizationCode: string | undefined,
  expectedSub: string,
  config: AppleRevokeConfig | null,
  fetchImpl: typeof fetch = fetch,
): Promise<AppleRevokeResult> {
  if (!config) return { revoked: false, reason: 'not_configured' };
  const code = authorizationCode?.trim();
  if (!code) return { revoked: false, reason: 'no_code' };
  try {
    const clientSecret = await createAppleClientSecret(config);
    const headers = { 'content-type': 'application/x-www-form-urlencoded' };
    const tokenResponse = await fetchImpl(APPLE_TOKEN_URL, {
      method: 'POST',
      headers,
      body: form({ client_id: config.clientId, client_secret: clientSecret, code, grant_type: 'authorization_code' }),
    });
    if (!tokenResponse.ok) return { revoked: false, reason: 'exchange_failed' };
    const tokens = await tokenResponse.json() as { access_token?: string; refresh_token?: string; id_token?: string };
    // The code came from the Apple sheet on the device; only revoke for the account being deleted.
    if (jwtSubject(tokens.id_token) !== expectedSub) return { revoked: false, reason: 'subject_mismatch' };
    const token = tokens.refresh_token || tokens.access_token;
    if (!token) return { revoked: false, reason: 'exchange_failed' };
    const revokeResponse = await fetchImpl(APPLE_REVOKE_URL, {
      method: 'POST',
      headers,
      body: form({
        client_id: config.clientId,
        client_secret: clientSecret,
        token,
        token_type_hint: tokens.refresh_token ? 'refresh_token' : 'access_token',
      }),
    });
    return revokeResponse.ok ? { revoked: true } : { revoked: false, reason: 'revoke_failed' };
  } catch {
    return { revoked: false, reason: 'error' };
  }
}
