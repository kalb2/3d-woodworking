import React, { useEffect } from 'react';
import { useThree } from '@react-three/fiber';
import { Html, Line } from '@react-three/drei';
import * as THREE from 'three';
import type { FurnitureObject, Position3D } from '../types/furniture';
import { useProjectStore } from '../state/useProjectStore';
import { formatLength, measureDistance, SNAP_LABEL, snapFloorPoint, snapMeasurePoint, type MeasurePoint } from '../utils/measure';
import { useMeasure } from './useMeasure';

const LIVE = '#f97316';
const PINNED = '#0f172a';
/** Touch aiming: the point rides this far above the finger (CSS px) once you slide or hold. */
export const AIM_OFFSET = 72;
const AIM_MOVE = 8;
const AIM_HOLD_MS = 250;

/** Screen-space endpoint pin (constant 28px at any zoom). */
const EndDot: React.FC<{ p: Position3D; color: string; testId?: string }> = ({ p, color, testId }) => (
  <group position={[p.x, p.y, p.z]}>
    <Html center zIndexRange={[26, 0]} style={{ pointerEvents: 'none' }}>
      <div className="dim-end" style={{ background: color }} data-testid={testId}><span /></div>
    </Html>
  </group>
);

const DimLine: React.FC<{ a: Position3D; b: Position3D; color: string; label: string; selected?: boolean; onTap?: () => void; testId: string }> = ({ a, b, color, label, selected, onTap, testId }) => {
  const mid: [number, number, number] = [(a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2];
  return (
    <group>
      <Line points={[[a.x, a.y, a.z], [b.x, b.y, b.z]]} color={color} lineWidth={3} depthTest={false} renderOrder={30} />
      <EndDot p={a} color={color} testId={`${testId}-pin`} />
      <EndDot p={b} color={color} testId={`${testId}-pin`} />
      <group position={mid}>
        <Html center zIndexRange={[27, 0]} wrapperClass="rotate-readout-anchor">
          <button type="button" data-testid={testId} className={`dim-label${selected ? ' is-selected' : ''}`} style={{ borderColor: color, color }}
            onPointerDown={(e) => e.stopPropagation()} onClick={(e) => { e.stopPropagation(); onTap?.(); }}>
            {label}
          </button>
        </Html>
      </group>
    </group>
  );
};

/** Big snap preview under the finger: shape per snap type plus a text chip. */
const SnapMarker: React.FC<{ p: MeasurePoint }> = ({ p }) => (
  <group position={[p.x, p.y, p.z]}>
    <Html center zIndexRange={[28, 0]} style={{ pointerEvents: 'none' }}>
      <div className="snap-marker-wrap">
        <div className={`snap-marker is-${p.kind}`} />
        <span className="snap-chip" data-testid="snap-chip">{SNAP_LABEL[p.kind]}</span>
      </div>
    </Html>
  </group>
);

/** Object id of the part a mesh belongs to (FurnitureMesh / RoomScanMesh tag their group). */
function objectIdOf(o: THREE.Object3D | null): string | null {
  for (let n = o; n; n = n.parent) if (n.userData?.objectId) return n.userData.objectId as string;
  return null;
}

/**
 * Touch-and-slide placement: while the finger is down the snap under it is
 * previewed; the point is placed on lift. Hits parts/scanned walls first,
 * else the empty floor (grid-snapped).
 */
const MeasureTracker: React.FC = () => {
  const { gl, camera, scene, raycaster } = useThree();
  useEffect(() => {
    const el = gl.domElement;
    let down = false;
    let id = -1;
    // Touch: a quick tap places right under the finger; sliding or holding switches to
    // aiming, where the point rides AIM_OFFSET px above the finger so you can see it.
    let touch = false, aiming = false, sx = 0, sy = 0, lx = 0, ly = 0;
    let hold: ReturnType<typeof setTimeout> | null = null;
    const clearHold = () => { if (hold) clearTimeout(hold); hold = null; };
    const at = (cx: number, cy: number) => (aiming ? { x: cx, y: cy - AIM_OFFSET } : { x: cx, y: cy });
    const pick = (ev: { clientX: number; clientY: number }): MeasurePoint | null => {
      const r = el.getBoundingClientRect();
      const q = at(ev.clientX, ev.clientY);
      raycaster.setFromCamera(new THREE.Vector2(((q.x - r.left) / r.width) * 2 - 1, -((q.y - r.top) / r.height) * 2 + 1), camera);
      const st = useProjectStore.getState();
      const proj = st.projects.find((p) => p.id === st.activeProjectId);
      if (!proj) return null;
      for (const hit of raycaster.intersectObjects(scene.children, true)) {
        const oid = objectIdOf(hit.object);
        if (!oid) continue;
        const part = proj.objects.find((o) => o.id === oid) as FurnitureObject | undefined;
        if (!part || part.shape === 'group' || part.visible === false) continue;
        return snapMeasurePoint(hit.point, part, Math.max(0.4, hit.distance * 0.05));
      }
      const floor = new THREE.Vector3();
      if (raycaster.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), floor)) {
        return snapFloorPoint(floor, proj.snapSettings.gridSize || 0.5);
      }
      return null;
    };
    const showAim = () => {
      const q = at(lx, ly);
      useMeasure.getState().setAim(aiming ? { fx: lx, fy: ly, x: q.x, y: q.y } : null);
    };
    const startAim = () => {
      if (!down || !touch || aiming) return;
      aiming = true;
      showAim();
      useMeasure.getState().setHover(pick({ clientX: lx, clientY: ly }));
    };
    const end = () => { down = false; aiming = false; clearHold(); useMeasure.getState().setAim(null); };
    const onDown = (ev: PointerEvent) => {
      if (!useMeasure.getState().active || down) return;
      if (ev.pointerType === 'mouse' && ev.button !== 0) return;
      down = true; id = ev.pointerId;
      touch = ev.pointerType !== 'mouse'; aiming = false;
      sx = lx = ev.clientX; sy = ly = ev.clientY;
      clearHold();
      if (touch) hold = setTimeout(startAim, AIM_HOLD_MS);
      useMeasure.getState().setHover(pick(ev));
    };
    const onMove = (ev: PointerEvent) => {
      if (!useMeasure.getState().active) return;
      if (down && ev.pointerId !== id) { end(); useMeasure.getState().setHover(null); return; } // second finger: navigating
      if (down) {
        lx = ev.clientX; ly = ev.clientY;
        if (touch && !aiming && Math.hypot(lx - sx, ly - sy) > AIM_MOVE) { startAim(); return; }
        if (aiming) showAim();
      }
      if (down || ev.pointerType === 'mouse') useMeasure.getState().setHover(pick(ev));
    };
    const onUp = (ev: PointerEvent) => {
      if (!down || ev.pointerId !== id) return;
      const p = pick(ev);
      end();
      if (p) useMeasure.getState().place(p);
      else useMeasure.getState().setHover(null);
    };
    const onCancel = () => { end(); useMeasure.getState().setHover(null); };
    el.addEventListener('pointerdown', onDown);
    el.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onCancel);
    return () => {
      el.removeEventListener('pointerdown', onDown);
      el.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onCancel);
      clearHold();
    };
  }, [gl, camera, scene, raycaster]);
  return null;
};

/** Live tape measure and pinned dimension lines (screen-space labels and markers). */
export const MeasureLayer: React.FC = () => {
  const { a, b, hover, active, selectedId, select } = useMeasure();
  const project = useProjectStore((s) => s.projects.find((p) => p.id === s.activeProjectId));
  const unit = project?.unit ?? 'in';
  const to = b ?? (a ? hover : null);
  return (
    <group>
      {active && <MeasureTracker />}
      {(project?.measurements ?? []).map((m) => (
        <DimLine key={m.id} a={m.a} b={m.b} color={selectedId === m.id ? LIVE : PINNED} selected={selectedId === m.id}
          label={formatLength(measureDistance(m.a, m.b), unit)} onTap={() => select(selectedId === m.id ? null : m.id)} testId="dim-pinned" />
      ))}
      {active && a && !to && <EndDot p={a} color={LIVE} testId="dim-live-pin" />}
      {active && a && to && <DimLine a={a} b={to} color={LIVE} label={formatLength(measureDistance(a, to), unit)} testId="dim-live" />}
      {active && hover && <SnapMarker p={hover} />}
    </group>
  );
};
