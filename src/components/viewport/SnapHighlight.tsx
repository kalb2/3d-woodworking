import React from 'react';
import { create } from 'zustand';
import * as THREE from 'three';
import { useProjectStore } from '../../state/useProjectStore';
import { getBoundingBox, type SnapContact } from '../../utils/snapUtils';

/** Live snap contacts while dragging; empty when not snapping. */
export const useSnapHighlight = create<{ moverId: string | null; contacts: SnapContact[]; set: (moverId: string | null, contacts: SnapContact[]) => void }>((set) => ({
  moverId: null,
  contacts: [],
  set: (moverId, contacts) => set((s) => (sameContacts(s.contacts, contacts) && s.moverId === moverId ? s : { moverId, contacts })),
}));

function sameContacts(a: SnapContact[], b: SnapContact[]) {
  return a.length === b.length && a.every((c, i) => c.targetId === b[i].targetId && c.axis === b[i].axis && c.side === b[i].side && Math.abs(c.value - b[i].value) < 1e-6);
}

export const clearSnapHighlight = () => useSnapHighlight.getState().set(null, []);

const ACCENT = '#f97316';
const AXES = ['x', 'y', 'z'] as const;

/** A flat quad on the `axis` plane at `value`, covering `box` in the other two axes. */
function FaceQuad({ box, axis, value, opacity }: { box: THREE.Box3; axis: 'x' | 'y' | 'z'; value: number; opacity: number }) {
  const [u, v] = AXES.filter((a) => a !== axis);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const pos = center.clone();
  pos[axis] = value;
  const rot: [number, number, number] = axis === 'x' ? [0, Math.PI / 2, 0] : axis === 'y' ? [-Math.PI / 2, 0, 0] : [0, 0, 0];
  // Plane geometry spans local X/Y; map to (u, v) of this face.
  const w = axis === 'x' ? size.z : size[u];
  const h = axis === 'y' ? size.z : size[v];
  return (
    <mesh position={pos} rotation={rot} renderOrder={20}>
      <planeGeometry args={[Math.max(w, 0.01) + 0.02, Math.max(h, 0.01) + 0.02]} />
      <meshBasicMaterial color={ACCENT} transparent opacity={opacity} side={THREE.DoubleSide} depthWrite={false} polygonOffset polygonOffsetFactor={-4} />
    </mesh>
  );
}

/** Highlights the face being snapped to (strong) and the mover's touching face (faint). */
export const SnapHighlight: React.FC = () => {
  const { moverId, contacts } = useSnapHighlight();
  const objects = useProjectStore((s) => s.projects.find((p) => p.id === s.activeProjectId)?.objects);
  if (!moverId || !contacts.length || !objects) return null;
  const mover = objects.find((o) => o.id === moverId);
  return (
    <group>
      {contacts.map((c, i) => {
        const target = objects.find((o) => o.id === c.targetId);
        if (!target) return null;
        return (
          <React.Fragment key={`${c.targetId}-${c.axis}-${i}`}>
            <FaceQuad box={getBoundingBox(target)} axis={c.axis} value={c.value} opacity={0.38} />
            {mover && <FaceQuad box={getBoundingBox(mover)} axis={c.axis} value={c.value} opacity={0.16} />}
          </React.Fragment>
        );
      })}
    </group>
  );
};
