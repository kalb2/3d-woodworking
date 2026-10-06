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
  ROTATE_SPHERE_RADIUS,
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
    // Modest zoom compensation. The cap keeps grips on the part instead of filling the screen.
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
 * One grip on each hoop, at the middle of the camera-facing quarter.
 * Those three points are 60° apart on the sphere. The old red and green
 * angles both sat on the front crossing, about 24° apart, so the pills overlapped.
 * X ring is YZ, Y ring is XZ, Z ring is XY. Radius stays ROTATE_SPHERE_RADIUS.
 */
const SIDE_PILL_ANGLE: Record<'x' | 'y' | 'z', number> = {
  x: (3 * Math.PI) / 4,
  y: Math.PI / 4,
  z: Math.PI / 4,
};

const SHAFT_START = 1.55;
const SHAFT_LENGTH = 2.7;
const SHAFT_RADIUS = 0.38;
const CONE_LENGTH = 1.3;
const CONE_RADIUS = 0.82;
const ARROW_HIT_RADIUS = 1.15;
const ARROW_HIT_EXTRA = 0.35;

/** Local +Y maps onto the face normal — pull outward from the side. */
const FACE_OUT: Record<FaceAxis, [number, number, number]> = {
  '+x': [0, 0, -Math.PI / 2],
  '-x': [0, 0, Math.PI / 2],
  '+y': [0, 0, 0],
  '-y': [Math.PI, 0, 0],
  '+z': [Math.PI / 2, 0, 0],
  '-z': [-Math.PI / 2, 0, 0],
};

/**
 * Report a hit in front of any solid the handle passes through.
 * The real intersection point is unchanged; only the sort distance moves up.
 */
function raycastInFrontOfSolid(this: THREE.Mesh, raycaster: THREE.Raycaster, intersects: THREE.Intersection[]) {
  const before = intersects.length;
  THREE.Mesh.prototype.raycast.call(this, raycaster, intersects);
  for (let i = before; i < intersects.length; i += 1) {
    intersects[i].distance -= 1e6;
  }
}

/**
 * Arrow grows from the object center along its axis.
 * The shaft start is the offset, so the head is not glued to a face.
 */
export const AxisArrow: React.FC<{
  axis: FaceAxis;
  color: string;
  active: boolean;
  onPointerDown: (event: any) => void;
}> = ({ axis, color, active, onPointerDown }) => {
  const shaftCenter = SHAFT_START + SHAFT_LENGTH / 2;
  const coneCenter = SHAFT_START + SHAFT_LENGTH + CONE_LENGTH / 2;
  const hitLength = SHAFT_START + SHAFT_LENGTH + CONE_LENGTH + ARROW_HIT_EXTRA;

  return (
    <group position={[0, 0, 0]} rotation={FACE_OUT[axis]}>
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
          raycast={raycastInFrontOfSolid}
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

const HUB_RADIUS = 0.62;
const HUB_THICKNESS = 0.08;
const CHEVRON_RADIUS = 0.16;
const CHEVRON_LENGTH = 0.34;
const HUB_HIT_RADIUS = 1.05;

/** Circle and four triangles at the object center. Faces the camera; arrows stay on the axes. */
export const MoveHub: React.FC<{
  active: boolean;
  onPointerDown: (event: any) => void;
}> = ({ active, onPointerDown }) => {
  const faceRef = useRef<THREE.Group>(null);
  const { camera } = useThree();
  const chevrons = useMemo(() => {
    const reach = HUB_RADIUS + CHEVRON_LENGTH * 0.15;
    return [
      { key: 'up', position: [0, reach, 0] as [number, number, number], rotation: [0, 0, 0] as [number, number, number] },
      { key: 'down', position: [0, -reach, 0] as [number, number, number], rotation: [0, 0, Math.PI] as [number, number, number] },
      { key: 'right', position: [reach, 0, 0] as [number, number, number], rotation: [0, 0, -Math.PI / 2] as [number, number, number] },
      { key: 'left', position: [-reach, 0, 0] as [number, number, number], rotation: [0, 0, Math.PI / 2] as [number, number, number] },
    ];
  }, []);

  useFrame(() => {
    if (!faceRef.current) return;
    faceRef.current.lookAt(camera.position);
  });

  return (
    <GripSize>
      <group ref={faceRef}>
        <mesh rotation={[Math.PI / 2, 0, 0]} renderOrder={13} frustumCulled={false}>
          <cylinderGeometry args={[HUB_RADIUS, HUB_RADIUS, HUB_THICKNESS, 32]} />
          <GizmoMaterial color={GIZMO_HUB_FILL} active={active} />
        </mesh>
        <mesh rotation={[Math.PI / 2, 0, 0]} renderOrder={14} frustumCulled={false}>
          <torusGeometry args={[HUB_RADIUS, 0.045, 8, 32]} />
          <GizmoMaterial color={GIZMO_HUB_EDGE} active={active} />
        </mesh>
        {chevrons.map((chevron) => (
          <mesh
            key={chevron.key}
            position={chevron.position}
            rotation={chevron.rotation}
            renderOrder={14}
            frustumCulled={false}
          >
            <coneGeometry args={[CHEVRON_RADIUS, CHEVRON_LENGTH, 3]} />
            <GizmoMaterial color={GIZMO_HUB_CHEVRON} active={active} />
          </mesh>
        ))}
        <mesh
          rotation={[Math.PI / 2, 0, 0]}
          renderOrder={21}
          frustumCulled={false}
          raycast={raycastInFrontOfSolid}
          onPointerDown={(event) => {
            event.stopPropagation();
            onPointerDown(event);
          }}
        >
          <cylinderGeometry args={[HUB_HIT_RADIUS, HUB_HIT_RADIUS, 0.7, 16]} />
          <meshBasicMaterial visible={false} depthTest={false} />
        </mesh>
      </group>
    </GripSize>
  );
};

const PILL_RADIUS = 0.62;
const PILL_LENGTH = 1.7;
/** Flatten along the outward axis so the pill lies on the ring. */
const PILL_FLAT = 0.7;
const RING_TUBE = 0.085;
/** Invisible grab thickness so a thin ring is still easy to pinch. */
const RING_HIT_TUBE = 0.62;

function pillPose(radius: number, angle: number) {
  const position = new THREE.Vector3(radius * Math.cos(angle), radius * Math.sin(angle), 0);
  const tangent = new THREE.Vector3(-Math.sin(angle), Math.cos(angle), 0);
  const normal = new THREE.Vector3(0, 0, 1);
  const outward = new THREE.Vector3().crossVectors(tangent, normal).normalize();
  const quaternion = new THREE.Quaternion().setFromRotationMatrix(
    new THREE.Matrix4().makeBasis(outward, tangent, normal)
  );
  return { position, quaternion };
}

/** One true circle of the shared rotate sphere, plus the pill you drag. */
export const RotateRing: React.FC<{
  axis: 'x' | 'y' | 'z';
  color: string;
  active: boolean;
  onPointerDown: (event: any) => void;
}> = ({ axis, color, active, onPointerDown }) => {
  const radius = ROTATE_SPHERE_RADIUS;
  const pose = useMemo(() => pillPose(radius, SIDE_PILL_ANGLE[axis]), [radius, axis]);

  const grab = (event: any) => {
    event.stopPropagation();
    onPointerDown(event);
  };

  return (
    <group rotation={RING_ROTATION[axis]}>
      <mesh renderOrder={11} frustumCulled={false} raycast={() => null}>
        <torusGeometry args={[radius, RING_TUBE, 12, 72]} />
        <GizmoMaterial color={color} active={active} />
      </mesh>
      <mesh renderOrder={21} frustumCulled={false} raycast={raycastInFrontOfSolid} onPointerDown={grab}>
        <torusGeometry args={[radius, RING_HIT_TUBE, 8, 48]} />
        <meshBasicMaterial visible={false} depthTest={false} />
      </mesh>
      <group position={pose.position} quaternion={pose.quaternion}>
        <mesh scale={[PILL_FLAT, 1, 1]} renderOrder={13} frustumCulled={false} raycast={() => null}>
          <capsuleGeometry args={[PILL_RADIUS, PILL_LENGTH, 8, 16]} />
          <GizmoMaterial color={color} active={active} />
        </mesh>
        <mesh
          scale={[1.05, 1.15, 1.2]}
          renderOrder={22}
          frustumCulled={false}
          raycast={raycastInFrontOfSolid}
          onPointerDown={grab}
        >
          <capsuleGeometry args={[PILL_RADIUS + 0.2, PILL_LENGTH + 0.15, 6, 10]} />
          <meshBasicMaterial visible={false} depthTest={false} />
        </mesh>
      </group>
    </group>
  );
};

const PAD_SIDE = 1.35;
const PAD_THICK = 0.28;
/** Faces pointing away from the camera stay visible, but much smaller. */
const FAR_PAD_SCALE = 0.24;

const _padNormal = new THREE.Vector3();
const _padPos = new THREE.Vector3();
const _padToCam = new THREE.Vector3();

/** Square on the face center. Near faces are full size; far faces shrink as the camera orbits. */
export const FacePad: React.FC<{
  axis: FaceAxis;
  color: string;
  active: boolean;
  onPointerDown: (event: any) => void;
}> = ({ axis, color, active, onPointerDown }) => {
  const faceRef = useRef<THREE.Group>(null);
  const visualRef = useRef<THREE.Mesh>(null);
  const { camera } = useThree();
  const side = PAD_SIDE;
  const thick = PAD_THICK;

  useFrame(() => {
    const face = faceRef.current;
    const visual = visualRef.current;
    if (!face || !visual) return;
    face.updateWorldMatrix(true, false);
    _padNormal.set(0, 1, 0).transformDirection(face.matrixWorld);
    face.getWorldPosition(_padPos);
    _padToCam.copy(camera.position).sub(_padPos);
    const near = _padNormal.dot(_padToCam) > 0;
    // Shrink only the paint. The grab stays full size so the far side of a sphere still hits.
    visual.scale.setScalar(near ? 1 : FAR_PAD_SCALE);
  });

  return (
    <group ref={faceRef} rotation={FACE_OUT[axis]}>
      <GripSize>
        <mesh ref={visualRef} position={[0, thick / 2, 0]} renderOrder={12} frustumCulled={false}>
          <boxGeometry args={[side, thick, side]} />
          <GizmoMaterial color={color} active={active} />
        </mesh>
        <mesh
          position={[0, thick / 2, 0]}
          renderOrder={22}
          frustumCulled={false}
          raycast={raycastInFrontOfSolid}
          onPointerDown={(event) => {
            event.stopPropagation();
            onPointerDown(event);
          }}
        >
          <boxGeometry args={[side + 0.55, thick + 0.5, side + 0.55]} />
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
