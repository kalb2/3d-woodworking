import React from 'react';
import { create } from 'zustand';
import * as THREE from 'three';
import { useProjectStore } from '../../state/useProjectStore';
import { Html, Line } from '@react-three/drei';
import { getBoundingBox, type SnapContact } from '../../utils/snapUtils';
import type { Alignment } from '../../utils/snapInfer';
import { GIZMO_AXIS } from '../../theme/gizmo';

/** Live snap contacts while dragging; empty when not snapping. */
export const useSnapHighlight = create<{
  moverId: string | null;
  contacts: SnapContact[];
  alignments: Alignment[];
  hint: string | null;
  set: (moverId: string | null, contacts: SnapContact[], extra?: { alignments?: Alignment[]; hint?: string | null }) => void;
}>((set) => ({
  moverId: null,
  contacts: [],
  alignments: [],
  hint: null,
  set: (moverId, contacts, extra) => set((s) => {
    const alignments = extra?.alignments ?? [];
    const hint = extra?.hint ?? null;
    if (sameContacts(s.contacts, contacts) && s.moverId === moverId && hint === s.hint && sameAlign(s.alignments, alignments)) return s;
    return { moverId, contacts, alignments, hint };
  }),
}));

function sameAlign(a: Alignment[], b: Alignment[]) {
  return a.length === b.length && a.every((x, i) => x.axis === b[i].axis && x.kind === b[i].kind && x.targetId === b[i].targetId && Math.abs(x.value - b[i].value) < 1e-6
    && Math.abs(x.from.x - b[i].from.x) + Math.abs(x.from.y - b[i].from.y) + Math.abs(x.from.z - b[i].from.z) < 1e-3);
}

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
  const { moverId, contacts, alignments, hint } = useSnapHighlight();
  const objects = useProjectStore((s) => s.projects.find((p) => p.id === s.activeProjectId)?.objects);
  if (!moverId || (!contacts.length && !alignments.length && !hint) || !objects) return null;
  const mover = objects.find((o) => o.id === moverId);
  const mb = mover ? getBoundingBox(mover) : null;
  return (
    <group>
      {alignments.map((al, i) => (
        <Line key={`al-${i}`} points={[[al.from.x, al.from.y, al.from.z], [al.to.x, al.to.y, al.to.z]]} color={GIZMO_AXIS[al.axis]}
          lineWidth={1.5} dashed dashSize={1} gapSize={0.7} depthTest={false} renderOrder={22} />
      ))}
      {hint && mb && (
        <group position={[(mb.min.x + mb.max.x) / 2, mb.max.y, (mb.min.z + mb.max.z) / 2]}>
          <Html center zIndexRange={[29, 0]} style={{ pointerEvents: 'none' }}>
            <span className="snap-hint" data-testid="snap-hint">{hint}</span>
          </Html>
        </group>
      )}
      {contacts.map((c, i) => {
        const target = objects.find((o) => o.id === c.targetId);
        if (!target) return null;
        if (c.yaw !== undefined) {
          // Turned target (scanned wall/opening): draw in its own frame.
          const T = target.dimensions;
          const local = new THREE.Box3(new THREE.Vector3(-T.length / 2, -T.height / 2, -T.width / 2), new THREE.Vector3(T.length / 2, T.height / 2, T.width / 2));
          return (
            <group key={`${c.targetId}-${c.axis}-${i}`} position={[target.position.x, target.position.y, target.position.z]} rotation={[0, (c.yaw * Math.PI) / 180, 0]}>
              <FaceQuad box={local} axis={c.axis} value={c.value + (c.side === 'max' ? 0.03 : -0.03)} opacity={0.38} />
            </group>
          );
        }
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
