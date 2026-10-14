import { describe, expect, it } from 'vitest';
import type { FurnitureObject, SnapSettings } from '../types/furniture';
import { calculateSnappedPosition } from './snapUtils';
import { roomScanParts } from '../generators/roomScan';
import { WALL_MATERIAL_PROPS } from '../components/viewport/RoomScanMesh';

const mat = { id: 'oak', name: 'Oak', species: 'oak', baseColor: '#000', secondaryColor: '#000', grainIntensity: 0, grainScale: 1, roughness: 1, metalness: 0, varnishSheen: 'matte' } as FurnitureObject['material'];
const snap: SnapSettings = { enabled: true, faceSnap: true, gridSnap: false, gridSize: 0.5, floorCollision: true };
const box = (id: string, extra: Partial<FurnitureObject> = {}): FurnitureObject => ({
  id, name: id, shape: 'cube', dimensions: { length: 10, width: 10, height: 10 }, position: { x: 0, y: 5, z: 0 }, rotation: { x: 0, y: 0, z: 0 }, material: mat, ...extra,
});
// A 100" wall turned 90° (runs along z), interior face at x = 2 (4" thick, center x = 0).
const wall = (extra: Partial<FurnitureObject> = {}): FurnitureObject => box('wall', {
  generator: 'room-scan', locked: true, dimensions: { length: 100, width: 4, height: 96 }, position: { x: 0, y: 48, z: 0 }, rotation: { x: 0, y: 90, z: 0 }, ...extra,
});

describe('snap against scanned room parts', () => {
  it('snaps a part flush to a turned scanned wall face (locked walls included) and reports a turned contact', () => {
    const r = calculateSnappedPosition(box('p'), { x: 7.6, y: 5, z: 10 }, [wall()], snap);
    expect(r.position.x).toBeCloseTo(7, 6); // 2 (face) + 5 (half part)
    expect(r.position.z).toBeCloseTo(10, 6);
    const c = r.contacts.find((k) => k.targetId === 'wall')!;
    expect(c.yaw).toBe(90);
    expect(c.axis).toBe('z'); // wall-local thickness axis
    expect(Math.abs(c.value)).toBe(2);
  });

  it('a wall does not grab parts that are not alongside it', () => {
    const r = calculateSnappedPosition(box('p'), { x: 7.6, y: 5, z: 200 }, [wall()], snap);
    expect(r.position.x).toBeCloseTo(7.6, 6);
    expect(r.contacts).toEqual([]);
  });

  it('never pulls a part under a scanned wall (below the floor)', () => {
    const r = calculateSnappedPosition(box('p'), { x: 0.5, y: -4.5, z: 0 }, [wall()], snap);
    expect(r.position.y).toBeGreaterThanOrEqual(5);
  });

  it('works with real scan parts (walls + openings), and parts without an explicit visible flag', () => {
    const parts = roomScanParts({
      walls: [{ id: 'w1', label: 'Wall 1', width: 120, height: 96, x: 0, z: -60, yaw: 0, openings: [{ id: 'o1', kind: 'window', offsetX: 40, width: 30, bottom: 36, height: 40 }] }],
    } as never).map((p, i) => ({ ...p, id: `s${i}` }));
    // Wall 1 interior face is at z = -60; part 10 deep, nudged near it.
    const r = calculateSnappedPosition(box('p'), { x: -40, y: 5, z: -54.4 }, parts, snap);
    expect(r.position.z).toBeCloseTo(-55, 6);
    const legacy = box('legacy', { position: { x: 30, y: 5, z: 0 } });
    delete (legacy as Partial<FurnitureObject>).visible;
    const r2 = calculateSnappedPosition(box('p'), { x: 19.5, y: 5, z: 0 }, [legacy], snap);
    expect(r2.position.x).toBeCloseTo(20, 6);
  });
});

describe('scanned walls do not tint parts behind them', () => {
  it('walls are opaque and write depth, the same from every side (no view-dependent fade)', () => {
    expect(WALL_MATERIAL_PROPS).toEqual({ transparent: false, opacity: 1, depthWrite: true });
  });
});
