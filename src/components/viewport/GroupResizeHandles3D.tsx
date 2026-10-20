import React, { useEffect, useRef, useState } from 'react';
import { useThree } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import * as THREE from 'three';
import type { FurnitureObject } from '../../types/furniture';
import { useProjectStore } from '../../state/useProjectStore';
import { GIZMO_AXIS } from '../../theme/gizmo';
import { gripAnchor, meshExtents } from '../../theme/partSurface';
import { FacePad, GizmoDepthClear } from './gizmoLook';
import { faceAxis, faceCenterWorld, faceDim, faceFromNormal, faceNormalWorld, rayAxisParam, type Face } from '../../utils/pushPull';
import { stretchBox } from '../../utils/groupStretch';
import { NumberField } from '../ui/NumberField';
import { unitScale } from '../../utils/units';
import { FaceHighlight } from './ResizeHandles3D';

const FACES: Face[] = ['+x', '-x', '+y', '-y', '+z', '-z'];

/** The selection's box as a plain (unturned) part, for face math and pads. */
export function selectionBoxPart(objects: FurnitureObject[], ids: string[]): FurnitureObject | null {
  const b = stretchBox(objects, ids);
  if (!b) return null;
  const any = objects.find((o) => o.id === ids[0]);
  if (!any) return null;
  return {
    ...any, id: '__selection_box', shape: 'cube', parentId: undefined,
    position: { x: (b.min.x + b.max.x) / 2, y: (b.min.y + b.max.y) / 2, z: (b.min.z + b.max.z) / 2 },
    dimensions: { length: b.max.x - b.min.x, height: b.max.y - b.min.y, width: b.max.z - b.min.z },
    rotation: { x: 0, y: 0, z: 0 },
  };
}

/**
 * Resize mode on a group or multi-selection: push/pull pads on the outline.
 * Long parts along the dragged axis stretch, thin ones keep size and move;
 * the opposite face stays put. One undo step per drag or typed value.
 */
export const GroupResizeHandles3D: React.FC<{ ids: string[] }> = ({ ids }) => {
  const { stretchSelection, pushHistoryState, saveCurrentProject } = useProjectStore();
  const project = useProjectStore((s) => s.projects.find((p) => p.id === s.activeProjectId));
  const [dragFace, setDragFace] = useState<Face | null>(null);
  const [focusFace, setFocusFace] = useState<Face | null>(null);
  const { camera, raycaster, gl, controls } = useThree() as any;
  const session = useRef<{ face: Face; start: FurnitureObject[]; size0: number; P: THREE.Vector3; N: THREE.Vector3; t0: number; changed: boolean } | null>(null);
  const key = ids.join('|');
  useEffect(() => { setFocusFace(null); }, [key]);

  const box = project ? selectionBoxPart(project.objects, ids) : null;
  const unit = project?.unit ?? 'in';

  const begin = (e: any, face: Face) => {
    if (!e.ray || !box || !project) return;
    e.stopPropagation();
    (e.target as HTMLElement)?.setPointerCapture?.(e.pointerId);
    if (controls) controls.enabled = false;
    const P = faceCenterWorld(box, face);
    const N = faceNormalWorld(box, face);
    session.current = { face, start: project.objects, size0: box.dimensions[faceDim(face)], P, N, t0: rayAxisParam(e.ray.origin, e.ray.direction, P, N), changed: false };
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
      const before = useProjectStore.getState().projects.find((p) => p.id === useProjectStore.getState().activeProjectId)?.objects;
      stretchSelection(ids, s.face, s.size0 + (t - s.t0), s.start);
      const after = useProjectStore.getState().projects.find((p) => p.id === useProjectStore.getState().activeProjectId)?.objects;
      if (after !== before) s.changed = true;
    };
    const up = () => {
      const s = session.current;
      if (!s) return;
      session.current = null;
      setDragFace(null);
      if (controls) controls.enabled = true;
      if (!s.changed) return;
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dragFace, camera, gl, raycaster, controls, key]);

  if (!box) return null;
  const extents = meshExtents('cube', box.dimensions);
  const faceSizeFor = (f: Face) => {
    const L = box.dimensions.length, H = box.dimensions.height, W = box.dimensions.width;
    if (f[1] === 'x') return Math.min(H, W);
    if (f[1] === 'y') return Math.min(L, W);
    return Math.min(L, H);
  };
  const shown = dragFace ?? focusFace;
  const readoutAt = shown ? faceCenterWorld(box, shown).add(faceNormalWorld(box, shown).multiplyScalar(1.5)) : null;
  const scale = unitScale(unit);

  return (
    <>
      <group position={[box.position.x, box.position.y, box.position.z]}>
        <GizmoDepthClear />
        <mesh onPointerDown={(e: any) => { if (e.face) begin(e, faceFromNormal(e.face.normal)); }}>
          <boxGeometry args={[box.dimensions.length * 1.002, box.dimensions.height * 1.002, box.dimensions.width * 1.002]} />
          <meshBasicMaterial colorWrite={false} depthWrite={false} transparent opacity={0} />
        </mesh>
        {shown && <FaceHighlight face={shown} dims={box.dimensions} />}
        {FACES.map((f) => (
          <group key={f} position={gripAnchor(f, extents)}>
            <FacePad axis={f} color={GIZMO_AXIS[faceAxis(f)]} faceSize={faceSizeFor(f)} active={shown === f} onPointerDown={(e) => begin(e, f)} />
          </group>
        ))}
      </group>
      {shown && readoutAt && (
        <group position={readoutAt}>
          <Html center zIndexRange={[30, 0]} wrapperClass="rotate-readout-anchor">
            <div className="rotate-readout pushpull-readout" data-testid="group-pushpull-readout" style={{ borderColor: GIZMO_AXIS[faceAxis(shown)] }}>
              <NumberField
                testId="group-pushpull-size"
                aria-label="Exact size"
                min={0.25 * scale}
                value={box.dimensions[faceDim(shown)] * scale}
                onCommit={(n) => {
                  stretchSelection(ids, shown, n / scale, undefined, true);
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
