import { Capacitor } from '@capacitor/core';
import type { Account, AuthConfig, AuthResponse, SyncPushResponse, SyncRecord } from './types.ts';
import { API_PREFIX } from './types.ts';

export const SYNC_SERVER_UNCONFIGURED =
  'Projects stay on this device until cloud sync is turned on.';

const SESSION_KEY = 'workbench_session_v1';

export interface StoredSession {
  token: string;
  account: Account;
}

/** The live sync Worker. Used by production builds when VITE_SYNC_API_URL isn't set (e.g. a fresh clone). */
export const PRODUCTION_SYNC_URL = 'https://workbench-sync.k24corp.workers.dev';

/** VITE_SYNC_API_URL wins; a production build falls back to the live Worker; dev uses the Vite middleware (''). */
export function resolveSyncBaseUrl(env: Record<string, unknown>): string {
  const configured = typeof env.VITE_SYNC_API_URL === 'string' ? env.VITE_SYNC_API_URL.trim() : '';
  if (configured) return configured.replace(/\/$/, '');
  return env.PROD === true ? PRODUCTION_SYNC_URL : '';
}

export function syncBaseUrl(): string {
  return resolveSyncBaseUrl(import.meta.env as Record<string, unknown>);
}

/** The Vite dev server serves /api/v1. A native build does not, unless a Worker URL is set. */
export function syncServerConfigured(): boolean {
  if (syncBaseUrl()) return true;
  return !Capacitor.isNativePlatform();
}

export function readStoredSession(): StoredSession | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredSession;
    if (!parsed.token || !parsed.account?.id) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function writeStoredSession(session: StoredSession | null) {
  if (!session) localStorage.removeItem(SESSION_KEY);
  else localStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

function readBody<T>(text: string): T & { error?: string } {
  if (!text) return {} as T & { error?: string };
  try {
    return JSON.parse(text) as T & { error?: string };
  } catch {
    const trimmed = text.trim();
    if (!trimmed || trimmed.startsWith('<') || trimmed.startsWith('<!')) {
      throw new Error(SYNC_SERVER_UNCONFIGURED);
    }
    throw new Error('Cloud sync could not read that response. Projects on this device are still here.');
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  if (!syncServerConfigured()) throw new Error(SYNC_SERVER_UNCONFIGURED);
  const headers = new Headers(init.headers);
  if (init.body && !headers.has('content-type')) headers.set('content-type', 'application/json');
  const response = await fetch(`${syncBaseUrl()}${API_PREFIX}${path}`, { ...init, headers });
  const text = await response.text();
  const body = readBody<T>(text);
  if (!response.ok) throw new Error(body.error || `Sync request failed (${response.status}).`);
  return body;
}

function authHeaders(token: string): HeadersInit {
  return { authorization: `Bearer ${token}` };
}

export function fetchAuthConfig(): Promise<AuthConfig> {
  return request<AuthConfig>('/auth/config');
}

export function signUpWithPassword(username: string, password: string): Promise<AuthResponse> {
  return request<AuthResponse>('/auth/signup', {
    method: 'POST',
    body: JSON.stringify({ username, password }),
  });
}

export function signInWithPassword(username: string, password: string): Promise<AuthResponse> {
  return request<AuthResponse>('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username, password }),
  });
}

export function signInWithIdentity(identityToken: string, email?: string, displayName?: string): Promise<AuthResponse> {
  return request<AuthResponse>('/auth/apple', {
    method: 'POST',
    body: JSON.stringify({ identityToken, email, displayName }),
  });
}

export function fetchMe(token: string): Promise<{ account: Account }> {
  return request('/me', { headers: authHeaders(token) });
}

export function signOutRequest(token: string): Promise<{ ok: boolean }> {
  return request('/auth/signout', { method: 'POST', headers: authHeaders(token) });
}

/** `authorizationCode` (Apple accounts): lets the Worker revoke the Sign in with Apple tokens. */
export function deleteAccountRequest(
  token: string,
  authorizationCode?: string,
): Promise<{ deleted: boolean; message: string; appleRevoked?: boolean }> {
  return request('/me', {
    method: 'DELETE',
    headers: authHeaders(token),
    ...(authorizationCode ? { body: JSON.stringify({ authorizationCode }) } : {}),
  });
}

export function fetchRecords(token: string): Promise<{ records: SyncRecord[] }> {
  return request('/projects', { headers: authHeaders(token) });
}

/** The Worker refuses PUT bodies over 2,000,000 characters; stay well under it. */
export const SYNC_BATCH_LIMIT = 1_500_000;

/**
 * Split records into PUT bodies under `limit` characters. A record that is too
 * big on its own can never upload; it comes back in `tooLarge` instead.
 */
export function batchRecords(records: SyncRecord[], limit = SYNC_BATCH_LIMIT): { batches: SyncRecord[][]; tooLarge: SyncRecord[] } {
  const overhead = JSON.stringify({ records: [] }).length;
  const batches: SyncRecord[][] = [];
  const tooLarge: SyncRecord[] = [];
  let current: SyncRecord[] = [];
  let size = overhead;
  for (const record of records) {
    const length = JSON.stringify(record).length + 1;
    if (overhead + length > limit) { tooLarge.push(record); continue; }
    if (current.length && size + length > limit) {
      batches.push(current);
      current = [];
      size = overhead;
    }
    current.push(record);
    size += length;
  }
  if (current.length) batches.push(current);
  return { batches, tooLarge };
}

export function pushRecords(token: string, records: SyncRecord[]): Promise<SyncPushResponse> {
  return request('/projects', {
    method: 'PUT',
    headers: authHeaders(token),
    body: JSON.stringify({ records }),
  });
}
