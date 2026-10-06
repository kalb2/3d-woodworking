import type { Account, AuthConfig, AuthResponse, SyncPushResponse, SyncRecord } from './types.ts';
import { API_PREFIX } from './types.ts';

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

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body && !headers.has('content-type')) headers.set('content-type', 'application/json');
  const response = await fetch(`${syncBaseUrl()}${API_PREFIX}${path}`, { ...init, headers });
  const text = await response.text();
  const body = text ? JSON.parse(text) as T & { error?: string } : {} as T & { error?: string };
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
