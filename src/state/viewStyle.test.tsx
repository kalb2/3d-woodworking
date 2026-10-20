// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render } from '@testing-library/react';

vi.mock('../native/wallScan', () => ({ isWallScanSupported: () => Promise.resolve(false), scanWalls: vi.fn() }));

const { useProjectStore } = await import('./useProjectStore');
const { useAppStore } = await import('./useAppStore');
const { projectStyle } = await import('./viewStyle');
const { ProjectSection } = await import('../components/properties/ProjectSection');
const { importProjectFromJSON } = await import('../utils/exportUtils');
const { sharePayloadString } = await import('../utils/share');

const PROJECTS_KEY = 'ipad_3d_furniture_projects_v1';
const PREFS_KEY = 'ipad_3d_furniture_app_prefs_v1';
const s = () => useProjectStore.getState();
const active = () => s().projects.find((p) => p.id === s().activeProjectId)!;
const saved = () => JSON.parse(localStorage.getItem(PROJECTS_KEY) || '[]') as { id: string; viewStyle?: string }[];
const legacy = (id: string) => ({
  id, name: id, createdAt: 1, updatedAt: 1, unit: 'in', objects: [],
  snapSettings: { enabled: true, faceSnap: true, gridSnap: true, gridSize: 0.5, floorCollision: true }, showFloor: true, floorOpacity: 0.4,
});

let clock = Date.now();
beforeEach(() => {
  // Project ids come from Date.now(); keep them distinct within a test.
  vi.spyOn(Date, 'now').mockImplementation(() => (clock += 7));
  localStorage.clear();
  useAppStore.setState((st) => ({ preferences: { ...st.preferences, viewStyle: 'realistic' } }));
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('Render style per project', () => {
  it('is saved with the project and survives a reload', () => {
    s().createProject('A', 'in');
    s().setViewStyle('clean');
    expect(active().viewStyle).toBe('clean');
    expect(saved().find((p) => p.id === active().id)!.viewStyle).toBe('clean');
    const before = active().updatedAt;
    s().setViewStyle('realistic');
    expect(active().updatedAt).toBeGreaterThanOrEqual(before); // bumps updatedAt so sync picks it up
    s().setViewStyle('clean');
    const id = active().id;
    s().loadProjects();
    expect(projectStyle(s().projects.find((p) => p.id === id))).toBe('clean');
  });

  it('old projects without a style keep the old app-wide style', () => {
    localStorage.setItem(PREFS_KEY, JSON.stringify({ viewStyle: 'clean' }));
    localStorage.setItem(PROJECTS_KEY, JSON.stringify([legacy('old1'), legacy('old2')]));
    s().loadProjects();
    expect(s().projects.map((p) => p.viewStyle)).toEqual(['clean', 'clean']);
    expect(saved().map((p) => p.viewStyle)).toEqual(['clean', 'clean']);
  });

  it('old projects with no saved app setting are Realistic (the old default)', () => {
    localStorage.setItem(PROJECTS_KEY, JSON.stringify([legacy('old')]));
    s().loadProjects();
    expect(active().viewStyle).toBe('realistic');
  });

  it('switching projects applies that project\'s style; the Project tab shows it', () => {
    s().createProject('Clean one', 'in');
    const a = active().id;
    s().setViewStyle('clean');
    s().createProject('Real one', 'in');
    const b = active().id;
    s().setViewStyle('realistic');
    const r = render(<ProjectSection />);
    expect(r.getByTestId('style-realistic').getAttribute('aria-pressed')).toBe('true');
    act(() => s().switchProject(a));
    expect(projectStyle(active())).toBe('clean');
    expect(r.getByTestId('style-clean').getAttribute('aria-pressed')).toBe('true');
    act(() => s().switchProject(b));
    expect(r.getByTestId('style-realistic').getAttribute('aria-pressed')).toBe('true');
  });

  it('the Project tab toggle changes only this project and becomes the style for new projects', () => {
    s().createProject('Other', 'in');
    const other = active().id;
    s().createProject('Mine', 'in');
    const r = render(<ProjectSection />);
    fireEvent.click(r.getByTestId('style-clean'));
    expect(active().viewStyle).toBe('clean');
    expect(s().projects.find((p) => p.id === other)!.viewStyle).toBe('realistic');
    expect(useAppStore.getState().preferences.viewStyle).toBe('clean');
    act(() => s().createProject('Next', 'in'));
    expect(active().viewStyle).toBe('clean');
    expect(s().createProjectFromTemplate('nope')).toBe(false);
  });

  it('export → import keeps the style; files without one get the new-project style', () => {
    s().createProject('Exported', 'in');
    s().setViewStyle('clean');
    const back = importProjectFromJSON(sharePayloadString(active()))!;
    expect(back.viewStyle).toBe('clean');
    s().importProject(back);
    expect(active().viewStyle).toBe('clean');
    const old = importProjectFromJSON(JSON.stringify({ project: legacy('file') }))!;
    expect(old.viewStyle).toBeUndefined();
    localStorage.setItem(PREFS_KEY, JSON.stringify({ viewStyle: 'clean' }));
    s().importProject(old);
    expect(active().viewStyle).toBe('clean');
  });

  it('a synced copy carries the style', () => {
    s().createProject('Synced', 'in');
    const id = active().id;
    s().replaceAllProjects(s().projects.map((p) => (p.id === id ? { ...p, viewStyle: 'clean' as const, updatedAt: p.updatedAt + 1 } : p)));
    expect(active().viewStyle).toBe('clean');
  });
});
