import type { FurnitureProject } from '../types/furniture.ts';

export type AccountProvider = 'apple' | 'password' | 'dev';

export interface Account {
  id: string;
  /** Apple subject, `dev:<email>`, or `name:<username>` for a password account. */
  appleSub: string;
  email: string;
  /** Set for username accounts. Empty for Apple-only accounts. */
  username: string;
  displayName: string;
  provider: AccountProvider;
  createdAt: number;
}

/** One project row in the sync log. A tombstone has deletedAt and no project. */
export interface SyncRecord {
  id: string;
  updatedAt: number;
  deletedAt?: number;
  project?: FurnitureProject;
}

export interface AuthConfig {
  devSignIn: boolean;
  mode: 'dev' | 'cloud';
  appleAudience: string;
}

export interface AppleAuthRequest {
  identityToken: string;
  email?: string;
  displayName?: string;
}

export interface AuthResponse {
  token: string;
  account: Account;
}

export interface SyncPushRequest {
  records: SyncRecord[];
}

export interface SyncPushResponse {
  records: SyncRecord[];
}

export interface ResolvedIdentity {
  appleSub: string;
  email: string;
  displayName: string;
  provider: AccountProvider;
}

export interface IdentityResolver {
  resolve(body: AppleAuthRequest): Promise<ResolvedIdentity | { error: string; status: number }>;
}

export interface SyncDatabase {
  findAccountBySub(appleSub: string): Promise<Account | null>;
  findAccountByUsername(username: string): Promise<Account | null>;
  passwordHashFor(accountId: string): Promise<string | null>;
  createAccount(account: Account, passwordHash?: string | null): Promise<void>;
  deleteAccount(accountId: string): Promise<void>;
  createSession(token: string, accountId: string, createdAt: number): Promise<void>;
  /** The session's account, or null when the token is unknown or older than SESSION_TTL_MS. */
  accountForSession(token: string, now?: number): Promise<Account | null>;
  deleteSession(token: string): Promise<void>;
  deleteSessionsForAccount(accountId: string): Promise<void>;
  listRecords(accountId: string): Promise<SyncRecord[]>;
  upsertRecord(accountId: string, record: SyncRecord): Promise<SyncRecord>;
}

/** Bundle id of The Workbench, and the Sign in with Apple identity-token audience and client id. */
export const APPLE_AUDIENCE = 'com.k24corp.workbench';
/**
 * Earlier bundle ids. Builds installed before the rename still sign in with these
 * audiences, so the sync server keeps accepting them.
 */
export const LEGACY_APPLE_AUDIENCES: readonly string[] = ['com.antigravity.furniture3d'];

/** Audiences the sync server accepts: `primary` first, then the current and legacy bundle ids. */
export function acceptedAppleAudiences(primary: string = APPLE_AUDIENCE): string[] {
  return [...new Set([primary, APPLE_AUDIENCE, ...LEGACY_APPLE_AUDIENCES].map((id) => id.trim()).filter(Boolean))];
}
export const API_PREFIX = '/api/v1';

/** A sign-in session lasts this long; then the app asks to sign in again. */
export const SESSION_TTL_MS = 90 * 24 * 60 * 60 * 1000;
