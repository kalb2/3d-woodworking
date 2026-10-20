import React, { useMemo } from 'react';
import * as THREE from 'three';
import { Html } from '@react-three/drei';
import { useProjectStore } from '../../state/useProjectStore';
import { useJoinFlow } from '../../joinery/useJoinFlow';
import { jointMarker } from '../../joinery/joints';
import { fitCheck, jointTag } from '../../joinery/fitCheck';
import { rotationMatrix } from '../../utils/pushPull';
import { useReliableTap } from '../../utils/reliableTap';
import type { FurnitureObject, Joint, LengthUnit } from '../../types/furniture';

const COLOR = { fits: '#16a34a', check: '#ea580c', broken: '#dc2626' } as const;

const Tag: React.FC<{ j: Joint; R: FurnitureObject; M: FurnitureObject; unit: LengthUnit }> = ({ j, R, M, unit }) => {
  const marker = jointMarker(j, R, M);
  const fit = fitCheck(j, R, M, unit);
  const open = useReliableTap(() => {
    const v = useJoinFlow.getState().view;
    useJoinFlow.getState().edit(j.id, v?.kind === 'list' ? v : undefined);
  });
  const matrix = useMemo(() => {
    if (!marker) return null;
    const m = new THREE.Matrix4().makeTranslation(R.position.x, R.position.y, R.position.z).multiply(rotationMatrix(R));
    return m.multiply(new THREE.Matrix4().makeTranslation(marker.center.x, marker.center.y, marker.center.z));
  }, [marker, R]);
  if (!marker || !matrix) return null;
  const label = jointTag(j, R, M, unit);
  return (
    <>
      {/* Subtle highlight of the cut region, on top of the boards. */}
      <mesh matrixAutoUpdate={false} matrix={matrix} renderOrder={21} raycast={() => null}>
        <boxGeometry args={[marker.size.x, marker.size.y, marker.size.z]} />
        <meshBasicMaterial color={COLOR[fit.status]} transparent opacity={0.28} depthTest={false} depthWrite={false} />
      </mesh>
      <group position={[marker.anchor.x, marker.anchor.y, marker.anchor.z]}>
        <Html center zIndexRange={[30, 0]}>
          <button type="button" className={`joint-tag is-${fit.status}`} data-testid="joint-tag" aria-label={`${label}. ${fit.message}. Edit joint`}
            onClick={open} onPointerUp={open} onPointerDown={(e) => e.stopPropagation()}>
            <span className="joint-dot" aria-hidden="true" />{label}
          </button>
        </Html>
      </group>
    </>
  );
};

/** Joint tags on the seams: for joints of the selected parts, or all while the joints list is open. */
export const JointTags: React.FC = () => {
  const project = useProjectStore((s) => s.projects.find((p) => p.id === s.activeProjectId));
  const selected = useProjectStore((s) => s.selectedObjectIds);
  const view = useJoinFlow((f) => f.view);
  if (!project?.joints?.length) return null;
  const byId = new Map(project.objects.map((o) => [o.id, o]));
  const showAll = view?.kind === 'list' && !view.partId;
  const focus = new Set<string>(selected);
  if (view?.kind === 'list' && view.partId) focus.add(view.partId);
  const editing = view?.kind === 'edit' ? view.jointId : null;
  const shown = project.joints.filter((j) => showAll || j.id === editing || focus.has(j.receiverId) || focus.has(j.materId));
  return (
    <group>
      {shown.map((j) => {
        const R = byId.get(j.receiverId), M = byId.get(j.materId);
        if (!R || !M || R.visible === false || M.visible === false) return null;
        return <Tag key={j.id} j={j} R={R} M={M} unit={project.unit} />;
      })}
    </group>
  );
};
