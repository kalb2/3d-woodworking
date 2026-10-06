import { Capacitor } from '@capacitor/core';
import type { Account, AuthConfig, AuthResponse, SyncPushResponse, SyncRecord } from './types.ts';
import { API_PREFIX } from './types.ts';

export const SYNC_SERVER_UNCONFIGURED =
  'Sync server is not configured. Projects stay on this device until the app is built with VITE_SYNC_API_URL.';

const SESSION_KEY = 'workbench_session_v1';

export interface StoredSession {
  token: string;
  account: Account;
}

export function syncBaseUrl(): string {
  const env = import.meta.env as Record<string, string | undefined>;
  const configured = env.VITE_SYNC_API_URL?.trim();
  return configured ? configured.replace(/\/$/, '') : '';
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
    throw new Error('The sync server returned a response this app could not read.');
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

export function deleteAccountRequest(token: string): Promise<{ deleted: boolean; message: string }> {
  return request('/me', { method: 'DELETE', headers: authHeaders(token) });
}

export function fetchRecords(token: string): Promise<{ records: SyncRecord[] }> {
  return request('/projects', { headers: authHeaders(token) });
}

export function pushRecords(token: string, records: SyncRecord[]): Promise<SyncPushResponse> {
  return request('/projects', {
    method: 'PUT',
    headers: authHeaders(token),
    body: JSON.stringify({ records }),
  });
}
