import React, { useMemo } from 'react';
import * as THREE from 'three';
import { Edges, Line } from '@react-three/drei';
import { featureEdges } from '../../utils/featureEdges';
import type { FurnitureObject } from '../../types/furniture';
import { createWoodMeshMaterial } from '../../utils/woodTextureGenerator';
import { createBoardGeometry, defaultBoardOptions } from '../../utils/boardGeometry';
import { SELECTION_COLOR } from '../../theme/canvasSelection';
import { GIZMO_OUTLINE_WIDTH } from '../../theme/gizmo';
import { SphereOutline } from './gizmoLook';
import { positiveSize } from '../../theme/partSurface';
import { projectStyle } from '../../state/viewStyle';
import { useProjectStore } from '../../state/useProjectStore';
import { grainUVs } from '../../utils/grainUV';
import { partCutters } from '../../joinery/joints';
import { cutHoles, cutSolids, faceAxes, faceThickness, footprint, getHoles, supportsHoles, useHoleFocus } from '../../utils/holes';

interface FurnitureMeshProps {
  object: FurnitureObject;
  isSelected: boolean;
  /** Group volumes stay pickable until the group is opened for editing. */
  pickGroup?: boolean;
  onPointerDown?: (e: any) => void;
}

export const FurnitureMesh: React.FC<FurnitureMeshProps> = ({
  object,
  isSelected,
  pickGroup = true,
  onPointerDown
}) => {
  const { shape, dimensions, position, rotation, material } = object;
  const isGroup = shape === 'group';

  const style = useProjectStore((s) => projectStyle(s.projects.find((p) => p.id === s.activeProjectId)));
  // Lots of parts: drop per-part outlines in Realistic to keep the frame rate up.
  const busy = useProjectStore((s) => (s.projects.find((p) => p.id === s.activeProjectId)?.objects.length ?? 0) > 200);
  const meshMaterial = useMemo(() => {
    return createWoodMeshMaterial(material, style);
  }, [material, style]);

  const roundPart = shape === 'sphere' || shape === 'cylinder' || shape === 'pole';
  const length = positiveSize(dimensions.length);
  const width = positiveSize(dimensions.width);
  const height = positiveSize(dimensions.height);
  const meshScale: [number, number, number] = shape === 'sphere'
    ? [length / 2, height / 2, width / 2]
    : shape === 'cylinder' || shape === 'pole'
      ? [length / 2, height, width / 2]
      : [1, 1, 1];
  const holes = supportsHoles(shape) ? getHoles(object) : [];
  const holesKey = JSON.stringify(holes);
  // Joinery cuts (dados, rabbets, dowel/pocket holes) follow the parts they join.
  const jointKey = useProjectStore((s) => {
    if (!supportsHoles(shape)) return '';
    const p = s.projects.find((x) => x.id === s.activeProjectId);
    if (!p?.joints?.length) return '';
    const c = partCutters(p, object.id);
    return c.length ? JSON.stringify(c) : '';
  });
  const baseGeometry = useMemo(() => {
    const l = positiveSize(dimensions.length);
    const w = positiveSize(dimensions.width);
    const h = positiveSize(dimensions.height);

    switch (shape) {
      case 'cylinder':
      case 'pole':
        // Unit tube. Per-axis scale lives on the mesh so a drag does not rebuild buffers.
        return new THREE.CylinderGeometry(1, 1, 1, 32);
      case 'sphere':
        return new THREE.SphereGeometry(1, 32, 32);
      case 'bevel_top': {
        const shape2D = new THREE.Shape();
        const halfX = l / 2;
        const halfZ = w / 2;
        const radius = Math.min(1.0, Math.min(l, w) * 0.1);

        shape2D.moveTo(-halfX + radius, -halfZ);
        shape2D.lineTo(halfX - radius, -halfZ);
        shape2D.quadraticCurveTo(halfX, -halfZ, halfX, -halfZ + radius);
        shape2D.lineTo(halfX, halfZ - radius);
        shape2D.quadraticCurveTo(halfX, halfZ, halfX - radius, halfZ);
        shape2D.lineTo(-halfX + radius, halfZ);
        shape2D.quadraticCurveTo(-halfX, halfZ, -halfX, halfZ - radius);
        shape2D.lineTo(-halfX, -halfZ + radius);
        shape2D.quadraticCurveTo(-halfX, -halfZ, -halfX + radius, -halfZ);

        const extrudeSettings = {
          steps: 1,
          depth: h,
          bevelEnabled: true,
          bevelThickness: Math.min(0.3, h * 0.2),
          bevelSize: Math.min(0.3, h * 0.2),
          bevelSegments: 4
        };

        const geom = new THREE.ExtrudeGeometry(shape2D, extrudeSettings);
        geom.rotateX(Math.PI / 2);
        geom.center();
        return geom;
      }
      case 'wedge': {
        const geom = new THREE.BufferGeometry();
        const halfX = l / 2;
        const halfY = h / 2;
        const halfZ = w / 2;

        const vertices = new Float32Array([
          -halfX, -halfY, -halfZ,   halfX, -halfY, -halfZ,   halfX, -halfY, halfZ,
          -halfX, -halfY, -halfZ,   halfX, -halfY, halfZ,   -halfX, -halfY, halfZ,
          -halfX, -halfY, halfZ,    halfX, -halfY, halfZ,    halfX, halfY, halfZ,
          -halfX, -halfY, halfZ,    halfX, halfY, halfZ,    -halfX, halfY, halfZ,
          -halfX, -halfY, -halfZ,  -halfX, halfY, halfZ,     halfX, halfY, halfZ,
          -halfX, -halfY, -halfZ,   halfX, halfY, halfZ,     halfX, -halfY, -halfZ,
          -halfX, -halfY, -halfZ,  -halfX, -halfY, halfZ,   -halfX, halfY, halfZ,
           halfX, -halfY, -halfZ,   halfX, halfY, halfZ,     halfX, -halfY, halfZ
        ]);

        geom.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
        geom.computeVertexNormals();
        return geom;
      }
      case 'cushion': {
        return new THREE.BoxGeometry(l, h, w, 8, 8, 8);
      }
      case 'board':
        return createBoardGeometry(dimensions, object.board ?? defaultBoardOptions());
      case 'group':
      case 'cube':
      default:
        return new THREE.BoxGeometry(l, h, w);
    }
  }, [shape, roundPart, roundPart ? null : `${dimensions.length}|${dimensions.width}|${dimensions.height}`, object.board]);
  const grainShape = !roundPart && shape !== 'group';
  const geometry = useMemo(
    () => {
      let g = holes.length ? cutHoles(baseGeometry, { length, width, height }, holes, shape === 'board') : baseGeometry;
      if (jointKey) g = cutSolids(g, JSON.parse(jointKey));
      // Grain runs along the part's longest dimension (box-like parts).
      return grainShape ? grainUVs(g, { x: length, y: height, z: width }) : g;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [baseGeometry, holesKey, jointKey],
  );
  // Cut parts (holes, joinery): outline only real feature edges. three's EdgesGeometry
  // draws every CSG T-junction as a border, which shows as diagonals across faces.
  const cutOutline = useMemo(() => {
    if (geometry === baseGeometry) return null;
    const a = featureEdges(geometry, 24);
    const pts: [number, number, number][] = [];
    for (let i = 0; i < a.length; i += 3) pts.push([a[i], a[i + 1], a[i + 2]]);
    return pts.length ? pts : null;
  }, [geometry, baseGeometry]);
  const focusHoleId = useHoleFocus((st) => (st.objectId === object.id && st.editing ? st.holeId : null));
  const focusHole = focusHoleId ? holes.find((h) => h.id === focusHoleId) : undefined;
  const focusMarker = useMemo(() => {
    if (!focusHole) return null;
    const dims = { length, width, height };
    const { u, v, n } = faceAxes(focusHole.face);
    const f = footprint(focusHole);
    const q = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(u, n.clone().cross(u), n));
    const geom = (focusHole.kind ?? 'round') === 'round'
      ? new THREE.EdgesGeometry(new THREE.CircleGeometry(f.wu / 2 + 0.05, 40))
      : new THREE.EdgesGeometry(new THREE.PlaneGeometry(f.wu, f.wv));
    const position = n.clone().multiplyScalar(faceThickness(dims, focusHole.face) / 2 + 0.03).addScaledVector(u, f.cu).addScaledVector(v, f.cv);
    return { geom, position, quaternion: q, handle: Math.max(0.12, Math.min(0.35, Math.min(f.wu, f.wv) * 0.18)) };
  }, [focusHole, length, width, height]);

  const groupOutline = useMemo(() => {
    if (shape !== 'group') return null;
    return new THREE.EdgesGeometry(
      new THREE.BoxGeometry(dimensions.length, dimensions.height, dimensions.width)
    );
  }, [shape, dimensions.length, dimensions.height, dimensions.width]);

  const rotRadX = (rotation.x * Math.PI) / 180;
  const rotRadY = (rotation.y * Math.PI) / 180;
  const rotRadZ = (rotation.z * Math.PI) / 180;

  if (object.visible === false) return null;

  return (
    <group position={[position.x, position.y, position.z]} rotation={[rotRadX, rotRadY, rotRadZ]} userData={{ objectId: object.id }}>
      <mesh
        geometry={geometry}
        scale={meshScale}
        material={isGroup ? undefined : meshMaterial}
        castShadow={!isGroup && style === 'realistic'}
        receiveShadow={!isGroup && style === 'realistic'}
        raycast={isGroup && !pickGroup ? () => undefined : undefined}
        onPointerDown={onPointerDown}
      >
        {isGroup && (
          <meshBasicMaterial colorWrite={false} depthWrite={false} toneMapped={false} />
        )}
        {isSelected && !isGroup && shape === 'sphere' && (
          <SphereOutline radius={1} />
        )}
        {!isSelected && !isGroup && shape !== 'sphere' && (style === 'clean' || !busy) && (
          // Crisp SketchUp-style outline, constant screen width.
          <PartEdges points={cutOutline} color={style === 'clean' ? '#1f2937' : '#475569'} lineWidth={style === 'clean' ? 1.4 : 1} transparent opacity={style === 'clean' ? 0.9 : 0.55} />
        )}
        {isSelected && !isGroup && shape !== 'sphere' && (
          <PartEdges
            points={cutOutline}
            color={SELECTION_COLOR}
            lineWidth={GIZMO_OUTLINE_WIDTH}
            depthTest={false}
            toneMapped={false}
          />
        )}
      </mesh>
      {focusMarker && (
        <group position={focusMarker.position} quaternion={focusMarker.quaternion}>
          <lineSegments geometry={focusMarker.geom} renderOrder={5}>
            <lineBasicMaterial color="#e09f3e" depthTest={false} toneMapped={false} />
          </lineSegments>
          <mesh renderOrder={6}>
            <circleGeometry args={[focusMarker.handle, 24]} />
            <meshBasicMaterial color="#e09f3e" depthTest={false} toneMapped={false} />
          </mesh>
        </group>
      )}
      {isGroup && isSelected && groupOutline && (
        <lineSegments geometry={groupOutline}>
          <lineBasicMaterial color={SELECTION_COLOR} depthTest={false} toneMapped={false} />
        </lineSegments>
      )}
    </group>
  );
};

/** Outline: precomputed feature edges for cut parts, else drei Edges (24°). */
const PartEdges: React.FC<{ points: [number, number, number][] | null; color: string; lineWidth: number; transparent?: boolean; opacity?: number; depthTest?: boolean; toneMapped?: boolean }> = ({ points, ...rest }) => (
  points ? <Line segments points={points} raycast={() => null} {...rest} /> : <Edges threshold={24} {...rest} />
);
