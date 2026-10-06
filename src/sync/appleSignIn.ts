import { Capacitor, registerPlugin } from '@capacitor/core';
import { APPLE_AUDIENCE } from './types.ts';

interface AppleAuthorization {
  response: {
    user?: string;
    email?: string | null;
    givenName?: string | null;
    familyName?: string | null;
    identityToken?: string | null;
  };
}

interface AppleSignInPlugin {
  authorize(options: {
    clientId: string;
    redirectURI: string;
    scopes: string;
  }): Promise<AppleAuthorization>;
}

const SignInWithApple = registerPlugin<AppleSignInPlugin>('SignInWithApple');

export interface AppleCredential {
  identityToken: string;
  email?: string;
  displayName?: string;
}

export function appleSignInAvailable(): boolean {
  return Capacitor.isPluginAvailable('SignInWithApple');
}

export async function authorizeWithApple(): Promise<AppleCredential> {
  if (!appleSignInAvailable()) {
    throw new Error('Sign in with Apple is not in this build. Add the iOS capability and @capacitor-community/apple-sign-in, then sync.');
  }
  const result = await SignInWithApple.authorize({
    clientId: APPLE_AUDIENCE,
    redirectURI: 'https://localhost/auth/apple',
    scopes: 'email name',
  });
  const token = result.response.identityToken;
  if (!token) throw new Error('Apple did not return an identity token.');
  const given = result.response.givenName?.trim() || '';
  const family = result.response.familyName?.trim() || '';
  const displayName = `${given} ${family}`.trim();
  return {
    identityToken: token,
    email: result.response.email?.trim() || undefined,
    displayName: displayName || undefined,
  };
}
