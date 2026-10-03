import React, { useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Line } from '@react-three/drei';
import * as THREE from 'three';
import { SELECTION_COLOR } from '../../theme/canvasSelection';
import {
  GIZMO_HUB_CHEVRON,
  GIZMO_HUB_EDGE,
  GIZMO_HUB_FILL,
  GIZMO_OUTLINE_WIDTH,
} from '../../theme/gizmo';
import { gripAnchor, type MeshExtents } from '../../theme/partSurface';

const _world = new THREE.Vector3();

/** World size of one screen pixel at a point, so grips stay thumb-sized while zooming. */
export function worldUnitsPerPixel(camera: THREE.Camera, viewHeight: number, worldPoint: THREE.Vector3) {
  const persp = camera as THREE.PerspectiveCamera;
  const dist = Math.max(camera.position.distanceTo(worldPoint), 0.35);
  const fov = ((persp.fov || 45) * Math.PI) / 180;
  const height = Math.max(viewHeight, 1);
  return (2 * Math.tan(fov / 2) * dist) / height;
}

/** Draw gizmos on top of the scene while still depth-testing themselves — solid, not glass. */
export const GizmoDepthClear: React.FC = () => (
  <mesh
    renderOrder={9}
    frustumCulled={false}
    onBeforeRender={(renderer) => {
      renderer.clearDepth();
    }}
  >
    <boxGeometry args={[0.001, 0.001, 0.001]} />
    <meshBasicMaterial colorWrite={false} depthWrite={false} />
  </mesh>
);

/**
 * Scale a grip around its *local* origin (a face or ring point).
 * Do not wrap the whole gizmo in this — that recreates a free-floating center tripod.
 */
export const GripSize: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const ref = useRef<THREE.Group>(null);
  const { camera, size } = useThree();

  useFrame(() => {
    if (!ref.current) return;
    ref.current.getWorldPosition(_world);
    // Children are authored in pixels. This keeps a 64px head 64px on a phone.
    ref.current.scale.setScalar(worldUnitsPerPixel(camera, size.height, _world));
  });

  return (
    <group ref={ref} frustumCulled={false}>
      {children}
    </group>
  );
};

/**
 * Unlit opaque paint so Moblo RGB lands on screen as-authored.
 * Studio lights were shifting Lambert handles off the reference swatches.
 */
export const GizmoMaterial: React.FC<{
  color: string;
  active?: boolean;
}> = ({ color, active = false }) => {
  const paint = useMemo(() => {
    if (!active) return color;
    return `#${new THREE.Color(color).lerp(new THREE.Color('#ffffff'), 0.1).getHexString()}`;
  }, [color, active]);

  return (
    <meshBasicMaterial
      color={paint}
      depthTest
      depthWrite
      toneMapped={false}
      transparent={false}
      opacity={1}
      side={THREE.FrontSide}
    />
  );
};

export type FaceAxis = '+x' | '-x' | '+y' | '-y' | '+z' | '-z';

const RING_ROTATION: Record<'x' | 'y' | 'z', [number, number, number]> = {
  x: [0, Math.PI / 2, 0],
  y: [Math.PI / 2, 0, 0],
  z: [0, 0, 0],
};

/**
 * Rotate pills on the hoop equator — the side you'd grab, not the top.
 * X hoop (YZ): +Z. Y hoop (XZ): +Z. Z hoop (XY): +X.
 */
const SIDE_PILL_ANGLE: Record<'x' | 'y' | 'z', number> = {
  x: Math.PI,
  y: Math.PI / 2,
  z: 0,
};

const SHAFT_START = 10;
const SHAFT_LENGTH = 86;
const SHAFT_RADIUS = 15;
const CONE_LENGTH = 58;
const CONE_RADIUS = 34;
const ARROW_HIT_RADIUS = 46;
const ARROW_HIT_EXTRA = 18;

/** Local +Y maps onto the face normal — pull outward from the side. */
const FACE_OUT: Record<FaceAxis, [number, number, number]> = {
  '+x': [0, 0, -Math.PI / 2],
  '-x': [0, 0, Math.PI / 2],
  '+y': [0, 0, 0],
  '-y': [Math.PI, 0, 0],
  '+z': [Math.PI / 2, 0, 0],
  '-z': [-Math.PI / 2, 0, 0],
};

/** Moblo move: shaft + cone on the face you'd pull. Not a capsule. */
export const AxisArrow: React.FC<{
  axis: FaceAxis;
  extents: MeshExtents;
  color: string;
  active: boolean;
  onPointerDown: (event: any) => void;
}> = ({ axis, extents, color, active, onPointerDown }) => {
  const position = gripAnchor(axis, extents);
  const shaftCenter = SHAFT_START + SHAFT_LENGTH / 2;
  const coneCenter = SHAFT_START + SHAFT_LENGTH + CONE_LENGTH / 2;
  const hitLength = SHAFT_START + SHAFT_LENGTH + CONE_LENGTH + ARROW_HIT_EXTRA;

  return (
    <group position={position} rotation={FACE_OUT[axis]}>
      <GripSize>
        <mesh position={[0, shaftCenter, 0]} renderOrder={12} frustumCulled={false}>
          <cylinderGeometry args={[SHAFT_RADIUS, SHAFT_RADIUS, SHAFT_LENGTH, 20]} />
          <GizmoMaterial color={color} active={active} />
        </mesh>
        <mesh position={[0, coneCenter, 0]} renderOrder={12} frustumCulled={false}>
          <coneGeometry args={[CONE_RADIUS, CONE_LENGTH, 22]} />
          <GizmoMaterial color={color} active={active} />
        </mesh>
        <mesh
          position={[0, hitLength / 2, 0]}
          renderOrder={22}
          frustumCulled={false}
          onPointerDown={(event) => {
            event.stopPropagation();
            onPointerDown(event);
          }}
        >
          <cylinderGeometry args={[ARROW_HIT_RADIUS, ARROW_HIT_RADIUS, hitLength, 10]} />
          <meshBasicMaterial visible={false} depthTest={false} />
        </mesh>
      </GripSize>
    </group>
  );
};

const HUB_RADIUS = 42;
const HUB_THICKNESS = 14;
const CHEVRON_RADIUS = 11;
const CHEVRON_LENGTH = 24;
const HUB_HIT_RADIUS = 56;

/** Light hub that sits on the part's top face (not a floating origin ball). */
export const MoveHub: React.FC<{
  active: boolean;
  onPointerDown: (event: any) => void;
}> = ({ active, onPointerDown }) => {
  const chevrons = useMemo(() => {
    return [0, Math.PI / 2, Math.PI, (3 * Math.PI) / 2].map((angle) => {
      const dir = new THREE.Vector3(Math.sin(angle), 0, Math.cos(angle));
      const quaternion = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
      const reach = HUB_RADIUS * 0.42;
      return {
        angle,
        quaternion,
        position: [dir.x * reach, HUB_THICKNESS * 0.2, dir.z * reach] as [number, number, number],
      };
    });
  }, []);

  return (
    <GripSize>
      <group position={[0, HUB_THICKNESS / 2, 0]}>
        <mesh rotation={[-Math.PI / 2, 0, 0]} renderOrder={13} frustumCulled={false}>
          <cylinderGeometry args={[HUB_RADIUS, HUB_RADIUS, HUB_THICKNESS, 32]} />
          <GizmoMaterial color={GIZMO_HUB_FILL} active={active} />
        </mesh>
        <mesh rotation={[-Math.PI / 2, 0, 0]} renderOrder={14} frustumCulled={false}>
          <torusGeometry args={[HUB_RADIUS, 2.4, 8, 40]} />
          <GizmoMaterial color={GIZMO_HUB_EDGE} active={active} />
        </mesh>
        {chevrons.map((chevron) => (
          <mesh
            key={chevron.angle}
            position={chevron.position}
            quaternion={chevron.quaternion}
            renderOrder={14}
            frustumCulled={false}
          >
            <coneGeometry args={[CHEVRON_RADIUS, CHEVRON_LENGTH, 3]} />
            <GizmoMaterial color={GIZMO_HUB_CHEVRON} active={active} />
          </mesh>
        ))}
        <mesh
          rotation={[-Math.PI / 2, 0, 0]}
          renderOrder={21}
          frustumCulled={false}
          onPointerDown={(event) => {
            event.stopPropagation();
            onPointerDown(event);
          }}
        >
          <cylinderGeometry args={[HUB_HIT_RADIUS, HUB_HIT_RADIUS, 36, 20]} />
          <meshBasicMaterial visible={false} depthTest={false} />
        </mesh>
      </group>
    </GripSize>
  );
};

const PILL_RADIUS = 22;
const PILL_HEIGHT = 58;
const PILL_FLAT = 0.55;
const RING_TUBE_PX = 11;
const RING_HIT_TUBE = 2.4;

function pillPose(radius: number, angle: number) {
  const position: [number, number, number] = [
    radius * Math.cos(angle),
    radius * Math.sin(angle),
    0,
  ];
  // Rz(angle) maps capsule +Y onto the circle tangent — always well-defined.
  const quaternion = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), angle);
  return { position, quaternion };
}

/** Full opaque RGB hoop + flattened pill on the side you'd grab. Not a cone or cube. */
export const RotateRing: React.FC<{
  axis: 'x' | 'y' | 'z';
  color: string;
  active: boolean;
  radius: number;
  tube: number;
  pillAngle?: number;
  onPointerDown: (event: any) => void;
}> = ({ axis, color, active, radius, tube, pillAngle = SIDE_PILL_ANGLE[axis], onPointerDown }) => {
  const pose = useMemo(() => pillPose(radius, pillAngle), [radius, pillAngle]);
  const ringRef = useRef<THREE.Mesh>(null);
  const { camera, size } = useThree();
  const tubeRef = useRef(tube);

  useFrame(() => {
    const mesh = ringRef.current;
    if (!mesh) return;
    mesh.getWorldPosition(_world);
    const next = Math.max(RING_TUBE_PX * worldUnitsPerPixel(camera, size.height, _world), 0.04);
    if (Math.abs(next - tubeRef.current) < tubeRef.current * 0.08) return;
    tubeRef.current = next;
    mesh.geometry.dispose();
    mesh.geometry = new THREE.TorusGeometry(radius, next, 12, 72);
  });

  return (
    <group rotation={RING_ROTATION[axis]}>
      <mesh ref={ringRef} renderOrder={11} frustumCulled={false}>
        <torusGeometry args={[radius, Math.max(tube, 0.2), 12, 72]} />
        <GizmoMaterial color={color} active={active} />
      </mesh>
      <group position={pose.position} quaternion={pose.quaternion}>
        <GripSize>
          <mesh scale={[1.12, 1, PILL_FLAT]} renderOrder={13} frustumCulled={false}>
            <capsuleGeometry args={[PILL_RADIUS, PILL_HEIGHT, 6, 16]} />
            <GizmoMaterial color={color} active={active} />
          </mesh>
        </GripSize>
      </group>
      <mesh
        renderOrder={22}
        frustumCulled={false}
        onPointerDown={(event) => {
          event.stopPropagation();
          onPointerDown(event);
        }}
      >
        <torusGeometry args={[radius, RING_HIT_TUBE, 8, 56]} />
        <meshBasicMaterial visible={false} depthTest={false} />
      </mesh>
    </group>
  );
};

const PAD_SIDE = 76;
const PAD_THICK = 30;

/** Moblo resize: square RGB pad on the face you'd pull. Not a capsule. */
export const FacePad: React.FC<{
  axis: FaceAxis;
  color: string;
  active: boolean;
  onPointerDown: (event: any) => void;
}> = ({ axis, color, active, onPointerDown }) => {
  const side = PAD_SIDE;
  const thick = PAD_THICK;

  return (
    <group rotation={FACE_OUT[axis]}>
      <GripSize>
        <mesh position={[0, thick / 2, 0]} renderOrder={12} frustumCulled={false}>
          <boxGeometry args={[side, thick, side]} />
          <GizmoMaterial color={color} active={active} />
        </mesh>
        <mesh
          position={[0, thick / 2, 0]}
          renderOrder={22}
          frustumCulled={false}
          onPointerDown={(event) => {
            event.stopPropagation();
            onPointerDown(event);
          }}
        >
          <boxGeometry args={[side + 20, thick + 24, side + 20]} />
          <meshBasicMaterial visible={false} depthTest={false} />
        </mesh>
      </GripSize>
    </group>
  );
};

function circlePoints(radius: number, axis: 'x' | 'y' | 'z', segments = 64): [number, number, number][] {
  const pts: [number, number, number][] = [];
  for (let i = 0; i <= segments; i += 1) {
    const t = (i / segments) * Math.PI * 2;
    const c = Math.cos(t) * radius;
    const s = Math.sin(t) * radius;
    if (axis === 'y') pts.push([c, 0, s]);
    else if (axis === 'x') pts.push([0, c, s]);
    else pts.push([c, s, 0]);
  }
  return pts;
}

/** Light-blue meridians on a sphere — EdgesGeometry is empty on a smooth ball. */
export const SphereOutline: React.FC<{ radius: number }> = ({ radius }) => {
  const rings = useMemo(
    () => ({
      xz: circlePoints(radius, 'y'),
      xy: circlePoints(radius, 'z'),
      yz: circlePoints(radius, 'x'),
    }),
    [radius]
  );

  return (
    <>
      {(['xz', 'xy', 'yz'] as const).map((key) => (
        <Line
          key={key}
          points={rings[key]}
          color={SELECTION_COLOR}
          lineWidth={GIZMO_OUTLINE_WIDTH}
          depthTest={false}
          renderOrder={8}
          frustumCulled={false}
          raycast={() => undefined}
        />
      ))}
    </>
  );
};
