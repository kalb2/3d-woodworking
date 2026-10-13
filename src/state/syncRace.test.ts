import { describe, expect, it, vi } from 'vitest';
import type { SyncRecord } from '../sync/types';

const mem = new Map<string, string>();
(globalThis as unknown as { localStorage: Storage }).localStorage ??= {
  getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => { mem.set(k, v); },
  removeItem: (k: string) => { mem.delete(k); }, clear: () => mem.clear(), key: () => null, length: 0,
} as Storage;
(globalThis as unknown as { window: unknown }).window ??= globalThis;

// The server echoes what it was sent, but only after we "release" it, so the
// test can edit while the push is in flight (like the first drag after launch).
let release: (() => void) | null = null;
vi.mock('../sync/client.ts', async (orig) => ({
  ...(await orig<typeof import('../sync/client.ts')>()),
  pushRecords: (_t: string, records: SyncRecord[]) => new Promise((resolve) => {
    const echo = JSON.parse(JSON.stringify(records));
    release = () => resolve({ records: echo });
  }),
}));

const { useProjectStore } = await import('./useProjectStore');
const { useAccountStore } = await import('./useAccountStore');
const { keepInFlightEdits } = await import('../sync/merge');
const s = () => useProjectStore.getState();
const proj = () => s().projects.find((p) => p.id === s().activeProjectId)!;

describe('sync never reverts an edit made while a push is in flight', () => {
  it('first move after launch survives the sync response', async () => {
    s().createProject('Race', 'in');
    s().addObject('cube');
    const id = proj().objects[proj().objects.length - 1].id;
    useAccountStore.setState({ token: 't', account: { id: 'acct' } as never, status: 'signed-in', migration: 'done' });

    const syncing = useAccountStore.getState().syncNow(); // launch sync, request in flight
    await Promise.resolve();
    // Kaleb drags the part and lets go before the response lands.
    s().updateObject(id, { position: { x: 30, y: proj().objects.find((o) => o.id === id)!.position.y, z: 12 } }, true);
    s().pushHistoryState();
    const historyBefore = s().historyStack.length;
    release!();
    await syncing;

    const moved = proj().objects.find((o) => o.id === id)!;
    expect(moved.position.x).toBe(30);
    expect(moved.position.z).toBe(12);
    // Undo history isn't wiped by the sync either.
    expect(s().historyStack.length).toBe(historyBefore);
  });

  it('an unchanged sync echo keeps history and selection', async () => {
    s().createProject('Echo', 'in');
    s().addObject('cube');
    const sel = s().selectedObjectId;
    const h = s().historyStack.length;
    const syncing = useAccountStore.getState().syncNow();
    await Promise.resolve();
    release!();
    await syncing;
    expect(s().historyStack.length).toBe(h);
    expect(s().selectedObjectId).toBe(sel);
  });

  it('keepInFlightEdits: server copy wins only for untouched projects', () => {
    const a = { id: 'a', updatedAt: 1, name: 'A' } as never;
    const b = { id: 'b', updatedAt: 1, name: 'B' } as never;
    const sent = new Map([['a', JSON.stringify(a)], ['b', JSON.stringify(b)]]);
    const localB = { id: 'b', updatedAt: 2, name: 'B moved' } as never;
    const serverA = { id: 'a', updatedAt: 3, name: 'A from phone' } as never;
    const out = keepInFlightEdits(sent, [a, localB], [serverA, b]);
    expect(out.keptLocal).toBe(true);
    expect(out.projects.find((p) => p.id === 'a')!.name).toBe('A from phone');
    expect(out.projects.find((p) => p.id === 'b')!.name).toBe('B moved');
  });
});
