import React, { useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Line, RoundedBox } from '@react-three/drei';
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

export const GizmoMaterial: React.FC<{
  color: string;
  active?: boolean;
  opacity?: number;
}> = ({ color, active = false, opacity = 1 }) => (
  <meshStandardMaterial
    color={color}
    roughness={0.36}
    metalness={0.04}
    emissive={color}
    emissiveIntensity={active ? 0.3 : 0.14}
    depthTest={false}
    depthWrite={opacity >= 1}
    toneMapped={false}
    transparent={opacity < 1}
    opacity={opacity}
  />
);

const SHAFT_START = 1.55;
const SHAFT_LENGTH = 3.45;
const SHAFT_RADIUS = 0.4;
const CONE_LENGTH = 2.2;
const CONE_RADIUS = 1.08;
const ARROW_HIT_RADIUS = 3.5;
const ARROW_HIT_EXTRA = 2.6;

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

/** Moblo move arrow: thick shaft + cone clearly wider than the shaft. */
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

const HUB_RADIUS = 1.18;
const HUB_THICKNESS = 0.36;
const CHEVRON_RADIUS = 0.34;
const CHEVRON_LENGTH = 0.72;
const HUB_HIT_RADIUS = 3.2;

/** White/light hub with planar compass chevrons. */
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
    <group>
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
    </group>
  );
};

const RING_RADIUS = 7.1;
const RING_TUBE = 0.13;
const PILL_TUBE = 0.78;
const PILL_ARC = Math.PI * 0.3;
const RING_HIT_TUBE = 2.5;

const PILL_ANGLE: Record<'x' | 'y' | 'z', number> = {
  x: Math.PI * 0.22,
  y: Math.PI * 0.38,
  z: Math.PI * 0.58,
};

/** Full RGB ring + fat curved pill grip (Moblo rotate). */
export const RotateRing: React.FC<{
  axis: 'x' | 'y' | 'z';
  color: string;
  active: boolean;
  onPointerDown: (event: any) => void;
}> = ({ axis, color, active, onPointerDown }) => {
  const pillAngle = PILL_ANGLE[axis];
  const endA: [number, number, number] = [RING_RADIUS, 0, 0];
  const endB: [number, number, number] = [
    RING_RADIUS * Math.cos(PILL_ARC),
    RING_RADIUS * Math.sin(PILL_ARC),
    0,
  ];

  return (
    <group rotation={RING_ROTATION[axis]}>
      <mesh renderOrder={11} frustumCulled={false}>
        <torusGeometry args={[RING_RADIUS, RING_TUBE, 12, 80]} />
        <GizmoMaterial color={color} active={active} opacity={0.92} />
      </mesh>
      <group rotation={[0, 0, pillAngle]}>
        <mesh renderOrder={13} frustumCulled={false}>
          <torusGeometry args={[RING_RADIUS, PILL_TUBE, 16, 28, PILL_ARC]} />
          <GizmoMaterial color={color} active={active} />
        </mesh>
        <mesh position={endA} renderOrder={13} frustumCulled={false}>
          <sphereGeometry args={[PILL_TUBE, 16, 12]} />
          <GizmoMaterial color={color} active={active} />
        </mesh>
        <mesh position={endB} renderOrder={13} frustumCulled={false}>
          <sphereGeometry args={[PILL_TUBE, 16, 12]} />
          <GizmoMaterial color={color} active={active} />
        </mesh>
      </group>
      <mesh
        renderOrder={22}
        frustumCulled={false}
        onPointerDown={(event) => {
          event.stopPropagation();
          onPointerDown(event);
        }}
      >
        <torusGeometry args={[RING_RADIUS, RING_HIT_TUBE, 8, 56]} />
        <meshBasicMaterial visible={false} depthTest={false} />
      </mesh>
    </group>
  );
};

const PAD = 2.2;
const PAD_THICK = 0.58;
const PAD_RADIUS = 0.22;

const FACE_ROTATION: Record<'+x' | '-x' | '+y' | '-y' | '+z' | '-z', [number, number, number]> = {
  '+x': [0, 0, -Math.PI / 2],
  '-x': [0, 0, Math.PI / 2],
  '+y': [0, 0, 0],
  '-y': [Math.PI, 0, 0],
  '+z': [Math.PI / 2, 0, 0],
  '-z': [-Math.PI / 2, 0, 0],
};

/** Moblo resize: rounded RGB face pad sitting on the part face. */
export const FacePad: React.FC<{
  axis: '+x' | '-x' | '+y' | '-y' | '+z' | '-z';
  color: string;
  active: boolean;
  onPointerDown: (event: any) => void;
}> = ({ axis, color, active, onPointerDown }) => (
  <group rotation={FACE_ROTATION[axis]}>
    <RoundedBox
      args={[PAD, PAD_THICK, PAD]}
      radius={PAD_RADIUS}
      smoothness={4}
      position={[0, PAD_THICK / 2, 0]}
      renderOrder={12}
      frustumCulled={false}
    >
      <GizmoMaterial color={color} active={active} />
    </RoundedBox>
    <mesh
      position={[0, PAD_THICK / 2, 0]}
      renderOrder={22}
      frustumCulled={false}
      onPointerDown={(event) => {
        event.stopPropagation();
        onPointerDown(event);
      }}
    >
      <boxGeometry args={[PAD + 1.5, PAD_THICK + 1.8, PAD + 1.5]} />
      <meshBasicMaterial visible={false} depthTest={false} />
    </mesh>
  </group>
);

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
