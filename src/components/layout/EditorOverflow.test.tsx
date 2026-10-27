// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render } from '@testing-library/react';

const saveFile = vi.fn(async (..._a: unknown[]) => 'shared' as const);
vi.mock('../../native/fileExport', async (orig) => ({ ...(await orig<object>()), saveFile: (...a: unknown[]) => saveFile(...a) }));

const exportDesignFile = vi.fn(async (..._a: unknown[]) => 'shared' as const);
vi.mock('../../utils/modelExport', () => ({
  exportDesignFile: (...a: unknown[]) => exportDesignFile(...a),
  designParts: (project: { objects: { visible?: boolean; shape: string; generator?: string; reference?: boolean }[] }) =>
    project.objects.filter((o) => o.visible !== false && o.shape !== 'group' && o.generator !== 'room-scan' && !o.reference),
}));

const exportBuildPlans = vi.fn(async (..._a: unknown[]) => 'shared' as const);
vi.mock('../../plans/exportPlans', () => ({ exportBuildPlans: (...a: unknown[]) => exportBuildPlans(...a) }));

afterEach(() => { cleanup(); saveFile.mockClear(); exportDesignFile.mockClear(); exportBuildPlans.mockClear(); });

const { useProjectStore } = await import('../../state/useProjectStore');
const { EditorOverflowList } = await import('./EditorOverflow');
const s = () => useProjectStore.getState();

describe('••• project files', () => {
  it('Back up all projects saves one backup file with every project into Backups', async () => {
    act(() => { s().createProject('Desk', 'in'); s().createProject('Shelf', 'in'); });
    const onClose = vi.fn();
    const r = render(<EditorOverflowList onOpenCutList={() => {}} onShareProject={() => {}} onClose={onClose} />);
    fireEvent.click(r.getByTestId('menu-backup'));
    await act(async () => {});
    expect(saveFile).toHaveBeenCalledTimes(1);
    const [name, text, mime, opts] = saveFile.mock.calls[0] as [string, string, string, { folder: string }];
    expect(name).toMatch(/^Workbench backup \d{4}-\d{2}-\d{2}\.json$/);
    expect(mime).toBe('application/json');
    expect(opts.folder).toBe('Backups');
    const parsed = JSON.parse(text);
    expect(parsed.kind).toBe('workbench-backup');
    expect(parsed.projects.map((p: { name: string }) => p.name)).toEqual(expect.arrayContaining(['Desk', 'Shelf']));
    expect(parsed.projects).toHaveLength(s().projects.length);
    expect(onClose).toHaveBeenCalled();
  });

  it('Export project file saves the open project as <name>.json', async () => {
    act(() => s().createProject('Bench', 'in'));
    const r = render(<EditorOverflowList onOpenCutList={() => {}} onShareProject={() => {}} onClose={() => {}} />);
    fireEvent.click(r.getByTestId('menu-export-json'));
    await act(async () => {});
    const [name, text] = saveFile.mock.calls[0] as [string, string];
    expect(name).toBe('Bench.json');
    expect(JSON.parse(text)).toMatchObject({ kind: 'workbench-share', project: { name: 'Bench' } });
  });

  it('Snapshot image saves the canvas as a base64 PNG', async () => {
    act(() => s().createProject('Bench', 'in'));
    const canvas = document.createElement('canvas');
    canvas.toDataURL = () => 'data:image/png;base64,iVBORw0KGgo=';
    document.body.appendChild(canvas);
    const r = render(<EditorOverflowList onOpenCutList={() => {}} onShareProject={() => {}} onClose={() => {}} />);
    fireEvent.click(r.getByTestId('menu-export-png'));
    await act(async () => {});
    expect(saveFile).toHaveBeenCalledWith('Bench snapshot.png', 'iVBORw0KGgo=', 'image/png', expect.objectContaining({ base64: true }));
    canvas.remove();
  });
});

describe('••• 3D model', () => {
  it('exports the open project as USDZ or GLB', () => {
    act(() => s().createProject('Bench', 'in'));
    const project = s().projects.find((p) => p.id === s().activeProjectId);
    const onClose = vi.fn();
    const r = render(<EditorOverflowList onOpenCutList={() => {}} onShareProject={() => {}} onClose={onClose} />);
    fireEvent.click(r.getByTestId('menu-export-usdz'));
    fireEvent.click(r.getByTestId('menu-export-glb'));
    expect(exportDesignFile).toHaveBeenNthCalledWith(1, project, 'usdz');
    expect(exportDesignFile).toHaveBeenNthCalledWith(2, project, 'glb');
    expect(onClose).toHaveBeenCalledTimes(2);
    expect(r.getByText('Export 3D model (USDZ)')).toBeTruthy();
    expect(r.getByText('Export 3D model (GLB)')).toBeTruthy();
  });

  it('does not export when the project has no parts', () => {
    act(() => s().createProject('Bare', 'in'));
    const id = s().activeProjectId;
    act(() => useProjectStore.setState({
      projects: s().projects.map((p) => (p.id === id ? { ...p, objects: [] } : p)),
    }));
    const alert = vi.spyOn(window, 'alert').mockImplementation(() => {});
    const r = render(<EditorOverflowList onOpenCutList={() => {}} onShareProject={() => {}} onClose={() => {}} />);
    fireEvent.click(r.getByTestId('menu-export-glb'));
    expect(exportDesignFile).not.toHaveBeenCalled();
    expect(alert).toHaveBeenCalledWith('Nothing to export yet.');
    alert.mockRestore();
  });
});

describe('••• build plans', () => {
  it('loads the plans module on tap and exports the open project', async () => {
    act(() => s().createProject('Bench', 'in'));
    const project = s().projects.find((p) => p.id === s().activeProjectId);
    const onClose = vi.fn();
    const r = render(<EditorOverflowList onOpenCutList={() => {}} onShareProject={() => {}} onClose={onClose} />);
    expect(r.getByText('Build plans (PDF)')).toBeTruthy();
    fireEvent.click(r.getByTestId('menu-export-plans'));
    expect(onClose).toHaveBeenCalledTimes(1);
    await vi.waitFor(() => expect(exportBuildPlans).toHaveBeenCalledWith(project));
  });

  it('says so instead of exporting an empty project', () => {
    act(() => s().createProject('Bare', 'in'));
    const id = s().activeProjectId;
    act(() => useProjectStore.setState({ projects: s().projects.map((p) => (p.id === id ? { ...p, objects: [] } : p)) }));
    const alert = vi.spyOn(window, 'alert').mockImplementation(() => {});
    const r = render(<EditorOverflowList onOpenCutList={() => {}} onShareProject={() => {}} onClose={() => {}} />);
    fireEvent.click(r.getByTestId('menu-export-plans'));
    expect(exportBuildPlans).not.toHaveBeenCalled();
    expect(alert).toHaveBeenCalledWith('Nothing to export yet.');
    alert.mockRestore();
  });
});

describe('addProjects', () => {
  it('adds restored projects without switching and persists them', () => {
    act(() => s().createProject('Open one', 'in'));
    const active = s().activeProjectId;
    const before = s().projects.length;
    const restored = { ...s().projects[0], id: 'restored_1', name: 'Restored' };
    act(() => s().addProjects([restored]));
    expect(s().projects).toHaveLength(before + 1);
    expect(s().activeProjectId).toBe(active);
    const saved = JSON.parse(localStorage.getItem(Object.keys(localStorage).find((k) => localStorage.getItem(k)?.includes('restored_1'))!)!);
    expect(saved.some((p: { id: string }) => p.id === 'restored_1')).toBe(true);
  });
});
