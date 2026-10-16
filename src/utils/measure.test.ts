import { describe, expect, it } from 'vitest';
import type { FurnitureObject } from '../types/furniture';
import { formatLength, measureDistance, snapCandidates, snapMeasurePoint } from './measure';

const mat = { id: 'plywood', name: 'Plywood', species: 'plywood', baseColor: '#000', secondaryColor: '#000', grainIntensity: 0, grainScale: 1, roughness: 1, metalness: 0, varnishSheen: 'matte' } as FurnitureObject['material'];
const box: FurnitureObject = { id: 'b', name: 'b', shape: 'cube', dimensions: { length: 24, height: 10, width: 12 }, position: { x: 0, y: 5, z: 0 }, rotation: { x: 0, y: 0, z: 0 }, material: mat };

describe('tape measure', () => {
  it('a box offers 8 corners, 12 edge midpoints and 6 face centers', () => {
    const c = snapCandidates(box);
    expect(c.filter((p) => p.kind === 'vertex')).toHaveLength(8);
    expect(c.filter((p) => p.kind === 'midpoint')).toHaveLength(12);
    expect(c.filter((p) => p.kind === 'face')).toHaveLength(6);
  });

  it('snaps to a nearby corner, then edge midpoint, then face center; else keeps the raw point', () => {
    expect(snapMeasurePoint({ x: 11.6, y: 9.7, z: 6 }, box, 1)).toMatchObject({ x: 12, y: 10, z: 6, kind: 'vertex' });
    expect(snapMeasurePoint({ x: 0.3, y: 10, z: 5.8 }, box, 1)).toMatchObject({ x: 0, y: 10, z: 6, kind: 'midpoint' });
    expect(snapMeasurePoint({ x: 0.2, y: 5.3, z: 6 }, box, 1)).toMatchObject({ x: 0, y: 5, z: 6, kind: 'face' });
    expect(snapMeasurePoint({ x: 6, y: 7, z: 6 }, box, 1).kind).toBe('surface');
  });

  it('distance and clean woodworking formatting', () => {
    expect(measureDistance({ x: 0, y: 0, z: 0 }, { x: 3, y: 4, z: 0 })).toBe(5);
    expect(formatLength(23.25, 'in')).toBe('23 1/4 in');
    expect(formatLength(0.75, 'in')).toBe('3/4 in');
    expect(formatLength(24, 'in')).toBe('24 in');
    expect(formatLength(30.5, 'ft')).toBe(`2' 6 1/2"`);
    expect(formatLength(24, 'mm')).toBe('610 mm');
  });
});
