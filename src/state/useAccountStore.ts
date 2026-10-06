import { create } from 'zustand';
import {
  deleteAccountRequest,
  fetchAuthConfig,
  fetchMe,
  pushRecords,
  readStoredSession,
  signInWithIdentity,
  signOutRequest,
  writeStoredSession,
} from '../sync/client.ts';
import { appleSignInAvailable, authorizeWithApple } from '../sync/appleSignIn.ts';
import { createDevIdentityToken } from '../sync/identity.ts';
import {
  claimStarterProjectId,
  projectsFromRecords,
  recordsFromProjects,
  tombstonesFromRecords,
} from '../sync/merge.ts';
import type { Account, AuthConfig, SyncRecord } from '../sync/types.ts';
import { useAppStore } from './useAppStore.ts';
import { setProjectPersistListener, useProjectStore } from './useProjectStore.ts';

const MIGRATION_PREFIX = 'workbench_migration_v1:';
const TOMBSTONE_KEY = 'workbench_tombstones_v1';

export type MigrationChoice = 'needed' | 'done' | 'skipped';

interface TombstoneBuckets {
  device: Record<string, number>;
  accounts: Record<string, Record<string, number>>;
}

interface AccountState {
  status: 'loading' | 'signed-out' | 'signed-in';
  account: Account | null;
  token: string | null;
  config: AuthConfig | null;
  syncStatus: 'idle' | 'syncing' | 'error' | 'offline';
  lastSyncedAt: number | null;
  lastError: string | null;
  notice: string | null;
  appleAvailable: boolean;
  migration: MigrationChoice;
  loadSession: () => Promise<void>;
  signInApple: () => Promise<void>;
  signInDev: (displayName: string, email: string) => Promise<void>;
  signOut: () => Promise<void>;
  deleteAccount: () => Promise<void>;
  saveAndSync: () => Promise<void>;
  skipMigration: () => void;
  syncNow: () => Promise<void>;
}

function emptyBuckets(): TombstoneBuckets {
  return { device: {}, accounts: {} };
}

function loadTombstones(): TombstoneBuckets {
  try {
    const raw = localStorage.getItem(TOMBSTONE_KEY);
    if (!raw) return emptyBuckets();
    const parsed = JSON.parse(raw) as Partial<TombstoneBuckets>;
    return {
      device: parsed.device ?? {},
      accounts: parsed.accounts ?? {},
    };
  } catch {
    return emptyBuckets();
  }
}

function saveTombstones(buckets: TombstoneBuckets) {
  try {
    localStorage.setItem(TOMBSTONE_KEY, JSON.stringify(buckets));
  } catch {
    // The next successful sync rewrites tombstones from the server.
  }
}

function migrationStorageKey(accountId: string) {
  return `${MIGRATION_PREFIX}${accountId}`;
}

function readMigration(accountId: string): MigrationChoice | null {
  const value = localStorage.getItem(migrationStorageKey(accountId));
  if (value === 'done' || value === 'skipped') return value;
  return null;
}

function writeMigration(accountId: string, choice: 'done' | 'skipped') {
  localStorage.setItem(migrationStorageKey(accountId), choice);
}

function mergedTombstones(accountId: string, buckets: TombstoneBuckets): Record<string, number> {
  const merged: Record<string, number> = { ...buckets.device };
  const account = buckets.accounts[accountId] ?? {};
  for (const [id, at] of Object.entries(account)) {
    merged[id] = Math.max(merged[id] ?? 0, at);
  }
  return merged;
}

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
}

function isUnauthorized(error: unknown) {
  return error instanceof Error && /session expired|sign in required/i.test(error.message);
}

function isOffline(error: unknown) {
  if (error instanceof TypeError) return true;
  return error instanceof Error && /failed to fetch|network|unreachable/i.test(error.message);
}

function rememberRemoteTombstones(accountId: string, records: SyncRecord[]) {
  const remote = tombstonesFromRecords(records);
  const buckets = loadTombstones();
  const account = { ...(buckets.accounts[accountId] ?? {}) };
  for (const [id, at] of Object.entries(remote)) {
    account[id] = Math.max(account[id] ?? 0, at);
    if ((buckets.device[id] ?? 0) <= at) delete buckets.device[id];
  }
  buckets.accounts[accountId] = account;
  saveTombstones(buckets);
}

function applyRecords(accountId: string, records: SyncRecord[]) {
  rememberRemoteTombstones(accountId, records);
  const projects = projectsFromRecords(records);
  useProjectStore.getState().replaceAllProjects(projects);
  if (projects.length === 0 && useAppStore.getState().currentView === 'editor') {
    useAppStore.getState().openHome('projects');
  }
}

async function pushLocal(token: string, accountId: string) {
  const projectStore = useProjectStore.getState();
  const claimed = claimStarterProjectId(projectStore.projects);
  const idsChanged = claimed.some((project, index) => project.id !== projectStore.projects[index]?.id);
  if (idsChanged) projectStore.replaceAllProjects(claimed);
  const projects = useProjectStore.getState().projects;
  const records = recordsFromProjects(projects, mergedTombstones(accountId, loadTombstones()));
  const response = await pushRecords(token, records);
  applyRecords(accountId, response.records);
}

let syncTimer: number | null = null;

function scheduleSync() {
  if (syncTimer !== null) window.clearTimeout(syncTimer);
  syncTimer = window.setTimeout(() => {
    syncTimer = null;
    const state = useAccountStore.getState();
    if (state.status === 'signed-in' && state.migration === 'done' && state.token) {
      void state.syncNow();
    }
  }, 700);
}

export const useAccountStore = create<AccountState>((set, get) => ({
  status: 'loading',
  account: null,
  token: null,
  config: null,
  syncStatus: 'idle',
  lastSyncedAt: null,
  lastError: null,
  notice: null,
  appleAvailable: appleSignInAvailable(),
  migration: 'needed',

  loadSession: async () => {
    set({ appleAvailable: appleSignInAvailable() });
    const stored = readStoredSession();
    try {
      const config = await fetchAuthConfig();
      set({ config });
    } catch (error) {
      set({
        syncStatus: 'offline',
        lastError: errorMessage(error, 'Sync server is unreachable.'),
      });
    }

    if (!stored) {
      set({ status: 'signed-out', account: null, token: null });
      return;
    }

    try {
      const { account } = await fetchMe(stored.token);
      writeStoredSession({ token: stored.token, account });
      const migration = readMigration(account.id) ?? 'needed';
      set({
        status: 'signed-in',
        account,
        token: stored.token,
        migration,
        syncStatus: get().syncStatus === 'offline' ? 'offline' : 'idle',
      });
      if (migration === 'done') void get().syncNow();
    } catch (error) {
      if (isUnauthorized(error)) {
        writeStoredSession(null);
        set({ status: 'signed-out', account: null, token: null, lastError: null });
        return;
      }
      const migration = readMigration(stored.account.id) ?? 'needed';
      set({
        status: 'signed-in',
        account: stored.account,
        token: stored.token,
        migration,
        syncStatus: 'offline',
        lastError: 'Offline. Projects on this device are still available.',
      });
    }
  },

  signInApple: async () => {
    set({ syncStatus: 'syncing', lastError: null, notice: null });
    try {
      const credential = await authorizeWithApple();
      await finishSignIn(set, get, credential.identityToken, credential.email, credential.displayName);
    } catch (error) {
      set({
        status: get().account ? 'signed-in' : 'signed-out',
        syncStatus: 'error',
        lastError: errorMessage(error, 'Sign in with Apple failed.'),
      });
    }
  },

  signInDev: async (displayName, email) => {
    set({ syncStatus: 'syncing', lastError: null, notice: null });
    try {
      const token = createDevIdentityToken(email.trim(), displayName.trim());
      await finishSignIn(set, get, token, email.trim(), displayName.trim());
    } catch (error) {
      set({
        status: get().account ? 'signed-in' : 'signed-out',
        syncStatus: isOffline(error) ? 'offline' : 'error',
        lastError: errorMessage(error, 'Dev sign-in failed.'),
      });
    }
  },

  signOut: async () => {
    const token = get().token;
    set({ syncStatus: 'syncing', lastError: null });
    try {
      if (token) await signOutRequest(token);
    } catch (error) {
      if (!isOffline(error) && !isUnauthorized(error)) {
        set({
          syncStatus: 'error',
          lastError: errorMessage(error, 'Sign out failed.'),
        });
        return;
      }
    }
    writeStoredSession(null);
    set({
      status: 'signed-out',
      account: null,
      token: null,
      migration: 'needed',
      syncStatus: 'idle',
      lastError: null,
    });
  },

  deleteAccount: async () => {
    const { token, account } = get();
    if (!token || !account) return;
    set({ syncStatus: 'syncing', lastError: null });
    try {
      const result = await deleteAccountRequest(token);
      writeStoredSession(null);
      localStorage.removeItem(migrationStorageKey(account.id));
      const buckets = loadTombstones();
      delete buckets.accounts[account.id];
      saveTombstones(buckets);
      set({
        status: 'signed-out',
        account: null,
        token: null,
        migration: 'needed',
        syncStatus: 'idle',
        lastError: null,
        notice: result.message,
      });
    } catch (error) {
      set({
        syncStatus: isOffline(error) ? 'offline' : 'error',
        lastError: errorMessage(error, 'Could not delete the Workbench account.'),
      });
    }
  },

  saveAndSync: () => get().syncNow(),

  skipMigration: () => {
    const accountId = get().account?.id;
    if (accountId) writeMigration(accountId, 'skipped');
    set({ migration: 'skipped' });
  },

  syncNow: async () => {
    const { token, account } = get();
    if (!token || !account) return;
    set({ syncStatus: 'syncing', lastError: null });
    try {
      await pushLocal(token, account.id);
      writeMigration(account.id, 'done');
      set({
        syncStatus: 'idle',
        lastSyncedAt: Date.now(),
        migration: 'done',
        lastError: null,
      });
    } catch (error) {
      set({
        syncStatus: isOffline(error) ? 'offline' : 'error',
        lastError: errorMessage(error, 'Sync failed.'),
      });
    }
  },
}));

async function finishSignIn(
  set: (partial: Partial<AccountState>) => void,
  get: () => AccountState,
  identityToken: string,
  email?: string,
  displayName?: string,
) {
  const auth = await signInWithIdentity(identityToken, email, displayName);
  writeStoredSession({ token: auth.token, account: auth.account });
  const migration = readMigration(auth.account.id) ?? 'needed';
  set({
    status: 'signed-in',
    account: auth.account,
    token: auth.token,
    migration,
    syncStatus: 'idle',
    lastError: null,
    notice: null,
  });
  if (migration === 'done') await get().syncNow();
}

setProjectPersistListener((event) => {
  if (event.type === 'delete') {
    const buckets = loadTombstones();
    buckets.device[event.id] = Math.max(buckets.device[event.id] ?? 0, event.updatedAt);
    const accountId = useAccountStore.getState().account?.id;
    if (accountId) {
      const account = { ...(buckets.accounts[accountId] ?? {}) };
      account[event.id] = Math.max(account[event.id] ?? 0, event.updatedAt);
      buckets.accounts[accountId] = account;
    }
    saveTombstones(buckets);
  }
  scheduleSync();
});

if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return;
    const state = useAccountStore.getState();
    if (state.status === 'signed-in' && state.migration === 'done') void state.syncNow();
  });
}
