// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { act, cleanup, render } from '@testing-library/react';

afterEach(cleanup);
window.matchMedia ??= ((q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, onchange: null, dispatchEvent: () => false })) as unknown as typeof window.matchMedia;

const { useProjectStore } = await import('../../state/useProjectStore');
const { useAppStore } = await import('../../state/useAppStore');
const { UndoRedoButtons } = await import('./UndoRedoButtons');
const { ResizeSizeRow, MoveFloorRow } = await import('./SizeBar');
const { PhoneBottomSheet } = await import('./PhoneCanvasChrome');
const { countLabel } = await import('../../utils/countLabel');
const { clusterLabel } = await import('../../joinery/tagClusters');
const s = () => useProjectStore.getState();

describe('undo / redo show only when they can act', () => {
  it('no dimmed ghost buttons; Undo keeps its slot when only Redo shows', () => {
    s().createProject('Undo', 'in');
    const r = render(<UndoRedoButtons placement="inline" />);
    // Fresh project: nothing to undo or redo, so nothing shows.
    expect(r.queryByTestId('undo-redo')).toBeNull();
    act(() => { s().addObject('board'); });
    expect(r.getByTestId('undo-btn')).toBeTruthy();
    expect(r.queryByTestId('redo-btn')).toBeNull();
    while (s().historyIndex > 0) act(() => s().undo());
    expect(r.queryByTestId('undo-btn')).toBeNull();
    expect(r.getByTestId('undo-slot').getAttribute('aria-hidden')).toBe('true');
    expect(r.getByTestId('redo-btn')).toBeTruthy();
    act(() => s().redo());
    expect(r.getByTestId('undo-btn')).toBeTruthy();
    expect(r.queryByTestId('undo-slot')).toBeNull();
    expect(r.container.querySelector('button:disabled')).toBeNull();
  });
});

describe('count labels', () => {
  it('pluralize correctly', () => {
    expect(countLabel(0, 'part')).toBe('0 parts');
    expect(countLabel(1, 'part')).toBe('1 part');
    expect(countLabel(2, 'part')).toBe('2 parts');
    expect(clusterLabel(['fits'])).toBe('1 joint');
  });
});

describe('size field screen-reader labels', () => {
  it('read "Length, inches" and "Length, millimeters"', () => {
    s().createProject('Labels in', 'in');
    act(() => { s().addObject('board'); });
    const id = s().projects.find((p) => p.id === s().activeProjectId)!.objects.slice(-1)[0].id;
    act(() => { s().selectObject(id); s().setGizmoMode('resize'); });
    let r = render(<ResizeSizeRow />);
    expect(r.getByTestId('size-x').getAttribute('aria-label')).toBe('Length, inches');
    expect(r.getByTestId('size-y').getAttribute('aria-label')).toBe('Height, inches');
    expect(r.getByTestId('size-z').getAttribute('aria-label')).toBe('Width, inches');
    cleanup();
    s().createProject('Labels mm', 'mm');
    act(() => { s().addObject('board'); });
    const mmId = s().projects.find((p) => p.id === s().activeProjectId)!.objects.slice(-1)[0].id;
    act(() => { s().selectObject(mmId); s().setGizmoMode('resize'); });
    r = render(<ResizeSizeRow />);
    expect(r.getByTestId('size-x').getAttribute('aria-label')).toBe('Length, millimeters');
    act(() => s().setGizmoMode('move'));
    cleanup();
    r = render(<MoveFloorRow />);
    expect(r.getByTestId('floor-distance-input').getAttribute('aria-label')).toBe('Distance from the floor, millimeters');
    expect(r.getByTestId('floor-distance-drag').getAttribute('aria-label')).toBe('Drag distance from the floor, millimeters');
  });
});

describe('phone dock while Add is open', () => {
  it('hides the Move/Resize/Floor bar, and brings it back on close', () => {
    s().createProject('Add dock', 'in');
    act(() => { s().addObject('board'); });
    const id = s().projects.find((p) => p.id === s().activeProjectId)!.objects.slice(-1)[0].id;
    act(() => { s().selectObject(id); s().setGizmoMode('move'); });
    act(() => useAppStore.getState().dismissOverlays());
    const r = render(<PhoneBottomSheet />);
    expect(r.queryByTestId('transform-menu')).toBeTruthy();
    expect(r.queryByTestId('floor-distance')).toBeTruthy();
    act(() => useAppStore.getState().openOverlay('sidebar'));
    expect(r.queryByTestId('transform-menu')).toBeNull();
    expect(r.queryByTestId('floor-distance')).toBeNull();
    act(() => useAppStore.getState().setOverlayOpen('sidebar', false));
    expect(r.queryByTestId('transform-menu')).toBeTruthy();
  });
});
