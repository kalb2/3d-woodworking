import { SignInWithApple } from '@capacitor-community/apple-sign-in';
import { Capacitor } from '@capacitor/core';
import { APPLE_AUDIENCE } from './types.ts';

export interface AppleCredential {
  identityToken: string;
  email?: string;
  displayName?: string;
}

/** Native sheet is iOS-only. The browser build keeps dev sign-in. */
export function appleSignInAvailable(): boolean {
  return Capacitor.getPlatform() === 'ios' && Capacitor.isPluginAvailable('SignInWithApple');
}

export function appleSignInUnavailableReason(): string | null {
  if (appleSignInAvailable()) return null;
  if (Capacitor.getPlatform() === 'ios') {
    return 'This iOS build is missing the Sign in with Apple plugin. Sync Capacitor and rebuild in Xcode.';
  }
  return 'Sign in with Apple opens in the iOS app. On this browser, use dev sign-in.';
}

export async function authorizeWithApple(): Promise<AppleCredential> {
  if (!appleSignInAvailable()) {
    throw new Error(appleSignInUnavailableReason() ?? 'Sign in with Apple is unavailable.');
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
