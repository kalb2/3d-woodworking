import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { featureEdges } from './featureEdges';
import { cutSolids } from './holes';

const segs = (a: Float32Array) => Array.from({ length: a.length / 6 }, (_, i) => Array.from(a.slice(i * 6, i * 6 + 6)));
/** A segment lies on the box's outline when two of its coordinates sit on the box's faces. */
const onBoxEdge = (s: number[], h: [number, number, number]) => {
  const at = (k: number) => Math.abs(Math.abs(s[k]) - h[k]) < 1e-3 && Math.abs(Math.abs(s[k + 3]) - h[k]) < 1e-3;
  return [0, 1, 2].filter(at).length >= 2;
};

describe('outline edges', () => {
  it('a plain box: its 12 edges', () => {
    expect(segs(featureEdges(new THREE.BoxGeometry(24, 0.75, 12))).length).toBe(12);
  });

  it('pocket/dowel holes: no diagonals across the flat faces (EdgesGeometry draws them)', () => {
    const shelf = new THREE.BoxGeometry(24, 0.75, 12);
    const cut = cutSolids(shelf, [
      { kind: 'cyl', center: [-6, -0.2, 0], axis: [0, 1, 0], radius: 0.1875, depth: 0.5 },
      { kind: 'cyl', center: [6, -0.2, 0], axis: [0, 1, 0], radius: 0.1875, depth: 0.5 },
    ]);
    const h: [number, number, number] = [12, 0.375, 6];
    // Every segment is either the board outline or near a hole (rim / walls / bottom).
    const nearHole = (s: number[]) => [0, 3].every((k) => Math.min(Math.hypot(s[k] + 6, s[k + 2]), Math.hypot(s[k] - 6, s[k + 2])) < 0.25);
    const ours = segs(featureEdges(cut));
    expect(ours.filter((s) => !onBoxEdge(s, h) && !nearHole(s))).toEqual([]);
    expect(ours.filter((s) => onBoxEdge(s, h)).length).toBeGreaterThanOrEqual(12);
    expect(ours.some(nearHole)).toBe(true); // the hole rims are still outlined
    // The bug: three's EdgesGeometry outlines CSG T-junctions across the faces.
    const three = segs(new THREE.EdgesGeometry(cut, 24).getAttribute('position').array as Float32Array);
    expect(three.filter((s) => !onBoxEdge(s, h) && !nearHole(s)).length).toBeGreaterThan(0);
  });

  it('a dado: only the groove edges are added', () => {
    const panel = new THREE.BoxGeometry(0.75, 30, 12);
    const cut = cutSolids(panel, [{ kind: 'box', center: [0.4, -2.625, 0], size: [0.55, 0.75, 13] }]);
    const ours = segs(featureEdges(cut));
    const h: [number, number, number] = [0.375, 15, 6];
    // Groove spans y -3..-2.25 and x 0.125..0.375; all other lines must be the outline.
    const inGroove = (s: number[]) => [1, 4].every((k) => s[k] > -3.001 && s[k] < -2.249);
    expect(ours.filter((s) => !onBoxEdge(s, h) && !inGroove(s))).toEqual([]);
  });
});
