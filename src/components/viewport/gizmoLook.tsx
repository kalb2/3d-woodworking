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

/** Solid matte paint — no transparency, no emissive glass. */
export const GizmoMaterial: React.FC<{
  color: string;
  active?: boolean;
}> = ({ color, active = false }) => (
  <meshLambertMaterial
    color={color}
    emissive={active ? color : '#000000'}
    emissiveIntensity={active ? 0.18 : 0}
    depthTest
    depthWrite
    toneMapped={false}
    transparent={false}
    opacity={1}
    side={THREE.FrontSide}
  />
);

export type FaceAxis = '+x' | '-x' | '+y' | '-y' | '+z' | '-z';

const FACE_ROTATION: Record<FaceAxis, [number, number, number]> = {
  '+x': [0, 0, -Math.PI / 2],
  '-x': [0, 0, Math.PI / 2],
  '+y': [0, 0, 0],
  '-y': [Math.PI, 0, 0],
  '+z': [Math.PI / 2, 0, 0],
  '-z': [-Math.PI / 2, 0, 0],
};

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

const SHAFT_START = 0.18;
const SHAFT_LENGTH = 3.35;
const SHAFT_RADIUS = 0.52;
const CONE_LENGTH = 2.35;
const CONE_RADIUS = 1.32;
const ARROW_HIT_RADIUS = 3.4;
const ARROW_HIT_EXTRA = 2.4;

/** Thick shaft + fat cone planted on a face, pointing outward. */
export const AxisArrow: React.FC<{
  axis: FaceAxis;
  reach: number;
  color: string;
  active: boolean;
  onPointerDown: (event: any) => void;
}> = ({ axis, reach, color, active, onPointerDown }) => {
  const shaftCenter = SHAFT_START + SHAFT_LENGTH / 2;
  const coneCenter = SHAFT_START + SHAFT_LENGTH + CONE_LENGTH / 2;
  const hitLength = SHAFT_START + SHAFT_LENGTH + CONE_LENGTH + ARROW_HIT_EXTRA;

  return (
    <group position={facePoint(axis, reach)} rotation={FACE_ROTATION[axis]}>
      <GripSize>
        <mesh position={[0, shaftCenter, 0]} renderOrder={12} frustumCulled={false}>
          <cylinderGeometry args={[SHAFT_RADIUS, SHAFT_RADIUS, SHAFT_LENGTH, 24]} />
          <GizmoMaterial color={color} active={active} />
        </mesh>
        <mesh position={[0, coneCenter, 0]} renderOrder={12} frustumCulled={false}>
          <coneGeometry args={[CONE_RADIUS, CONE_LENGTH, 28]} />
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

function facePoint(axis: FaceAxis, reach: number): [number, number, number] {
  switch (axis) {
    case '+x': return [reach, 0, 0];
    case '-x': return [-reach, 0, 0];
    case '+y': return [0, reach, 0];
    case '-y': return [0, -reach, 0];
    case '+z': return [0, 0, reach];
    case '-z': return [0, 0, -reach];
  }
}

const HUB_RADIUS = 1.18;
const HUB_THICKNESS = 0.36;
const CHEVRON_RADIUS = 0.34;
const CHEVRON_LENGTH = 0.72;
const HUB_HIT_RADIUS = 3.2;

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
          <torusGeometry args={[HUB_RADIUS, 0.08, 8, 32]} />
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
          <cylinderGeometry args={[HUB_HIT_RADIUS, HUB_HIT_RADIUS, 1.2, 20]} />
          <meshBasicMaterial visible={false} depthTest={false} />
        </mesh>
      </GripSize>
    </group>
  );
};

const PILL_RADIUS = 1.55;
const PILL_HEIGHT = 2.05;
const RING_HIT_TUBE = 2.8;

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
        <torusGeometry args={[radius, tube, 16, 80]} />
        <GizmoMaterial color={color} active={active} />
      </mesh>
      <group position={pose.position} quaternion={pose.quaternion}>
        <GripSize>
          <mesh renderOrder={13} frustumCulled={false}>
            <capsuleGeometry args={[PILL_RADIUS, PILL_HEIGHT, 8, 20]} />
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

const PAD_MIN = 2.5;
const PAD_MAX = 7.2;
const PAD_FRAC = 0.22;
const PAD_THICK_MIN = 0.55;

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
  const thick = Math.max(PAD_THICK_MIN, side * 0.18);
  return { side, thick };
}

/** Rounded-ish RGB cube sitting on the part face. */
export const FacePad: React.FC<{
  axis: FaceAxis;
  color: string;
  active: boolean;
  length: number;
  height: number;
  width: number;
  onPointerDown: (event: any) => void;
}> = ({ axis, color, active, length, height, width, onPointerDown }) => {
  const { side, thick } = facePadExtents(axis, length, height, width);

  return (
    <group rotation={FACE_ROTATION[axis]}>
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
          <boxGeometry args={[side + 1.4, thick + 1.8, side + 1.4]} />
          <meshBasicMaterial visible={false} depthTest={false} />
        </mesh>
      </GripSize>
    </group>
  );
};

function boxOutlinePoints(length: number, height: number, width: number, pad: number): [number, number, number][] {
  const hx = length / 2 + pad;
  const hy = height / 2 + pad;
  const hz = width / 2 + pad;
  return [
    [-hx, -hy, -hz], [hx, -hy, -hz],
    [hx, -hy, -hz], [hx, -hy, hz],
    [hx, -hy, hz], [-hx, -hy, hz],
    [-hx, -hy, hz], [-hx, -hy, -hz],
    [-hx, hy, -hz], [hx, hy, -hz],
    [hx, hy, -hz], [hx, hy, hz],
    [hx, hy, hz], [-hx, hy, hz],
    [-hx, hy, hz], [-hx, hy, -hz],
    [-hx, -hy, -hz], [-hx, hy, -hz],
    [hx, -hy, -hz], [hx, hy, -hz],
    [hx, -hy, hz], [hx, hy, hz],
    [-hx, -hy, hz], [-hx, hy, hz],
  ];
}

/** 12-edge bounding box using pixel-width lines (WebGL ignores LineBasic linewidth). */
export const SelectionOutline: React.FC<{
  length: number;
  height: number;
  width: number;
  pad?: number;
}> = ({ length, height, width, pad = 0.1 }) => {
  const points = useMemo(
    () => boxOutlinePoints(length, height, width, pad),
    [length, height, width, pad]
  );

  return (
    <Line
      segments
      points={points}
      color={SELECTION_COLOR}
      lineWidth={GIZMO_OUTLINE_WIDTH}
      depthTest={false}
      renderOrder={8}
      frustumCulled={false}
      raycast={() => undefined}
    />
  );
};
