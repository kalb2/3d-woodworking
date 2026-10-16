import React, { useMemo } from 'react';
import { Html, Line } from '@react-three/drei';
import type { Position3D } from '../types/furniture';
import { useProjectStore } from '../state/useProjectStore';
import { formatLength, measureDistance } from '../utils/measure';
import { useMeasure } from './useMeasure';

const LIVE = '#f97316';
const PINNED = '#0f172a';

const DimLine: React.FC<{ a: Position3D; b: Position3D; color: string; label: string; selected?: boolean; onTap?: () => void; testId: string }> = ({ a, b, color, label, selected, onTap, testId }) => {
  const mid = useMemo(() => [(a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2] as [number, number, number], [a, b]);
  return (
    <group>
      <Line points={[[a.x, a.y, a.z], [b.x, b.y, b.z]]} color={color} lineWidth={selected ? 3 : 2} depthTest={false} renderOrder={30} />
      {[a, b].map((p, i) => (
        <mesh key={i} position={[p.x, p.y, p.z]} renderOrder={31} raycast={() => null}>
          <sphereGeometry args={[0.18, 12, 12]} />
          <meshBasicMaterial color={color} depthTest={false} toneMapped={false} />
        </mesh>
      ))}
      <group position={mid}>
        <Html center zIndexRange={[25, 0]} wrapperClass="rotate-readout-anchor">
          <button type="button" data-testid={testId} className={`dim-label${selected ? ' is-selected' : ''}`} style={{ borderColor: color, color }}
            onPointerDown={(e) => e.stopPropagation()} onClick={(e) => { e.stopPropagation(); onTap?.(); }}>
            {label}
          </button>
        </Html>
      </group>
    </group>
  );
};

/** Live tape measure and pinned dimension lines (screen-space labels). */
export const MeasureLayer: React.FC = () => {
  const { a, b, active, selectedId, select } = useMeasure();
  const project = useProjectStore((s) => s.projects.find((p) => p.id === s.activeProjectId));
  const unit = project?.unit ?? 'in';
  return (
    <group>
      {(project?.measurements ?? []).map((m) => (
        <DimLine key={m.id} a={m.a} b={m.b} color={selectedId === m.id ? LIVE : PINNED} selected={selectedId === m.id}
          label={formatLength(measureDistance(m.a, m.b), unit)} onTap={() => select(selectedId === m.id ? null : m.id)} testId="dim-pinned" />
      ))}
      {active && a && !b && (
        <mesh position={[a.x, a.y, a.z]} renderOrder={31} raycast={() => null}>
          <sphereGeometry args={[0.25, 12, 12]} />
          <meshBasicMaterial color={LIVE} depthTest={false} toneMapped={false} />
        </mesh>
      )}
      {active && a && b && <DimLine a={a} b={b} color={LIVE} label={formatLength(measureDistance(a, b), unit)} testId="dim-live" />}
    </group>
  );
};
