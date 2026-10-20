import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { Html } from '@react-three/drei';
import { useFrame, useThree } from '@react-three/fiber';
import { useProjectStore } from '../../state/useProjectStore';
import { useJoinFlow } from '../../joinery/useJoinFlow';
import { jointMarker } from '../../joinery/joints';
import { fitCheck, jointTag, type FitResult } from '../../joinery/fitCheck';
import { TAG_HEIGHT, clusterLabel, clusterTags, tagWidth, worstStatus } from '../../joinery/tagClusters';
import { rotationMatrix } from '../../utils/pushPull';
import { useReliableTap } from '../../utils/reliableTap';
import type { FurnitureObject, Joint, LengthUnit } from '../../types/furniture';

const COLOR = { fits: '#16a34a', check: '#ea580c', broken: '#dc2626' } as const;

interface TagItem {
  j: Joint;
  label: string;
  fit: FitResult;
  /** World position of the tag. */
  at: THREE.Vector3;
  /** World matrix and size of the highlighted cut region. */
  matrix: THREE.Matrix4;
  size: { x: number; y: number; z: number };
}

function tagItem(j: Joint, R: FurnitureObject, M: FurnitureObject, unit: LengthUnit): TagItem | null {
  const marker = jointMarker(j, R, M);
  if (!marker) return null;
  const toWorld = new THREE.Matrix4().makeTranslation(R.position.x, R.position.y, R.position.z).multiply(rotationMatrix(R));
  const matrix = toWorld.clone().multiply(new THREE.Matrix4().makeTranslation(marker.center.x, marker.center.y, marker.center.z));
  const at = new THREE.Vector3(marker.anchor.x, marker.anchor.y, marker.anchor.z);
  return { j, label: jointTag(j, R, M, unit), fit: fitCheck(j, R, M, unit), at, matrix, size: marker.size };
}

const openJoint = (id: string) => {
  const v = useJoinFlow.getState().view;
  useJoinFlow.getState().edit(id, v?.kind === 'list' ? v : undefined);
};

const TagButton: React.FC<{ item: TagItem }> = ({ item }) => {
  const open = useReliableTap(() => openJoint(item.j.id));
  return (
    <button type="button" className={`joint-tag is-${item.fit.status}`} data-testid="joint-tag" aria-label={`${item.label}. ${item.fit.message}. Edit joint`}
      onClick={open} onPointerUp={open} onPointerDown={(e) => e.stopPropagation()}>
      <span className="joint-dot" aria-hidden="true" />{item.label}
    </button>
  );
};

/** Several joints too close to tag separately: one labeled chip that opens a list of their tags. */
const Cluster: React.FC<{ items: TagItem[]; open: boolean; onToggle: (open: boolean) => void }> = ({ items, open, onToggle }) => {
  const ref = useRef<HTMLDivElement>(null);
  const statuses = items.map((i) => i.fit.status);
  const status = worstStatus(statuses);
  const toggle = useReliableTap(() => onToggle(!open));
  useEffect(() => {
    if (!open) return;
    // Any tap outside the opened group closes it.
    const away = (e: PointerEvent) => { if (!ref.current?.contains(e.target as Node)) onToggle(false); };
    document.addEventListener('pointerdown', away, true);
    return () => document.removeEventListener('pointerdown', away, true);
  }, [open, onToggle]);
  return (
    <div className="joint-cluster" ref={ref} onPointerDown={(e) => e.stopPropagation()}>
      <button type="button" className={`joint-tag is-${status} is-cluster${open ? ' is-open' : ''}`} data-testid="joint-cluster" aria-expanded={open}
        aria-label={`${clusterLabel(statuses)}. ${open ? 'Hide' : 'Show'} them`} onClick={toggle} onPointerUp={toggle}>
        <span className="joint-dot" aria-hidden="true" />{clusterLabel(statuses)}
      </button>
      {open && (
        <div className="joint-cluster-list" data-testid="joint-cluster-list">
          {items.map((i) => <TagButton key={i.j.id} item={i} />)}
        </div>
      )}
    </div>
  );
};

/** Places tags each frame; tags that would overlap on screen collapse into one chip. */
const TagLayer: React.FC<{ items: TagItem[] }> = ({ items }) => {
  const camera = useThree((s) => s.camera);
  const size = useThree((s) => s.size);
  const [groups, setGroups] = useState<string[][]>(() => items.map((i) => [i.j.id]));
  const [openKey, setOpenKey] = useState<string | null>(null);
  const keyRef = useRef('');
  const view = useJoinFlow((f) => f.view);
  useEffect(() => setOpenKey(null), [view]);
  const p = useMemo(() => new THREE.Vector3(), []);
  useFrame(() => {
    const boxes = items.map((i, n) => {
      p.copy(i.at).project(camera);
      const behind = p.z > 1 || p.z < -1;
      return {
        id: i.j.id,
        x: behind ? -1e6 - n * 1e4 : ((p.x + 1) / 2) * size.width,
        y: behind ? -1e6 : ((1 - p.y) / 2) * size.height,
        w: tagWidth(i.label), h: TAG_HEIGHT,
      };
    });
    const next = clusterTags(boxes);
    const key = next.map((g) => g.join(',')).join('|');
    if (key !== keyRef.current) { keyRef.current = key; setGroups(next); }
  });
  const byId = new Map(items.map((i) => [i.j.id, i]));
  return (
    <>
      {groups.map((g) => {
        const members = g.map((id) => byId.get(id)).filter((x): x is TagItem => !!x);
        if (!members.length) return null;
        const at = members.reduce((acc, m) => acc.add(m.at), new THREE.Vector3()).divideScalar(members.length);
        const key = g.join(',');
        return (
          <group key={key} position={at}>
            <Html center zIndexRange={[30, 0]}>
              {members.length === 1
                ? <TagButton item={members[0]} />
                : <Cluster items={members} open={openKey === key} onToggle={(o) => setOpenKey(o ? key : null)} />}
            </Html>
          </group>
        );
      })}
    </>
  );
};

/** Joint tags on the seams: for joints of the selected parts, or all while the joints list is open. */
export const JointTags: React.FC = () => {
  const project = useProjectStore((s) => s.projects.find((p) => p.id === s.activeProjectId));
  const selected = useProjectStore((s) => s.selectedObjectIds);
  const view = useJoinFlow((f) => f.view);
  const items = useMemo(() => {
    if (!project?.joints?.length) return [];
    const byId = new Map(project.objects.map((o) => [o.id, o]));
    const showAll = view?.kind === 'list' && !view.partId;
    const focus = new Set<string>(selected);
    if (view?.kind === 'list' && view.partId) focus.add(view.partId);
    const editing = view?.kind === 'edit' ? view.jointId : null;
    const out: TagItem[] = [];
    for (const j of project.joints) {
      if (!(showAll || j.id === editing || focus.has(j.receiverId) || focus.has(j.materId))) continue;
      const R = byId.get(j.receiverId), M = byId.get(j.materId);
      if (!R || !M || R.visible === false || M.visible === false) continue;
      const item = tagItem(j, R, M, project.unit);
      if (item) out.push(item);
    }
    return out;
  }, [project, selected, view]);
  if (!items.length) return null;
  return (
    <group>
      {items.map((i) => (
        // Subtle highlight of the cut region, on top of the boards.
        <mesh key={i.j.id} matrixAutoUpdate={false} matrix={i.matrix} renderOrder={21} raycast={() => null}>
          <boxGeometry args={[i.size.x, i.size.y, i.size.z]} />
          <meshBasicMaterial color={COLOR[i.fit.status]} transparent opacity={0.28} depthTest={false} depthWrite={false} />
        </mesh>
      ))}
      <TagLayer items={items} />
    </group>
  );
};
