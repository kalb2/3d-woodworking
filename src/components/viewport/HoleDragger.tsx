import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { useThree } from '@react-three/fiber';
import type { BoardHole, FurnitureObject } from '../../types/furniture';
import { useProjectStore } from '../../state/useProjectStore';
import { clampHole, faceFromNormal, getHoles, hitsHole, holesUpdate, localToHole, useHoleFocus } from '../../utils/holes';

type Face = NonNullable<BoardHole['face']>;

/**
 * Invisible box over a hole-capable part. In hole mode a one-finger drag on it
 * moves the edited hole across the part's faces (orbit is paused while
 * dragging). Out of hole mode it only catches taps on an existing hole of the
 * selected part to start editing that hole; other taps pass through.
 */
export const HoleDragger: React.FC<{ object: FurnitureObject; editing: boolean }> = ({ object, editing }) => {
  const ref = useRef<THREE.Mesh>(null);
  const { camera, gl, controls } = useThree() as unknown as { camera: THREE.Camera; gl: THREE.WebGLRenderer; controls: { enabled: boolean } | null };
  const drag = useRef<{ face: Face; moved: boolean } | null>(null);
  const holeId = useHoleFocus((s) => (s.objectId === object.id ? s.holeId : null));
  const d = object.dimensions;
  const rot = new THREE.Euler(object.rotation.x * Math.PI / 180, object.rotation.y * Math.PI / 180, object.rotation.z * Math.PI / 180);

  const currentHole = (): BoardHole | undefined => {
    const st = useProjectStore.getState();
    const o = st.projects.find((p) => p.id === st.activeProjectId)?.objects.find((x) => x.id === object.id);
    return o ? getHoles(o).find((h) => h.id === holeId) : undefined;
  };

  const write = (patch: Partial<BoardHole>, skipHistory: boolean) => {
    const st = useProjectStore.getState();
    const o = st.projects.find((p) => p.id === st.activeProjectId)?.objects.find((x) => x.id === object.id);
    if (!o || !holeId) return;
    const holes = getHoles(o).map((h) => (h.id === holeId ? clampHole(o.dimensions, { ...h, ...patch }) : h));
    st.updateObject(o.id, holesUpdate(o, holes), skipHistory);
  };

  const moveTo = (localPoint: THREE.Vector3, face: Face) => {
    const at = localToHole(face, localPoint);
    const h = currentHole();
    if (!h) return;
    write(face !== (h.face ?? 'top') ? { face, ...at } : at, true);
  };

  useEffect(() => {
    if (!editing) return;
    const ray = new THREE.Raycaster();
    const ndc = new THREE.Vector2();
    const onMove = (e: PointerEvent) => {
      if (!drag.current || !ref.current) return;
      const rect = gl.domElement.getBoundingClientRect();
      ndc.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
      ray.setFromCamera(ndc, camera);
      const hit = ray.intersectObject(ref.current, false)[0];
      const mesh = ref.current;
      if (hit?.face) {
        const face = faceFromNormal(hit.face.normal);
        if (face) {
          drag.current.face = face;
          drag.current.moved = true;
          moveTo(mesh.worldToLocal(hit.point.clone()), face);
          return;
        }
      }
      // Off the part: slide along the current face's plane.
      const n = drag.current.face === 'top' ? new THREE.Vector3(0, 1, 0) : drag.current.face === 'front' ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(1, 0, 0);
      const offset = drag.current.face === 'top' ? d.height / 2 : drag.current.face === 'front' ? d.width / 2 : d.length / 2;
      const plane = new THREE.Plane(n, -offset).applyMatrix4(mesh.matrixWorld);
      const p = new THREE.Vector3();
      if (ray.ray.intersectPlane(plane, p)) {
        drag.current.moved = true;
        moveTo(mesh.worldToLocal(p), drag.current.face);
      }
    };
    const onUp = () => {
      if (!drag.current) return;
      const moved = drag.current.moved;
      drag.current = null;
      if (controls) controls.enabled = true;
      if (moved) useProjectStore.getState().pushHistoryState();
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      if (controls) controls.enabled = true;
    };
  }, [editing, camera, gl, controls, d.height, d.width, d.length]);

  const onPointerDown = (e: any) => {
    const mesh = ref.current;
    if (!mesh || !e.face) return;
    const face = faceFromNormal(e.face.normal);
    const local = mesh.worldToLocal(e.point.clone());
    if (!editing) {
      if (!face) return;
      const at = localToHole(face, local);
      const hit = getHoles(object).find((h) => hitsHole(h, face, at));
      if (!hit) return; // let the tap reach the part
      e.stopPropagation();
      useHoleFocus.getState().edit(object.id, hit.id);
      return;
    }
    e.stopPropagation();
    const h = currentHole();
    if (!h) return;
    if (controls) controls.enabled = false;
    const useFace = face ?? (h.face ?? 'top');
    drag.current = { face: useFace, moved: true };
    moveTo(local, useFace);
  };

  return (
    <mesh ref={ref} position={[object.position.x, object.position.y, object.position.z]} rotation={rot} onPointerDown={onPointerDown} renderOrder={-1}>
      <boxGeometry args={[Math.max(d.length, 0.1) * 1.002, Math.max(d.height, 0.1) * 1.002, Math.max(d.width, 0.1) * 1.002]} />
      <meshBasicMaterial transparent opacity={0} depthWrite={false} colorWrite={false} />
    </mesh>
  );
};
