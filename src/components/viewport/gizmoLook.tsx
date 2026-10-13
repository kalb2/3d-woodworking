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
  ROTATE_SPHERE_RADIUS,
} from '../../theme/gizmo';
import { ARROW_LEN_PX, HIT_PX, HUB_PX, PILL_PX, RING_HIT_PX, handleSortDistance, hitInside, padScale, ringRadius, screenScale, worldPerPixel } from '../../theme/handleSizing';

const _world = new THREE.Vector3();
const _center = new THREE.Vector3();

/** CSS px → world at a point, for the active camera and canvas. */
function useWpp() {
  const { camera, size } = useThree();
  return (at: THREE.Vector3) => worldPerPixel(camera.position.distanceTo(at), (camera as THREE.PerspectiveCamera).fov ?? 45, size.height);
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
 * Scale children so `baseWorld` units draw at `px` on screen (constant at any zoom).
 * Scales around its local origin (a face or the part center).
 */
export const ScreenSize: React.FC<{ px: number; baseWorld: number; children: React.ReactNode; scaleRef?: React.MutableRefObject<number> }> = ({ px, baseWorld, children, scaleRef }) => {
  const ref = useRef<THREE.Group>(null);
  const wpp = useWpp();
  useFrame(() => {
    if (!ref.current) return;
    ref.current.getWorldPosition(_world);
    const sc = screenScale(px, wpp(_world), baseWorld);
    ref.current.scale.setScalar(sc);
    if (scaleRef) scaleRef.current = sc;
  });
  return <group ref={ref} frustumCulled={false}>{children}</group>;
};

/** Widen an invisible grab (inside a ScreenSize) to at least `px` across. */
const HitWiden: React.FC<{ hitWorld: number; parentScale: React.MutableRefObject<number>; axes?: 'xz' | 'all'; px?: number; children: React.ReactNode }> = ({ hitWorld, parentScale, axes = 'all', px, children }) => {
  const ref = useRef<THREE.Group>(null);
  const wpp = useWpp();
  useFrame(() => {
    if (!ref.current) return;
    ref.current.getWorldPosition(_world);
    const k = hitInside(parentScale.current, wpp(_world), hitWorld, px);
    if (axes === 'xz') ref.current.scale.set(k, 1, k);
    else ref.current.scale.setScalar(k);
  });
  return <group ref={ref}>{children}</group>;
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
  if (intersects.length === before) return;
  // Overlapping grabs: the one whose center is nearest the finger wins.
  this.getWorldPosition(_center);
  const off = raycaster.ray.distanceToPoint(_center);
  for (let i = before; i < intersects.length; i += 1) {
    intersects[i].distance = handleSortDistance(off);
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
  const scale = useRef(1);

  return (
    <group position={[0, 0, 0]} rotation={FACE_OUT[axis]}>
      <ScreenSize px={ARROW_LEN_PX} baseWorld={SHAFT_START + SHAFT_LENGTH + CONE_LENGTH} scaleRef={scale}>
        <mesh position={[0, shaftCenter, 0]} renderOrder={12} frustumCulled={false} raycast={() => null}>
          <cylinderGeometry args={[SHAFT_RADIUS, SHAFT_RADIUS, SHAFT_LENGTH, 20]} />
          <GizmoMaterial color={color} active={active} />
        </mesh>
        <mesh position={[0, coneCenter, 0]} renderOrder={12} frustumCulled={false} raycast={() => null}>
          <coneGeometry args={[CONE_RADIUS, CONE_LENGTH, 22]} />
          <GizmoMaterial color={color} active={active} />
        </mesh>
        <HitWiden hitWorld={ARROW_HIT_RADIUS * 2} parentScale={scale} axes="xz">
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
        </HitWiden>
      </ScreenSize>
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
  const hubScale = useRef(1);
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
    <ScreenSize px={HUB_PX} baseWorld={HUB_RADIUS * 2} scaleRef={hubScale}>
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
        <HitWiden hitWorld={HUB_HIT_RADIUS * 2} parentScale={hubScale}>
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
        </HitWiden>
      </group>
    </ScreenSize>
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
  const ringScale = useRingScale();
  // Pill paint: PILL_PX wide at the ring's current scale (no shrinking when zoomed out).
  const pillRef = useRef<THREE.Group>(null);
  const pillTotal = useRef(1);
  const hitTubeRef = useRef<THREE.Mesh>(null);
  const wppAt = useWpp();
  useFrame(() => {
    if (!pillRef.current) return;
    pillRef.current.getWorldPosition(_world);
    const w = wppAt(_world);
    const k = screenScale(PILL_PX, w, PILL_RADIUS * 2 * ringScale.current);
    const kk = Math.min(Math.max(k, 0.4), 3);
    pillRef.current.scale.setScalar(kk);
    pillTotal.current = kk * ringScale.current;
    // Grab tube: RING_HIT_PX each side of the ring, whatever the zoom.
    if (hitTubeRef.current) {
      const want = (RING_HIT_PX * w) / ringScale.current;
      const g = hitTubeRef.current.geometry as THREE.TorusGeometry;
      if (Math.abs(g.parameters.tube - want) / want > 0.15) {
        hitTubeRef.current.geometry.dispose();
        hitTubeRef.current.geometry = new THREE.TorusGeometry(radius, want, 8, 48);
      }
    }
  });

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
      <mesh ref={hitTubeRef} renderOrder={21} frustumCulled={false} raycast={raycastInFrontOfSolid} onPointerDown={grab}>
        <torusGeometry args={[radius, RING_HIT_TUBE, 8, 48]} />
        <meshBasicMaterial visible={false} depthTest={false} />
      </mesh>
      <group position={pose.position} quaternion={pose.quaternion}>
       <group ref={pillRef}>
        <mesh scale={[PILL_FLAT, 1, 1]} renderOrder={13} frustumCulled={false} raycast={() => null}>
          <capsuleGeometry args={[PILL_RADIUS, PILL_LENGTH, 8, 16]} />
          <GizmoMaterial color={color} active={active} />
        </mesh>
        <HitWiden hitWorld={(PILL_RADIUS + 0.2) * 2} parentScale={pillTotal}>
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
        </HitWiden>
       </group>
      </group>
    </group>
  );
};

/* Ring scale shared by all three rings (set by RotateRings). */
const RingScaleContext = React.createContext<React.MutableRefObject<number>>({ current: 1 });
const useRingScale = () => React.useContext(RingScaleContext);

/**
 * Wraps the rotate rings (and readout): one uniform scale so the ring radius
 * is RING_RADIUS_PX on screen, clamped to the part's size (handleSizing.ringRadius).
 */
export const RotateRings: React.FC<{ objectRadius: number; children: React.ReactNode }> = ({ objectRadius, children }) => {
  const ref = useRef<THREE.Group>(null);
  const scale = useRef(1);
  const wpp = useWpp();
  useFrame(() => {
    if (!ref.current) return;
    ref.current.getWorldPosition(_world);
    scale.current = ringRadius(wpp(_world), objectRadius) / ROTATE_SPHERE_RADIUS;
    ref.current.scale.setScalar(scale.current);
  });
  return (
    <RingScaleContext.Provider value={scale}>
      <group ref={ref}>{children}</group>
    </RingScaleContext.Provider>
  );
};

const PAD_SIDE = 1.35;
const PAD_THICK = 0.28;

const _padNormal = new THREE.Vector3();
const _padPos = new THREE.Vector3();
const _padToCam = new THREE.Vector3();

/**
 * Square on the face center. Paint is screen-sized (constant-ish on screen,
 * capped to a share of the face so small parts look as before); the invisible
 * grab is at least ~44pt. Far faces draw smaller but keep the full grab.
 */
export const FacePad: React.FC<{
  axis: FaceAxis;
  color: string;
  active: boolean;
  /** Smaller side of the face this pad sits on (world inches). */
  faceSize?: number;
  onPointerDown: (event: any) => void;
}> = ({ axis, color, active, faceSize = Infinity, onPointerDown }) => {
  const faceRef = useRef<THREE.Group>(null);
  const visualRef = useRef<THREE.Group>(null);
  const hitRef = useRef<THREE.Group>(null);
  const { camera } = useThree();
  const wpp = useWpp();
  const side = PAD_SIDE;
  const thick = PAD_THICK;
  const hitSide = side + 0.55;

  useFrame(() => {
    const face = faceRef.current;
    const visual = visualRef.current;
    const hit = hitRef.current;
    if (!face || !visual || !hit) return;
    face.updateWorldMatrix(true, false);
    _padNormal.set(0, 1, 0).transformDirection(face.matrixWorld);
    face.getWorldPosition(_padPos);
    _padToCam.copy(camera.position).sub(_padPos);
    const near = _padNormal.dot(_padToCam) > 0;
    const w = wpp(_padPos);
    visual.scale.setScalar(padScale(near, w, side, faceSize));
    hit.scale.setScalar(screenScale(HIT_PX, w, hitSide));
  });

  return (
    <group ref={faceRef} rotation={FACE_OUT[axis]}>
      <group ref={visualRef}>
        <mesh position={[0, thick / 2, 0]} renderOrder={12} frustumCulled={false} raycast={() => null}>
          <boxGeometry args={[side, thick, side]} />
          <GizmoMaterial color={color} active={active} />
        </mesh>
      </group>
      <group ref={hitRef}>
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
          <boxGeometry args={[hitSide, thick + 0.5, hitSide]} />
          <meshBasicMaterial visible={false} depthTest={false} />
        </mesh>
      </group>
    </group>
  );
};

/** Exposed for tests/tuning. */
export const PAD_HIT_PX = HIT_PX;

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
