import { create } from 'zustand';
import {
  batchRecords,
  deleteAccountRequest,
  fetchAuthConfig,
  fetchMe,
  fetchRecords,
  pushRecords,
  readStoredSession,
  signInWithIdentity,
  signInWithPassword,
  signOutRequest,
  signUpWithPassword,
  SYNC_SERVER_UNCONFIGURED,
  syncServerConfigured,
  writeStoredSession,
} from '../sync/client.ts';
import { appleSignInAvailable, authorizeWithApple, isAppleCancel } from '../sync/appleSignIn.ts';
import { createDevIdentityToken } from '../sync/identity.ts';
import {
  changedRecords,
  claimStarterProjectId,
  knownVersions,
  projectsFromRecords,
  keepInFlightEdits,
  recordsFromProjects,
  tombstonesFromRecords,
} from '../sync/merge.ts';
import type { Account, AuthConfig, AuthResponse, SyncPushResponse, SyncRecord } from '../sync/types.ts';
import type { FurnitureProject } from '../types/furniture.ts';
import { useAppStore } from './useAppStore.ts';
import { setProjectPersistListener, useProjectStore } from './useProjectStore.ts';

const MIGRATION_PREFIX = 'workbench_migration_v1:';
const TOMBSTONE_KEY = 'workbench_tombstones_v1';
/** Per account: id → updatedAt the server held after the last good sync (so only changes upload). */
const KNOWN_PREFIX = 'workbench_sync_known_v1:';
/** The account that last signed in on this device. */
const LAST_ACCOUNT_KEY = 'workbench_last_account_v1';

export const SIGN_IN_INCOMPLETE = "Sign-in didn't finish. Please try again.";

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
  serverConfigured: boolean;
  appleAvailable: boolean;
  migration: MigrationChoice;
  loadSession: () => Promise<void>;
  signInApple: () => Promise<void>;
  signUp: (username: string, password: string) => Promise<void>;
  signInPassword: (username: string, password: string) => Promise<void>;
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

function loadKnown(accountId: string): Record<string, number> | null {
  try {
    const raw = localStorage.getItem(`${KNOWN_PREFIX}${accountId}`);
    return raw ? JSON.parse(raw) as Record<string, number> : null;
  } catch {
    return null;
  }
}

function saveKnown(accountId: string, records: SyncRecord[]) {
  try {
    localStorage.setItem(`${KNOWN_PREFIX}${accountId}`, JSON.stringify(knownVersions(records)));
  } catch {
    // Without it the next sync just uploads everything again (in batches).
  }
}

/**
 * Another account signed in on this device before: the projects here are
 * probably theirs, so ask again ("Save this device to your account?") instead
 * of uploading them into this account on the next automatic sync.
 */
function noteAccountOnDevice(accountId: string) {
  try {
    const previous = localStorage.getItem(LAST_ACCOUNT_KEY);
    if (previous && previous !== accountId) localStorage.removeItem(migrationStorageKey(accountId));
    localStorage.setItem(LAST_ACCOUNT_KEY, accountId);
  } catch {
    // Storage unavailable: keep the saved choice.
  }
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

function applyRecords(accountId: string, records: SyncRecord[], sent?: Map<string, string>, keepLocal: FurnitureProject[] = []) {
  rememberRemoteTombstones(accountId, records);
  let projects = projectsFromRecords(records);
  if (keepLocal.length) {
    // Too big to upload: this device's copy is the only current one, never replace it.
    const byId = new Map(projects.map((p) => [p.id, p]));
    for (const p of keepLocal) byId.set(p.id, p);
    projects = [...byId.values()].sort((a, b) => b.updatedAt - a.updatedAt);
  }
  if (sent) {
    const merged = keepInFlightEdits(sent, useProjectStore.getState().projects, projects);
    projects = merged.projects;
    // Local edits won: push them on the next tick.
    if (merged.keptLocal) setTimeout(() => scheduleSync(), 0);
  }
  useProjectStore.getState().replaceAllProjects(projects);
  if (projects.length === 0 && useAppStore.getState().currentView === 'editor') {
    useAppStore.getState().openHome('projects');
  }
}

/** PUT records in bodies under the Worker's 2 MB limit; with nothing to send, just read the server's list. */
async function uploadInBatches(token: string, records: SyncRecord[]): Promise<{ records: SyncRecord[]; tooLarge: SyncRecord[] }> {
  const { batches, tooLarge } = batchRecords(records);
  if (!batches.length) return { records: (await fetchRecords(token)).records, tooLarge };
  let response: SyncPushResponse = { records: [] };
  for (const batch of batches) response = await pushRecords(token, batch);
  return { records: response.records, tooLarge };
}

/** Returns the names of projects too big to upload (they stay on this device). */
async function pushLocal(token: string, accountId: string): Promise<string[]> {
  const projectStore = useProjectStore.getState();
  const claimed = claimStarterProjectId(projectStore.projects);
  const idsChanged = claimed.some((project, index) => project.id !== projectStore.projects[index]?.id);
  if (idsChanged) projectStore.replaceAllProjects(claimed);
  const projects = useProjectStore.getState().projects;
  // Remember exactly what we sent: edits made while the request is in flight
  // (e.g. the first move right after opening the app) must not be overwritten
  // by the server's echo of the older copy.
  const sent = new Map(projects.map((p) => [p.id, JSON.stringify(p)]));
  const records = recordsFromProjects(projects, mergedTombstones(accountId, loadTombstones()));
  // Upload only what changed since the last good sync (everything the first time).
  let result = await uploadInBatches(token, changedRecords(records, loadKnown(accountId)));
  // Anything the server has never seen goes up too (e.g. the saved versions were stale).
  const onServer = new Set(result.records.map((record) => record.id));
  const tooLargeIds = new Set(result.tooLarge.map((record) => record.id));
  const missing = records.filter((record) => !onServer.has(record.id) && !tooLargeIds.has(record.id));
  if (missing.length) {
    const again = await uploadInBatches(token, missing);
    result = { records: again.records, tooLarge: [...result.tooLarge, ...again.tooLarge] };
  }
  saveKnown(accountId, result.records);
  const tooLarge = result.tooLarge.flatMap((record) => (record.project ? [record.project] : []));
  applyRecords(accountId, result.records, sent, tooLarge);
  return tooLarge.map((project) => project.name);
}

function tooLargeNotice(names: string[]): string | null {
  if (!names.length) return null;
  if (names.length === 1) return `“${names[0]}” is too big to sync. It stays on this device.`;
  return `${names.length} projects are too big to sync. They stay on this device.`;
}

let syncTimer: number | null = null;
let sessionEpoch = 0;

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
  status: syncServerConfigured() ? 'loading' : 'signed-out',
  account: null,
  token: null,
  config: null,
  syncStatus: 'idle',
  lastSyncedAt: null,
  lastError: null,
  notice: null,
  serverConfigured: syncServerConfigured(),
  appleAvailable: appleSignInAvailable(),
  migration: 'needed',

  loadSession: async () => {
    const epoch = ++sessionEpoch;
    set({ appleAvailable: appleSignInAvailable() });
    if (!syncServerConfigured()) {
      set({
        status: 'signed-out',
        account: null,
        token: null,
        config: null,
        syncStatus: 'idle',
        lastError: null,
        serverConfigured: false,
      });
      return;
    }
    const stored = readStoredSession();
    try {
      const config = await fetchAuthConfig();
      if (epoch !== sessionEpoch) return;
      set({ config, serverConfigured: true });
    } catch (error) {
      if (epoch !== sessionEpoch) return;
      const message = errorMessage(error, 'Cloud sync is unreachable. Projects on this device are still here.');
      if (message === SYNC_SERVER_UNCONFIGURED) {
        set({
          status: 'signed-out',
          account: null,
          token: null,
          config: null,
          syncStatus: 'idle',
          lastError: null,
          serverConfigured: false,
        });
        return;
      }
      set({
        syncStatus: 'offline',
        lastError: message,
      });
    }

    if (epoch !== sessionEpoch) return;
    if (!stored) {
      set({ status: 'signed-out', account: null, token: null });
      return;
    }

    try {
      const { account } = await fetchMe(stored.token);
      if (epoch !== sessionEpoch) return;
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
      if (epoch !== sessionEpoch) return;
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
    const epoch = ++sessionEpoch;
    set({ syncStatus: 'syncing', lastError: null, notice: null });
    try {
      const credential = await authorizeWithApple();
      if (epoch !== sessionEpoch) return;
      await finishSignIn(set, get, credential.identityToken, credential.email, credential.displayName);
    } catch (error) {
      if (epoch !== sessionEpoch) return;
      const message = errorMessage(error, 'Sign in with Apple failed.');
      if (message === SYNC_SERVER_UNCONFIGURED) {
        set({ status: 'signed-out', serverConfigured: false, syncStatus: 'idle', lastError: null });
        return;
      }
      set({
        status: get().account ? 'signed-in' : 'signed-out',
        syncStatus: 'error',
        lastError: message,
      });
    }
  },

  signUp: async (username, password) => {
    const epoch = ++sessionEpoch;
    set({ syncStatus: 'syncing', lastError: null, notice: null });
    try {
      const auth = await signUpWithPassword(username, password);
      if (epoch !== sessionEpoch) return;
      await applySession(set, get, auth);
    } catch (error) {
      if (epoch !== sessionEpoch) return;
      refuseIfUnconfigured(set, error, 'Could not create the account.');
    }
  },

  signInPassword: async (username, password) => {
    const epoch = ++sessionEpoch;
    set({ syncStatus: 'syncing', lastError: null, notice: null });
    try {
      const auth = await signInWithPassword(username, password);
      if (epoch !== sessionEpoch) return;
      await applySession(set, get, auth);
    } catch (error) {
      if (epoch !== sessionEpoch) return;
      refuseIfUnconfigured(set, error, 'Could not sign in.');
    }
  },

  signInDev: async (displayName, email) => {
    const epoch = ++sessionEpoch;
    set({ syncStatus: 'syncing', lastError: null, notice: null });
    try {
      const token = createDevIdentityToken(email.trim(), displayName.trim());
      if (epoch !== sessionEpoch) return;
      await finishSignIn(set, get, token, email.trim(), displayName.trim());
    } catch (error) {
      if (epoch !== sessionEpoch) return;
      const message = errorMessage(error, 'Dev sign-in failed.');
      if (message === SYNC_SERVER_UNCONFIGURED) {
        set({ status: 'signed-out', serverConfigured: false, syncStatus: 'idle', lastError: null });
        return;
      }
      set({
        status: get().account ? 'signed-in' : 'signed-out',
        syncStatus: isOffline(error) ? 'offline' : 'error',
        lastError: message,
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
    set({ syncStatus: 'syncing', lastError: null, notice: null });
    // Apple accounts confirm with the Apple sheet; its one-time code lets the
    // Worker revoke Sign in with Apple for this app (appleid.apple.com/auth/revoke).
    let authorizationCode: string | undefined;
    if (account.provider === 'apple' && appleSignInAvailable()) {
      try {
        authorizationCode = (await authorizeWithApple()).authorizationCode;
      } catch (error) {
        if (isAppleCancel(error)) {
          set({ syncStatus: 'idle', notice: 'Account not deleted. Confirm with Apple to delete it.' });
          return;
        }
        // Apple sheet failed for another reason: still delete; the server skips revocation.
      }
    }
    try {
      const result = await deleteAccountRequest(token, authorizationCode);
      writeStoredSession(null);
      localStorage.removeItem(migrationStorageKey(account.id));
      localStorage.removeItem(`${KNOWN_PREFIX}${account.id}`);
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
      const tooLarge = await pushLocal(token, account.id);
      writeMigration(account.id, 'done');
      set({
        syncStatus: 'idle',
        lastSyncedAt: Date.now(),
        migration: 'done',
        lastError: null,
        ...(tooLarge.length ? { notice: tooLargeNotice(tooLarge) } : {}),
      });
    } catch (error) {
      set({
        syncStatus: isOffline(error) ? 'offline' : 'error',
        lastError: errorMessage(error, 'Sync failed.'),
      });
    }
  },
}));

function refuseIfUnconfigured(
  set: (partial: Partial<AccountState>) => void,
  error: unknown,
  fallback: string,
) {
  const message = errorMessage(error, fallback);
  if (message === SYNC_SERVER_UNCONFIGURED) {
    set({ status: 'signed-out', serverConfigured: false, syncStatus: 'idle', lastError: null });
    return;
  }
  set({
    status: 'signed-out',
    syncStatus: 'error',
    lastError: message,
  });
}

async function applySession(
  set: (partial: Partial<AccountState>) => void,
  get: () => AccountState,
  auth: AuthResponse & { error?: string },
) {
  // An older server answered some refusals with HTTP 200 and an error body.
  if (!auth || typeof auth.token !== 'string' || !auth.token || !auth.account?.id) {
    throw new Error(typeof auth?.error === 'string' && auth.error ? auth.error : SIGN_IN_INCOMPLETE);
  }
  const account = auth.account;
  writeStoredSession({ token: auth.token, account });
  noteAccountOnDevice(account.id);
  const migration = readMigration(account.id) ?? 'needed';
  set({
    status: 'signed-in',
    account,
    token: auth.token,
    migration,
    syncStatus: 'idle',
    lastError: null,
    notice: null,
    serverConfigured: true,
  });
  if (migration === 'done') await get().syncNow();
}

async function finishSignIn(
  set: (partial: Partial<AccountState>) => void,
  get: () => AccountState,
  identityToken: string,
  email?: string,
  displayName?: string,
) {
  const auth = await signInWithIdentity(identityToken, email, displayName);
  await applySession(set, get, auth);
}

setProjectPersistListener((event) => {
  if (event.type === 'restore') {
    // Restored from a backup: forget earlier deletes of these ids everywhere.
    const buckets = loadTombstones();
    let changed = false;
    for (const id of event.ids) {
      if (id in buckets.device) { delete buckets.device[id]; changed = true; }
      for (const account of Object.values(buckets.accounts)) {
        if (id in account) { delete account[id]; changed = true; }
      }
    }
    if (changed) saveTombstones(buckets);
  }
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
