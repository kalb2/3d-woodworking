import { verifyAppleIdentityToken } from './appleJwt.ts';
import type { AppleAuthRequest, IdentityResolver, ResolvedIdentity } from './types.ts';

export interface IdentityOptions {
  allowDev: boolean;
  appleAudience: string;
}

interface DevPayload {
  email?: string;
  displayName?: string;
}

export function createDevIdentityToken(email: string, displayName: string): string {
  const payload = JSON.stringify({ email, displayName });
  const bytes = new TextEncoder().encode(payload);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return `dev.${btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')}`;
}

function readDevToken(token: string): DevPayload | null {
  if (!token.startsWith('dev.')) return null;
  try {
    const encoded = token.slice(4).replace(/-/g, '+').replace(/_/g, '/');
    const padded = encoded + '==='.slice((encoded.length + 3) % 4);
    const binary = atob(padded);
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    return JSON.parse(new TextDecoder().decode(bytes)) as DevPayload;
  } catch {
    return null;
  }
}

function devIdentity(body: AppleAuthRequest): ResolvedIdentity | { error: string; status: number } {
  const parsed = readDevToken(body.identityToken);
  const email = (parsed?.email || body.email || '').trim().toLowerCase();
  if (!email.includes('@')) return { error: 'Enter an email for the dev account.', status: 400 };
  const displayName = (parsed?.displayName || body.displayName || email.split('@')[0]).trim();
  if (!displayName) return { error: 'Enter a display name.', status: 400 };
  return { appleSub: `dev:${email}`, email, displayName, provider: 'dev' };
}

export function createIdentityResolver(options: IdentityOptions): IdentityResolver {
  return {
    async resolve(body) {
      if (!body.identityToken) return { error: 'Missing identity token.', status: 400 };
      if (body.identityToken.startsWith('dev.')) {
        if (!options.allowDev) {
          return { error: 'Dev sign-in is disabled. Use Sign in with Apple.', status: 403 };
        }
        return devIdentity(body);
      }
      try {
        const verified = await verifyAppleIdentityToken(body.identityToken, options.appleAudience);
        const email = (verified.email || body.email || '').trim().toLowerCase();
        if (!email) {
          return { error: 'Apple did not share an email. Sign in again and allow email.', status: 400 };
        }
        const displayName = (body.displayName || email.split('@')[0]).trim();
        return { appleSub: verified.sub, email, displayName, provider: 'apple' };
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Apple identity token was rejected.';
        return { error: message, status: 401 };
      }
    },
  };
}
