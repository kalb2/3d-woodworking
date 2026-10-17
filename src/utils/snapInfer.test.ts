import { describe, expect, it } from 'vitest';
import type { FurnitureObject, SnapSettings } from '../types/furniture';
import { alignmentHint, inferAlignments, insetLabel } from './snapInfer';
import { calculateSnappedPosition } from './snapUtils';

const mat = { id: 'plywood', name: 'Plywood', species: 'plywood', baseColor: '#000', secondaryColor: '#000', grainIntensity: 0, grainScale: 1, roughness: 1, metalness: 0, varnishSheen: 'matte' } as FurnitureObject['material'];
const box = (id: string, size: [number, number, number], at: [number, number, number], extra: Partial<FurnitureObject> = {}): FurnitureObject => ({
  id, name: id, shape: 'board', dimensions: { length: size[0], height: size[1], width: size[2] }, position: { x: at[0], y: at[1], z: at[2] }, rotation: { x: 0, y: 0, z: 0 }, material: mat, ...extra,
});
const settings: SnapSettings = { enabled: true, faceSnap: true, gridSnap: false, gridSize: 0.5, floorCollision: true };
// A 24 x 30 x 12 cabinet side by side area; the mover is a 0.75" shelf.
const cab = box('cab', [24, 30, 12], [0, 15, 0]);

describe('snap inference', () => {
  it('Flush: mover edge lines up with the target edge', () => {
    const shelf = box('s', [10, 0.75, 12], [0, 40, 0]);
    const r = inferAlignments(shelf, { x: -6.9, y: 40, z: 0 }, [cab], {});
    expect(r.position.x).toBeCloseTo(-7, 6); // left edge at -12 = cab left
    const ax = r.alignments.find((a) => a.axis === 'x')!;
    expect(ax.kind).toBe('flush');
    expect(ax.value).toBe(-12);
  });

  it('Centered: centers line up', () => {
    const shelf = box('s', [10, 0.75, 12], [0, 40, 0]);
    const r = inferAlignments(shelf, { x: 0.4, y: 40, z: 0 }, [cab], {});
    expect(r.position.x).toBeCloseTo(0, 9);
    expect(r.alignments.find((a) => a.axis === 'x')!.kind).toBe('centered');
  });

  it('Inset 3/4": edge set in by a sheet thickness', () => {
    const shelf = box('s', [10, 0.75, 12], [0, 40, 0]);
    const r = inferAlignments(shelf, { x: -6.3, y: 40, z: 0 }, [cab], {}); // left edge -11.3 ≈ -12 + 0.75
    expect(r.position.x).toBeCloseTo(-6.25, 6);
    const ax = r.alignments.find((a) => a.axis === 'x')!;
    expect([ax.kind, ax.inset]).toEqual(['inset', 0.75]);
    expect(alignmentHint(r.alignments)).toBe('Inset 3/4"');
    expect(insetLabel(0.25)).toBe('Inset 1/4"');
  });

  it('no inference from far away parts, and axes with a face contact are left alone', () => {
    const shelf = box('s', [10, 0.75, 12], [0, 40, 0]);
    expect(inferAlignments(shelf, { x: 0.4, y: 40, z: 200 }, [cab], {}).alignments).toEqual([]);
    expect(inferAlignments(shelf, { x: 0.4, y: 40, z: 0 }, [cab], { x: true }).alignments.find((a) => a.axis === 'x')).toBeUndefined();
  });

  it('guides lie on the aligned plane, from mover to target', () => {
    const shelf = box('s', [10, 0.75, 12], [0, 40, 0]);
    const ax = inferAlignments(shelf, { x: -6.9, y: 40, z: 0 }, [cab], {}).alignments.find((a) => a.axis === 'x')!;
    expect(ax.from.x).toBe(-12);
    expect(ax.to.x).toBe(-12);
    expect(ax.from.y).toBeCloseTo(40, 6);
    expect(ax.to.y).toBeCloseTo(15, 6);
  });

  it('in a real move: face contact + flush on the other axis, hint shown; Magnet off = nothing', () => {
    const mover = box('m', [12, 30, 12], [0, 15, 0]);
    const r = calculateSnappedPosition(mover, { x: 18.4, y: 15, z: 0.08 }, [cab], settings);
    expect(r.position.x).toBe(18); // against cab's right face
    expect(r.position.z).toBeCloseTo(0, 9); // fronts flush
    expect(r.hint).toBe('Flush');
    const off = calculateSnappedPosition(mover, { x: 18.4, y: 15, z: 0.4 }, [cab], { ...settings, enabled: false });
    expect(off.position).toEqual({ x: 18.4, y: 15, z: 0.4 });
    expect(off.alignments ?? []).toEqual([]);
  });

  it('turned parts use their true box when turned by 90° steps', () => {
    const turned = box('t', [24, 30, 12], [0, 15, 0], { rotation: { x: 0, y: 90, z: 0 } }); // spans x -6..6
    const shelf = box('s', [4, 0.75, 4], [0, 40, 0]);
    const r = inferAlignments(shelf, { x: -3.95, y: 40, z: 0 }, [turned], {});
    expect(r.position.x).toBeCloseTo(-4, 6);
  });
});
