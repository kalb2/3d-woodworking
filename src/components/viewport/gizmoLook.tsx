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

const _anchor = new THREE.Vector3();

/** Keep gizmos a stable screen size so they stay readable on iPhone at any zoom. */
export const GizmoScale: React.FC<{
  anchor: [number, number, number];
  children: React.ReactNode;
}> = ({ anchor, children }) => {
  const ref = useRef<THREE.Group>(null);
  const { camera } = useThree();

  useFrame(() => {
    if (!ref.current) return;
    const dist = camera.position.distanceTo(_anchor.set(anchor[0], anchor[1], anchor[2]));
    const scale = THREE.MathUtils.clamp(dist / GIZMO_DISTANCE_REF, GIZMO_SCALE_MIN, GIZMO_SCALE_MAX);
    ref.current.scale.setScalar(scale);
  });

  return (
    <group ref={ref} frustumCulled={false}>
      {children}
    </group>
  );
};

export const GizmoMaterial: React.FC<{ color: string; active?: boolean }> = ({ color, active = false }) => (
  <meshStandardMaterial
    color={color}
    roughness={0.38}
    metalness={0.04}
    emissive={color}
    emissiveIntensity={active ? 0.32 : 0.16}
    depthTest={false}
    toneMapped={false}
  />
);

const SHAFT_START = 1.7;
const SHAFT_LENGTH = 5.2;
const SHAFT_RADIUS = 0.55;
const CONE_LENGTH = 2.9;
const CONE_RADIUS = 1.22;
const ARROW_HIT_RADIUS = 3.7;
const ARROW_HIT_EXTRA = 3.2;

const AXIS_ROTATION: Record<'x' | 'y' | 'z', [number, number, number]> = {
  x: [0, 0, -Math.PI / 2],
  y: [0, 0, 0],
  z: [Math.PI / 2, 0, 0],
};

const RING_ROTATION: Record<'x' | 'y' | 'z', [number, number, number]> = {
  x: [0, Math.PI / 2, 0],
  y: [Math.PI / 2, 0, 0],
  z: [0, 0, 0],
};

/** Fat Moblo-style axis arrow — thick shaft + cone, oversized invisible hit cylinder. */
export const AxisArrow: React.FC<{
  axis: 'x' | 'y' | 'z';
  color: string;
  active: boolean;
  onPointerDown: (event: any) => void;
}> = ({ axis, color, active, onPointerDown }) => {
  const shaftCenter = SHAFT_START + SHAFT_LENGTH / 2;
  const coneCenter = SHAFT_START + SHAFT_LENGTH + CONE_LENGTH / 2;
  const hitLength = SHAFT_START + SHAFT_LENGTH + CONE_LENGTH + ARROW_HIT_EXTRA;

  return (
    <group rotation={AXIS_ROTATION[axis]}>
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
    </group>
  );
};

const HUB_RADIUS = 1.28;
const HUB_THICKNESS = 0.42;
const CHEVRON_RADIUS = 0.48;
const CHEVRON_LENGTH = 1.05;
const HUB_HIT_RADIUS = 3.35;

/** Light circular hub with four planar chevrons — Moblo’s center move widget. */
export const MoveHub: React.FC<{
  active: boolean;
  onPointerDown: (event: any) => void;
}> = ({ active, onPointerDown }) => {
  const chevrons = useMemo(() => {
    return [0, Math.PI / 2, Math.PI, (3 * Math.PI) / 2].map((angle) => {
      const dir = new THREE.Vector3(Math.sin(angle), 0, Math.cos(angle));
      const quaternion = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
      const reach = HUB_RADIUS + CHEVRON_LENGTH * 0.22;
      return {
        angle,
        quaternion,
        position: [dir.x * reach, 0, dir.z * reach] as [number, number, number],
      };
    });
  }, []);

  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} renderOrder={13} frustumCulled={false}>
        <cylinderGeometry args={[HUB_RADIUS, HUB_RADIUS, HUB_THICKNESS, 28]} />
        <GizmoMaterial color={GIZMO_HUB_FILL} active={active} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} renderOrder={14} frustumCulled={false}>
        <torusGeometry args={[HUB_RADIUS, 0.11, 8, 28]} />
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
        <cylinderGeometry args={[HUB_HIT_RADIUS, HUB_HIT_RADIUS, 1.15, 20]} />
        <meshBasicMaterial visible={false} depthTest={false} />
      </mesh>
    </group>
  );
};

const RING_RADIUS = 7.4;
const RING_TUBE = 0.48;
const RING_HIT_TUBE = 2.55;
const ARC_ANGLE = Math.PI * 0.72;
const ARC_CONE_LENGTH = 1.55;
const ARC_CONE_RADIUS = 0.82;

function arcCone(angle: number, towardIncreasing: boolean) {
  const x = RING_RADIUS * Math.cos(angle);
  const y = RING_RADIUS * Math.sin(angle);
  const tx = towardIncreasing ? -Math.sin(angle) : Math.sin(angle);
  const ty = towardIncreasing ? Math.cos(angle) : -Math.cos(angle);
  const quaternion = new THREE.Quaternion().setFromUnitVectors(
    new THREE.Vector3(0, 1, 0),
    new THREE.Vector3(tx, ty, 0).normalize()
  );
  const inset = ARC_CONE_LENGTH * 0.28;
  return {
    position: [x + tx * (ARC_CONE_LENGTH / 2 - inset), y + ty * (ARC_CONE_LENGTH / 2 - inset), 0] as [number, number, number],
    quaternion,
  };
}

/** Partial torus + arrowheads — a rotate affordance you can actually read on a phone. */
export const RotateArc: React.FC<{
  axis: 'x' | 'y' | 'z';
  color: string;
  active: boolean;
  onPointerDown: (event: any) => void;
}> = ({ axis, color, active, onPointerDown }) => {
  const start = useMemo(() => arcCone(0, false), []);
  const end = useMemo(() => arcCone(ARC_ANGLE, true), []);

  return (
    <group rotation={RING_ROTATION[axis]}>
      <mesh renderOrder={12} frustumCulled={false}>
        <torusGeometry args={[RING_RADIUS, RING_TUBE, 12, 56, ARC_ANGLE]} />
        <GizmoMaterial color={color} active={active} />
      </mesh>
      <mesh position={start.position} quaternion={start.quaternion} renderOrder={12} frustumCulled={false}>
        <coneGeometry args={[ARC_CONE_RADIUS, ARC_CONE_LENGTH, 16]} />
        <GizmoMaterial color={color} active={active} />
      </mesh>
      <mesh position={end.position} quaternion={end.quaternion} renderOrder={12} frustumCulled={false}>
        <coneGeometry args={[ARC_CONE_RADIUS, ARC_CONE_LENGTH, 16]} />
        <GizmoMaterial color={color} active={active} />
      </mesh>
      <mesh
        renderOrder={22}
        frustumCulled={false}
        onPointerDown={(event) => {
          event.stopPropagation();
          onPointerDown(event);
        }}
      >
        <torusGeometry args={[RING_RADIUS, RING_HIT_TUBE, 8, 40, ARC_ANGLE]} />
        <meshBasicMaterial visible={false} depthTest={false} />
      </mesh>
    </group>
  );
};

export const RotateHub: React.FC = () => (
  <mesh renderOrder={13} frustumCulled={false}>
    <sphereGeometry args={[0.72, 20, 16]} />
    <GizmoMaterial color={GIZMO_HUB_FILL} />
  </mesh>
);

const RESIZE_CUBE = 1.95;
const RESIZE_STUB = 2.4;

const RESIZE_STUB_XFORM: Record<'+x' | '-x' | '+y' | '-y' | '+z' | '-z', { rot: [number, number, number]; pos: [number, number, number] }> = {
  '+x': { rot: [0, 0, -Math.PI / 2], pos: [-RESIZE_STUB / 2, 0, 0] },
  '-x': { rot: [0, 0, -Math.PI / 2], pos: [RESIZE_STUB / 2, 0, 0] },
  '+y': { rot: [0, 0, 0], pos: [0, -RESIZE_STUB / 2, 0] },
  '-y': { rot: [0, 0, 0], pos: [0, RESIZE_STUB / 2, 0] },
  '+z': { rot: [Math.PI / 2, 0, 0], pos: [0, 0, -RESIZE_STUB / 2] },
  '-z': { rot: [Math.PI / 2, 0, 0], pos: [0, 0, RESIZE_STUB / 2] },
};

export const ResizeCube: React.FC<{
  axis: '+x' | '-x' | '+y' | '-y' | '+z' | '-z';
  color: string;
  active: boolean;
  onPointerDown: (event: any) => void;
}> = ({ axis, color, active, onPointerDown }) => {
  const stub = RESIZE_STUB_XFORM[axis];
  return (
    <group>
      <mesh rotation={stub.rot} position={stub.pos} renderOrder={11} frustumCulled={false}>
        <cylinderGeometry args={[0.32, 0.32, RESIZE_STUB, 14]} />
        <GizmoMaterial color={color} active={active} />
      </mesh>
      <mesh renderOrder={12} frustumCulled={false}>
        <boxGeometry args={[RESIZE_CUBE, RESIZE_CUBE, RESIZE_CUBE]} />
        <GizmoMaterial color={color} active={active} />
      </mesh>
      <mesh
        renderOrder={22}
        frustumCulled={false}
        onPointerDown={(event) => {
          event.stopPropagation();
          onPointerDown(event);
        }}
      >
        <sphereGeometry args={[3.45, 12, 12]} />
        <meshBasicMaterial visible={false} depthTest={false} />
      </mesh>
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
