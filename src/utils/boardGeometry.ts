import * as THREE from 'three';
import type { BoardHole, BoardOptions, Dimensions3D } from '../types/furniture';

/** A round, through, top-face hole: cut directly in the extruded outline. */
export const isOutlineHole = (h: BoardHole) => (h.face ?? 'top') === 'top' && h.depth === undefined && (h.kind ?? 'round') === 'round';

export function defaultBoardOptions(): BoardOptions {
  return {
    cornerRadius: 0,
    edge: 'none',
    holes: [],
  };
}

/** Centered panel: rounded corners, through-holes, and an optional routed edge. */
export function createBoardGeometry(dimensions: Dimensions3D, board: BoardOptions): THREE.BufferGeometry {
  const length = Math.max(dimensions.length, 0.2);
  const width = Math.max(dimensions.width, 0.2);
  const height = Math.max(dimensions.height, 0.08);
  const maxRadius = Math.min(length, width) / 2 - 0.04;
  const radius = Math.min(Math.max(board.cornerRadius, 0), Math.max(maxRadius, 0));

  const shape = new THREE.Shape();
  const x = -length / 2;
  const y = -width / 2;

  if (radius < 0.02) {
    shape.moveTo(x, y);
    shape.lineTo(x + length, y);
    shape.lineTo(x + length, y + width);
    shape.lineTo(x, y + width);
    shape.closePath();
  } else {
    shape.moveTo(x + radius, y);
    shape.lineTo(x + length - radius, y);
    shape.absarc(x + length - radius, y + radius, radius, -Math.PI / 2, 0, false);
    shape.lineTo(x + length, y + width - radius);
    shape.absarc(x + length - radius, y + width - radius, radius, 0, Math.PI / 2, false);
    shape.lineTo(x + radius, y + width);
    shape.absarc(x + radius, y + width - radius, radius, Math.PI / 2, Math.PI, false);
    shape.lineTo(x, y + radius);
    shape.absarc(x + radius, y + radius, radius, Math.PI, Math.PI * 1.5, false);
  }

  // Only simple through-holes on the broad face are cut in the 2D outline; others go through CSG.
  for (const hole of board.holes.filter(isOutlineHole)) {
    const diameter = Math.min(Math.max(hole.diameter, 0), Math.min(length, width) * 0.85);
    if (diameter < 0.08) continue;
    const path = new THREE.Path();
    path.absarc(hole.x, hole.z, diameter / 2, 0, Math.PI * 2, true);
    shape.holes.push(path);
  }

  const bevel = board.edge === 'none' ? 0 : Math.min(height * 0.45, Math.max(0.01, board.edgeSize ?? 0.22));
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: Math.max(height - bevel, height * 0.5),
    bevelEnabled: board.edge !== 'none',
    bevelThickness: bevel,
    bevelSize: board.edge === 'chamfer' ? bevel : bevel * 0.8,
    bevelSegments: board.edge === 'roundover' ? 3 : 1,
    curveSegments: 10,
  });
  geometry.rotateX(-Math.PI / 2);
  geometry.center();
  geometry.computeVertexNormals();
  return geometry;
}
