import React, { useEffect, useRef, useState } from 'react';
import { useThree } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import * as THREE from 'three';
import type { FurnitureObject } from '../../types/furniture';
import { useProjectStore } from '../../state/useProjectStore';
import { GIZMO_AXIS } from '../../theme/gizmo';
import { gripAnchor, meshExtents } from '../../theme/partSurface';
import { FacePad, GizmoDepthClear } from './gizmoLook';
import { DEFAULT_RESIZE_STEP } from '../../utils/resizeRules';
import { BOX_FACE_SHAPES, faceAxis, faceCenterWorld, faceDim, faceFromNormal, faceNormalWorld, faceSign, pushPull, rayAxisParam, setFaceSize, type Face } from '../../utils/pushPull';
import { NumberField } from '../ui/NumberField';
import { unitScale } from '../../utils/units';

const FACES: Face[] = ['+x', '-x', '+y', '-y', '+z', '-z'];
const ACCENT = '#f97316';

/** Translucent highlight over one face of the part (local frame). */
const FaceHighlight: React.FC<{ face: Face; dims: { length: number; height: number; width: number } }> = ({ face, dims }) => {
  const a = faceAxis(face), s = faceSign(face);
  const half = { x: dims.length / 2, y: dims.height / 2, z: dims.width / 2 };
  const pos: [number, number, number] = [0, 0, 0];
  pos[a === 'x' ? 0 : a === 'y' ? 1 : 2] = s * (half[a] + 0.02);
  const rot: [number, number, number] = a === 'x' ? [0, Math.PI / 2, 0] : a === 'y' ? [-Math.PI / 2, 0, 0] : [0, 0, 0];
  const w = a === 'x' ? dims.width : dims.length;
  const h = a === 'y' ? dims.width : dims.height;
  return (
    <mesh position={pos} rotation={rot} renderOrder={21} raycast={() => null}>
      <planeGeometry args={[w, h]} />
      <meshBasicMaterial color={ACCENT} transparent opacity={0.32} side={THREE.DoubleSide} depthWrite={false} polygonOffset polygonOffsetFactor={-4} />
    </mesh>
  );
};

/**
 * Resize mode = push/pull. Drag a face pad, or (box parts) the face itself:
 * only that side moves, the opposite face stays put. Size snaps to the
 * project's step; the readout by the face shows the size and takes a typed
 * value. One undo step per drag or typed value.
 */
export const ResizeHandles3D: React.FC<{ object: FurnitureObject }> = ({ object }) => {
  const { updateObject, pushHistoryState, saveCurrentProject } = useProjectStore();
  const [dragFace, setDragFace] = useState<Face | null>(null);
  const [focusFace, setFocusFace] = useState<Face | null>(null);
  const { camera, raycaster, gl, controls } = useThree() as any;
  const session = useRef<{ face: Face; start: FurnitureObject; P: THREE.Vector3; N: THREE.Vector3; t0: number; changed: boolean } | null>(null);

  useEffect(() => { setFocusFace(null); }, [object.id]);

  const project = useProjectStore((s) => s.projects.find((p) => p.id === s.activeProjectId));
  const unit = project?.unit ?? 'in';
  const floorOn = Boolean(project?.showFloor && project?.snapSettings.floorCollision !== false);

  const begin = (e: any, face: Face) => {
    if (!e.ray) return;
    e.stopPropagation();
    (e.target as HTMLElement)?.setPointerCapture?.(e.pointerId);
    if (controls) controls.enabled = false;
    const P = faceCenterWorld(object, face);
    const N = faceNormalWorld(object, face);
    session.current = { face, start: { ...object }, P, N, t0: rayAxisParam(e.ray.origin, e.ray.direction, P, N), changed: false };
    setDragFace(face);
    setFocusFace(face);
  };

  useEffect(() => {
    if (!dragFace) return;
    const move = (event: PointerEvent) => {
      const s = session.current;
      if (!s) return;
      const rect = gl.domElement.getBoundingClientRect();
      if (rect.width < 1 || rect.height < 1) return;
      raycaster.setFromCamera(new THREE.Vector2(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1), camera);
      const t = rayAxisParam(raycaster.ray.origin, raycaster.ray.direction, s.P, s.N);
      if (!Number.isFinite(t)) return;
      const st = useProjectStore.getState();
      const proj = st.projects.find((p) => p.id === st.activeProjectId);
      const next = pushPull(s.start, s.face, t - s.t0, {
        snap: proj?.snapSettings.enabled !== false,
        step: proj?.snapSettings.resizeStep ?? DEFAULT_RESIZE_STEP,
        unit: proj?.unit ?? 'in',
        floorOn: Boolean(proj?.showFloor && proj?.snapSettings.floorCollision !== false),
      });
      const cur = s.start.dimensions[faceDim(s.face)];
      if (!s.changed && Math.abs(next.dimensions[faceDim(s.face)] - cur) < 1e-9) return;
      s.changed = true;
      updateObject(object.id, next, true);
    };
    const up = () => {
      const s = session.current;
      if (!s) return;
      session.current = null;
      setDragFace(null);
      if (controls) controls.enabled = true;
      if (!s.changed) return; // a tap just picks the face
      pushHistoryState();
      saveCurrentProject();
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      if (controls) controls.enabled = true;
    };
  }, [dragFace, camera, gl, raycaster, controls, object.id, updateObject, pushHistoryState, saveCurrentProject]);

  if (object.shape === 'group') return null;

  const d = THREE.MathUtils.degToRad;
  const extents = meshExtents(object.shape, object.dimensions);
  const faceSizeFor = (f: Face) => {
    const L = extents.hx * 2, H = extents.hy * 2, W = extents.hz * 2;
    if (f[1] === 'x') return Math.min(H, W);
    if (f[1] === 'y') return Math.min(L, W);
    return Math.min(L, H);
  };
  const isBox = BOX_FACE_SHAPES.has(object.shape);
  const shown = dragFace ?? focusFace;
  const readoutAt = shown ? faceCenterWorld(object, shown).add(faceNormalWorld(object, shown).multiplyScalar(1.5)) : null;
  const scale = unitScale(unit);

  return (
    <>
      <group position={[object.position.x, object.position.y, object.position.z]} rotation={[d(object.rotation.x), d(object.rotation.y), d(object.rotation.z)]}>
        <GizmoDepthClear />
        {isBox && (
          // Invisible skin over the part: grab any face directly.
          <mesh
            onPointerDown={(e: any) => {
              if (!e.face) return;
              begin(e, faceFromNormal(e.face.normal));
            }}
          >
            <boxGeometry args={[object.dimensions.length * 1.002, object.dimensions.height * 1.002, object.dimensions.width * 1.002]} />
            <meshBasicMaterial colorWrite={false} depthWrite={false} transparent opacity={0} />
          </mesh>
        )}
        {shown && isBox && <FaceHighlight face={shown} dims={object.dimensions} />}
        {FACES.map((f) => (
          <group key={f} position={gripAnchor(f, extents)}>
            <FacePad axis={f} color={GIZMO_AXIS[faceAxis(f)]} faceSize={faceSizeFor(f)} active={shown === f} onPointerDown={(e) => begin(e, f)} />
          </group>
        ))}
      </group>
      {shown && readoutAt && (
        <group position={readoutAt}>
          <Html center zIndexRange={[30, 0]} wrapperClass="rotate-readout-anchor">
            <div className="rotate-readout pushpull-readout" data-testid="pushpull-readout" style={{ borderColor: GIZMO_AXIS[faceAxis(shown)] }}>
              <NumberField
                testId="pushpull-size"
                aria-label="Exact size"
                min={0.25 * scale}
                value={object.dimensions[faceDim(shown)] * scale}
                onCommit={(n) => {
                  updateObject(object.id, setFaceSize(object, shown, n / scale, floorOn), true);
                  pushHistoryState();
                  saveCurrentProject();
                }}
              />
              <span className="pushpull-unit">{unit}</span>
            </div>
          </Html>
        </group>
      )}
    </>
  );
};
