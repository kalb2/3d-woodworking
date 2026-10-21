// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { act, cleanup, fireEvent, render } from '@testing-library/react';
import type { FurnitureObject } from '../types/furniture';

afterEach(cleanup);

const { useProjectStore } = await import('../state/useProjectStore');
const { useMeasure } = await import('./useMeasure');
const { MeasureAimGuide, MeasureBar } = await import('./MeasureBar');
const { measureHint, snapMeasurePoint, snapPhrase } = await import('../utils/measure');

const s = () => useProjectStore.getState();
const m = () => useMeasure.getState();
const proj = () => s().projects.find((p) => p.id === s().activeProjectId)!;
const mat = { id: 'plywood', name: 'Plywood', species: 'plywood', baseColor: '#000', secondaryColor: '#000', grainIntensity: 0, grainScale: 1, roughness: 1, metalness: 0, varnishSheen: 'matte' } as FurnitureObject['material'];
const box: FurnitureObject = { id: 'b', name: 'b', shape: 'cube', dimensions: { length: 24, height: 10, width: 12 }, position: { x: 0, y: 5, z: 0 }, rotation: { x: 0, y: 0, z: 0 }, material: mat };
const corner = { x: 0, y: 0, z: 0, kind: 'vertex' as const };

describe('snapping names what it found', () => {
  it('snaps anywhere along an edge, named Edge', () => {
    expect(snapMeasurePoint({ x: 6, y: 9.8, z: 6 }, box, 1)).toMatchObject({ x: 6, y: 10, z: 6, kind: 'edge' });
  });
  it('works on a turned part such as a scanned wall', () => {
    const wall: FurnitureObject = { ...box, id: 'w', generator: 'room-scan', dimensions: { length: 120, height: 96, width: 4 }, position: { x: 0, y: 48, z: 0 }, rotation: { x: 0, y: 90, z: 0 } };
    const p = snapMeasurePoint({ x: 2, y: 95.7, z: 59.7 }, wall, 1);
    expect(p.kind).toBe('vertex');
    expect([Math.abs(p.x), p.y, Math.abs(p.z)].map((n) => Math.round(n))).toEqual([2, 96, 60]);
  });
  it('hint phrases', () => {
    expect(snapPhrase('vertex')).toBe('Snapped to corner');
    expect(snapPhrase('midpoint')).toBe('Snapped to edge middle');
    expect(snapPhrase('edge')).toBe('Snapped to edge');
    expect(snapPhrase('face')).toBe('Snapped to face center');
    expect(snapPhrase('surface')).toBe('On the surface (no snap)');
  });
  it('steps: first point, second point with the live distance, then the result', () => {
    expect(measureHint(null, null, null, 'in')).toMatchObject({ step: 'Step 1 of 2', title: 'Tap the first point' });
    expect(measureHint(null, null, corner, 'in').detail).toBe('Snapped to corner. Lift to place it.');
    const h = measureHint(corner, null, { x: 23.25, y: 0, z: 0, kind: 'edge' }, 'in');
    expect(h).toMatchObject({ step: 'Step 2 of 2', title: 'Tap the second point', detail: 'Snapped to edge · 23 1/4 in. Lift to place it.' });
    expect(measureHint(corner, { x: 30.5, y: 0, z: 0, kind: 'face' }, null, 'ft').title).toBe(`2' 6 1/2"`);
  });
});

describe('Tape measure banner', () => {
  it('walks the steps, names the snap, then offers Pin it / Measure again / Done', () => {
    s().createProject('Tape', 'in');
    act(() => m().start());
    const r = render(<MeasureBar />);
    expect(r.getByTestId('measure-step').textContent).toBe('Step 1 of 2');
    expect(r.getByTestId('measure-label').textContent).toBe('Tap the first point');
    expect(r.queryByTestId('measure-pin')).toBeNull();
    act(() => m().setHover(corner));
    expect(r.getByTestId('measure-detail').textContent).toBe('Snapped to corner. Lift to place it.');
    act(() => m().place(corner));
    expect(r.getByTestId('measure-label').textContent).toBe('Tap the second point');
    act(() => m().place({ x: 0, y: 0, z: 23.25, kind: 'midpoint' }));
    expect(r.getByTestId('measure-step').textContent).toBe('Result');
    expect(r.getByTestId('measure-label').textContent).toBe('23 1/4 in');
    expect(['measure-pin', 'measure-again', 'measure-done'].map((t) => r.getByTestId(t).textContent)).toEqual(['Pin it', 'Measure again', 'Done']);
    fireEvent.click(r.getByTestId('measure-pin'));
    expect(proj().measurements).toHaveLength(1);
    expect(m().a).toBeNull();
    expect(r.getByTestId('measure-label').textContent).toBe('Tap the first point');
    fireEvent.click(r.getByTestId('measure-done'));
    expect(m().active).toBe(false);
    expect(r.queryByTestId('measure-bar')).toBeNull();
    expect(proj().measurements).toHaveLength(1); // saved dimension stays
  });

  it('Measure again clears the result without pinning', () => {
    act(() => { m().start(); m().place(corner); m().place({ x: 1, y: 0, z: 0, kind: 'face' }); });
    const r = render(<MeasureBar />);
    fireEvent.click(r.getByTestId('measure-again'));
    expect([m().a, m().b]).toEqual([null, null]);
  });

  it('touch aiming guide draws the ring above the finger and goes away on place', () => {
    act(() => { m().start(); m().setAim({ fx: 100, fy: 300, x: 100, y: 228 }); });
    const r = render(<MeasureAimGuide />);
    expect(r.getByTestId('measure-aim')).toBeTruthy();
    act(() => m().place(corner));
    expect(r.queryByTestId('measure-aim')).toBeNull();
  });
});
