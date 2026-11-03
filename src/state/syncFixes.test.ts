import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { FurnitureProject, SnapSettings } from '../types/furniture';
import type { AuthResponse, SyncRecord } from '../sync/types';

const mem = new Map<string, string>();
(globalThis as unknown as { localStorage: Storage }).localStorage ??= {
  getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => { mem.set(k, v); },
  removeItem: (k: string) => { mem.delete(k); }, clear: () => mem.clear(), key: () => null, length: 0,
} as Storage;
(globalThis as unknown as { window: unknown }).window ??= globalThis;

// A small in-memory server with the Worker's last-write-wins merge.
const server = new Map<string, SyncRecord>();
const copy = <T,>(v: T): T => JSON.parse(JSON.stringify(v));
const pushRecords = vi.fn(async (_t: string, records: SyncRecord[]) => {
  if (JSON.stringify({ records }).length > 2_000_000) throw new Error('Too much data in one sync.');
  for (const r of copy(records)) {
    const prev = server.get(r.id);
    if (!prev || r.updatedAt >= prev.updatedAt) server.set(r.id, r);
  }
  return { records: copy([...server.values()]) };
});
const fetchRecords = vi.fn(async (_t: string) => ({ records: copy([...server.values()]) }));
const signInWithPassword = vi.fn(async (_u: string, _p: string): Promise<AuthResponse> => ({ token: 't', account: account('acct') }));

vi.mock('../sync/client.ts', async (orig) => ({
  ...(await orig<typeof import('../sync/client.ts')>()),
  pushRecords: (t: string, r: SyncRecord[]) => pushRecords(t, r),
  fetchRecords: (t: string) => fetchRecords(t),
  signInWithPassword: (u: string, p: string) => signInWithPassword(u, p),
  signOutRequest: async () => ({ ok: true }),
}));

const { useProjectStore } = await import('./useProjectStore');
const { useAccountStore, SIGN_IN_INCOMPLETE } = await import('./useAccountStore');
const { backupFileText, openProjectFile } = await import('../utils/projectFile');
const { readStoredSession } = await import('../sync/client');
const ps = () => useProjectStore.getState();
const as = () => useAccountStore.getState();

function account(id: string) {
  return { id, appleSub: `name:${id}`, email: '', username: id, displayName: id, provider: 'password' as const, createdAt: 1 };
}
const snap: SnapSettings = { enabled: true, faceSnap: true, gridSnap: true, gridSize: 0.5, floorCollision: true } as SnapSettings;
function project(id: string, name = id, updatedAt = 1000): FurnitureProject {
  return { id, name, createdAt: 1, updatedAt, unit: 'in', snapSettings: snap, showFloor: true, floorOpacity: 0.4, objects: [
    { id: `${id}-part`, name: 'Side', shape: 'cube', dimensions: { length: 2, width: 2, height: 2 }, position: { x: 0, y: 1, z: 0 }, rotation: { x: 0, y: 0, z: 0 }, material: {} as never },
  ] } as FurnitureProject;
}
function signedIn(id = 'acct') {
  useAccountStore.setState({ token: 't', account: account(id), status: 'signed-in', migration: 'done', notice: null, lastError: null });
}

beforeEach(() => {
  mem.clear();
  server.clear();
  pushRecords.mockClear();
  fetchRecords.mockClear();
  useProjectStore.setState({ projects: [project('keep'), project('gone')], activeProjectId: 'keep', saveError: null });
  useAccountStore.setState({ token: null, account: null, status: 'signed-out', migration: 'needed', notice: null, lastError: null });
});

describe('restoring a backup', () => {
  it('a restored project stays after the next sync (the old delete no longer wins)', async () => {
    signedIn();
    await as().syncNow();
    const backup = backupFileText(ps().projects);

    ps().deleteProject('gone');
    await as().syncNow();
    expect(server.get('gone')?.deletedAt).toBeTypeOf('number');
    expect(ps().projects.map((p) => p.id)).toEqual(['keep']);

    const opened = openProjectFile(backup, ps().projects)!;
    expect(opened.projects.map((p) => p.id)).toEqual(['gone']);
    ps().addProjects(opened.projects);
    expect(mem.get('workbench_tombstones_v1')).not.toContain('"gone"');
    await as().syncNow();

    expect(ps().projects.map((p) => p.id).sort()).toEqual(['gone', 'keep']);
    expect(server.get('gone')?.project?.name).toBe('gone');
    // And again: another sync (e.g. on another launch) doesn't delete it.
    await as().syncNow();
    expect(ps().projects.map((p) => p.id).sort()).toEqual(['gone', 'keep']);
  });

  it('restoring the same backup twice adds nothing the second time', () => {
    const backup = backupFileText(ps().projects);
    ps().deleteProject('gone');
    ps().addProjects(openProjectFile(backup, ps().projects)!.projects);
    const again = openProjectFile(backup, ps().projects)!;
    expect(again.projects).toEqual([]);
  });
});

describe('sync uploads only what changed', () => {
  it('first sync sends everything; an unchanged sync sends nothing; an edit sends one project', async () => {
    signedIn();
    await as().syncNow();
    expect(pushRecords).toHaveBeenCalledTimes(1);
    expect(pushRecords.mock.calls[0][1]).toHaveLength(2);

    await as().syncNow();
    expect(pushRecords).toHaveBeenCalledTimes(1);
    expect(fetchRecords).toHaveBeenCalledTimes(1);

    ps().renameProject('keep', 'Renamed'); // the open project
    await as().syncNow();
    expect(pushRecords).toHaveBeenCalledTimes(2);
    expect(pushRecords.mock.calls[1][1].map((r) => r.id)).toEqual(['keep']);
    expect(server.get('keep')?.project?.name).toBe('Renamed');
  });

  it('a project the server lost is uploaded again', async () => {
    signedIn();
    await as().syncNow();
    server.delete('keep');
    await as().syncNow();
    expect(server.get('keep')?.project?.name).toBe('keep');
  });

  it('many big projects go up in several requests under 2 MB; one too big stays on this device', async () => {
    const big = (id: string, size: number) => ({ ...project(id), name: `${id}-${'x'.repeat(size)}` });
    useProjectStore.setState({ projects: [big('a', 700_000), big('b', 700_000), big('c', 700_000), big('huge', 2_100_000)], activeProjectId: 'a' });
    signedIn();
    await as().syncNow();
    expect(as().lastError).toBeNull();
    expect(pushRecords.mock.calls.length).toBeGreaterThanOrEqual(2);
    expect([...server.keys()].sort()).toEqual(['a', 'b', 'c']);
    expect(ps().projects.map((p) => p.id).sort()).toEqual(['a', 'b', 'c', 'huge']);
    expect(as().notice).toMatch(/too big to sync/);
  });
});

describe('sign-in needs a real session', () => {
  it('an error body without a token (old server: HTTP 200) is shown, not treated as signed in', async () => {
    signInWithPassword.mockResolvedValueOnce({ error: 'Apple didn’t share an email.' } as never);
    await as().signInPassword('k', 'pw');
    expect(as().status).toBe('signed-out');
    expect(as().lastError).toBe('Apple didn’t share an email.');
    expect(readStoredSession()).toBeNull();
  });

  it('an empty answer gets a friendly message', async () => {
    signInWithPassword.mockResolvedValueOnce({} as never);
    await as().signInPassword('k', 'pw');
    expect(as().lastError).toBe(SIGN_IN_INCOMPLETE);
  });
});

describe('switching accounts on one device', () => {
  it('asks before the next account gets the previous account’s projects', async () => {
    signInWithPassword.mockResolvedValueOnce({ token: 'ta', account: account('A') });
    await as().signInPassword('A', 'pw');
    expect(as().migration).toBe('needed');
    await as().saveAndSync();
    expect(server.size).toBe(2);
    await as().signOut();

    // B had synced on this device before, but A was the last one here.
    mem.set('workbench_migration_v1:B', 'done');
    server.clear();
    pushRecords.mockClear();
    signInWithPassword.mockResolvedValueOnce({ token: 'tb', account: account('B') });
    await as().signInPassword('B', 'pw');
    expect(as().migration).toBe('needed'); // the "Save this device to your account?" prompt
    expect(pushRecords).not.toHaveBeenCalled();
    expect(server.size).toBe(0);
  });

  it('the same account signing back in syncs as before', async () => {
    signInWithPassword.mockResolvedValueOnce({ token: 'ta', account: account('A') });
    await as().signInPassword('A', 'pw');
    await as().saveAndSync();
    await as().signOut();
    pushRecords.mockClear();
    fetchRecords.mockClear();
    signInWithPassword.mockResolvedValueOnce({ token: 'ta2', account: account('A') });
    await as().signInPassword('A', 'pw');
    expect(as().migration).toBe('done');
    expect(fetchRecords.mock.calls.length + pushRecords.mock.calls.length).toBeGreaterThan(0);
  });
});
