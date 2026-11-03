// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { PROJECTS_CORRUPT_KEY, PROJECTS_STORAGE_KEY, useProjectStore } from './useProjectStore';

describe('corrupt project storage', () => {
  beforeEach(() => {
    localStorage.removeItem(PROJECTS_STORAGE_KEY);
    localStorage.removeItem(PROJECTS_CORRUPT_KEY);
  });

  it('keeps an unreadable file so the next save does not throw the only copy away', () => {
    localStorage.setItem(PROJECTS_STORAGE_KEY, '{not json');
    useProjectStore.getState().loadProjects();
    expect(localStorage.getItem(PROJECTS_CORRUPT_KEY)).toBe('{not json');
    expect(localStorage.getItem(PROJECTS_STORAGE_KEY)).toBe('{not json');
    useProjectStore.getState().saveCurrentProject();
    expect(localStorage.getItem(PROJECTS_CORRUPT_KEY)).toBe('{not json');
    const saved = JSON.parse(localStorage.getItem(PROJECTS_STORAGE_KEY)!);
    expect(Array.isArray(saved)).toBe(true);
  });
});
