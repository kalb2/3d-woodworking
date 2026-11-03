import { afterEach, describe, expect, it, vi } from 'vitest';
import { newId, randomToken } from './ids';

describe('newId', () => {
  afterEach(() => { vi.unstubAllGlobals(); });

  it('keeps the prefix and never repeats in a large batch', () => {
    const ids = Array.from({ length: 5000 }, () => newId('obj'));
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.every((id) => id.startsWith('obj_'))).toBe(true);
  });

  it('falls back to getRandomValues without randomUUID', () => {
    vi.stubGlobal('crypto', { getRandomValues: (a: Uint8Array) => { for (let i = 0; i < a.length; i++) a[i] = (i * 37 + 11) & 255; return a; } });
    expect(randomToken()).toMatch(/^[0-9a-f]{32}$/);
  });

  it('still makes distinct ids with no crypto at all', () => {
    vi.stubGlobal('crypto', undefined);
    const ids = Array.from({ length: 1000 }, () => randomToken());
    expect(new Set(ids).size).toBe(ids.length);
  });
});
