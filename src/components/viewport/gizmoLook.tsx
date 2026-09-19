import React, { useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Line } from '@react-three/drei';
import * as THREE from 'three';
import { SELECTION_COLOR } from '../../theme/canvasSelection';
import {
  GIZMO_DISTANCE_REF,
  GIZMO_HUB_CHEVRON,
  GIZMO_HUB_EDGE,
  GIZMO_HUB_FILL,
  GIZMO_OUTLINE_WIDTH,
  GIZMO_SCALE_MAX,
  GIZMO_SCALE_MIN,
} from '../../theme/gizmo';
import { gripAnchor, type MeshExtents } from '../../theme/partSurface';

const _world = new THREE.Vector3();

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
  const { camera } = useThree();

  useFrame(() => {
    if (!ref.current) return;
    ref.current.getWorldPosition(_world);
    const dist = camera.position.distanceTo(_world);
    const scale = THREE.MathUtils.clamp(dist / GIZMO_DISTANCE_REF, GIZMO_SCALE_MIN, GIZMO_SCALE_MAX);
    ref.current.scale.setScalar(scale);
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
 * Pills on visible edges of each hoop.
 * Angles avoid antipodal setFromUnitVectors singularities.
 * X: high on the ring (above the part). Y: near long edge. Z: high / +X.
 */
const EDGE_PILL_ANGLE: Record<'x' | 'y' | 'z', number> = {
  x: Math.PI * 0.72,
  y: Math.PI * 1.52,
  z: Math.PI * 0.28,
};

const GRIP_RADIUS = 0.52;
const GRIP_BODY = 1.35;
const ARROW_HIT_RADIUS = 2.25;
const ARROW_HIT_LENGTH = 3.4;

const EDGE_ALONG: Record<FaceAxis, [number, number, number]> = {
  '+x': [Math.PI / 2, 0, 0],
  '-x': [Math.PI / 2, 0, 0],
  '+z': [0, 0, Math.PI / 2],
  '-z': [0, 0, Math.PI / 2],
  '+y': [0, 0, 0],
  '-y': [Math.PI, 0, 0],
};

/** Soft capsule on the real mesh edge/rim — tappable, not a dominating spike. */
export const AxisArrow: React.FC<{
  axis: FaceAxis;
  extents: MeshExtents;
  color: string;
  active: boolean;
  onPointerDown: (event: any) => void;
}> = ({ axis, extents, color, active, onPointerDown }) => {
  const position = gripAnchor(axis, extents);
  const upright = axis === '+y' || axis === '-y';
  const yOff = upright ? GRIP_RADIUS + GRIP_BODY / 2 : 0;

  return (
    <group position={position} rotation={EDGE_ALONG[axis]}>
      <GripSize>
        <mesh position={[0, yOff, 0]} renderOrder={12} frustumCulled={false}>
          <capsuleGeometry args={[GRIP_RADIUS, GRIP_BODY, 8, 16]} />
          <GizmoMaterial color={color} active={active} />
        </mesh>
        <mesh
          position={[0, yOff, 0]}
          renderOrder={22}
          frustumCulled={false}
          onPointerDown={(event) => {
            event.stopPropagation();
            onPointerDown(event);
          }}
        >
          <cylinderGeometry args={[ARROW_HIT_RADIUS, ARROW_HIT_RADIUS, ARROW_HIT_LENGTH, 10]} />
          <meshBasicMaterial visible={false} depthTest={false} />
        </mesh>
      </GripSize>
    </group>
  );
};

const HUB_RADIUS = 0.78;
const HUB_THICKNESS = 0.2;
const CHEVRON_RADIUS = 0.2;
const CHEVRON_LENGTH = 0.42;
const HUB_HIT_RADIUS = 2.2;

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
    <group position={[0, HUB_THICKNESS / 2, 0]}>
      <GripSize>
        <mesh rotation={[-Math.PI / 2, 0, 0]} renderOrder={13} frustumCulled={false}>
          <cylinderGeometry args={[HUB_RADIUS, HUB_RADIUS, HUB_THICKNESS, 32]} />
          <GizmoMaterial color={GIZMO_HUB_FILL} active={active} />
        </mesh>
        <mesh rotation={[-Math.PI / 2, 0, 0]} renderOrder={14} frustumCulled={false}>
          <torusGeometry args={[HUB_RADIUS, 0.045, 8, 32]} />
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
          <cylinderGeometry args={[HUB_HIT_RADIUS, HUB_HIT_RADIUS, 0.85, 20]} />
          <meshBasicMaterial visible={false} depthTest={false} />
        </mesh>
      </GripSize>
    </group>
  );
};

const PILL_RADIUS = 0.48;
const PILL_HEIGHT = 1.12;
const RING_HIT_TUBE = 2.2;

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

/** Full opaque RGB hoop wrapped around the part + fat capsule on an edge. */
export const RotateRing: React.FC<{
  axis: 'x' | 'y' | 'z';
  color: string;
  active: boolean;
  radius: number;
  tube: number;
  pillAngle?: number;
  onPointerDown: (event: any) => void;
}> = ({ axis, color, active, radius, tube, pillAngle = EDGE_PILL_ANGLE[axis], onPointerDown }) => {
  const pose = useMemo(() => pillPose(radius, pillAngle), [radius, pillAngle]);

  return (
    <group rotation={RING_ROTATION[axis]}>
      <mesh renderOrder={11} frustumCulled={false}>
        <torusGeometry args={[radius, tube, 10, 80]} />
        <GizmoMaterial color={color} active={active} />
      </mesh>
      <group position={pose.position} quaternion={pose.quaternion}>
        <GripSize>
          <mesh renderOrder={13} frustumCulled={false}>
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

const PAD_MIN = 1.15;
const PAD_MAX = 2.2;
const PAD_FRAC = 0.12;
const PAD_THICK_MIN = 0.28;

function facePadExtents(axis: FaceAxis, length: number, height: number, width: number) {
  let across: number;
  let along: number;
  if (axis === '+x' || axis === '-x') {
    across = height;
    along = width;
  } else if (axis === '+y' || axis === '-y') {
    across = length;
    along = width;
  } else {
    across = length;
    along = height;
  }
  const side = THREE.MathUtils.clamp(Math.min(across, along) * PAD_FRAC, PAD_MIN, PAD_MAX);
  const thick = Math.max(PAD_THICK_MIN, side * 0.22);
  const radius = THREE.MathUtils.clamp(side * 0.32, 0.42, 0.52);
  const body = THREE.MathUtils.clamp(side * 0.7, 0.85, 1.35);
  return { side, thick, radius, body };
}

/** Soft rounded pad on the part face — same RGB, less cube mass. */
export const FacePad: React.FC<{
  axis: FaceAxis;
  color: string;
  active: boolean;
  length: number;
  height: number;
  width: number;
  onPointerDown: (event: any) => void;
}> = ({ axis, color, active, length, height, width, onPointerDown }) => {
  const { side, thick, radius, body } = facePadExtents(axis, length, height, width);
  const upright = axis === '+y' || axis === '-y';
  const yOff = upright ? radius + body / 2 : 0;

  return (
    <group rotation={EDGE_ALONG[axis]}>
      <GripSize>
        <mesh position={[0, yOff, 0]} renderOrder={12} frustumCulled={false}>
          <capsuleGeometry args={[radius, body, 6, 16]} />
          <GizmoMaterial color={color} active={active} />
        </mesh>
        <mesh
          position={[0, yOff, 0]}
          renderOrder={22}
          frustumCulled={false}
          onPointerDown={(event) => {
            event.stopPropagation();
            onPointerDown(event);
          }}
        >
          <boxGeometry args={[side + 1.55, thick + 1.7, side + 1.55]} />
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
