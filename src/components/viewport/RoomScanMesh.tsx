import React, { useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import type { FurnitureObject } from '../../types/furniture';

type Kind = 'wall' | 'window' | 'door' | 'opening';

export function roomPartKind(obj: FurnitureObject): Kind {
  if (/\bWindow\b/.test(obj.name)) return 'window';
  if (/\bDoor\b/.test(obj.name)) return 'door';
  if (/\bOpening\b/.test(obj.name)) return 'opening';
  return 'wall';
}

let hatchTexture: THREE.CanvasTexture | null = null;
/** Off-white with faint diagonal hatching: reads as "architecture", never as wood. */
function getHatch(): THREE.CanvasTexture | null {
  if (hatchTexture) return hatchTexture;
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  if (!g) return null;
  g.fillStyle = '#f1f2f4';
  g.fillRect(0, 0, 64, 64);
  g.strokeStyle = 'rgba(100,116,139,0.28)';
  g.lineWidth = 2;
  for (let i = -64; i <= 64; i += 16) {
    g.beginPath(); g.moveTo(i, 64); g.lineTo(i + 64, 0); g.stroke();
  }
  hatchTexture = new THREE.CanvasTexture(c);
  hatchTexture.wrapS = hatchTexture.wrapT = THREE.RepeatWrapping;
  hatchTexture.colorSpace = THREE.SRGBColorSpace;
  return hatchTexture;
}

const DashedEdges: React.FC<{ geometry: THREE.BufferGeometry; color: string; dashed: boolean; opacity?: number }> = ({ geometry, color, dashed, opacity = 1 }) => {
  const ref = useRef<THREE.LineSegments>(null);
  const edges = useMemo(() => new THREE.EdgesGeometry(geometry), [geometry]);
  useLayoutEffect(() => { if (dashed) ref.current?.computeLineDistances(); }, [edges, dashed]);
  return (
    <lineSegments ref={ref} geometry={edges} renderOrder={2}>
      {dashed
        ? <lineDashedMaterial color={color} dashSize={4} gapSize={3} transparent opacity={opacity} toneMapped={false} />
        : <lineBasicMaterial color={color} transparent opacity={opacity} toneMapped={false} />}
    </lineSegments>
  );
};

/** Floating "Wall N" label at the top of the wall's inside face; fades out when far away. */
const WallLabel: React.FC<{ text: string; y: number; z: number }> = ({ text, y, z }) => {
  const anchor = useRef<THREE.Group>(null);
  const el = useRef<HTMLDivElement>(null);
  const tmp = useMemo(() => new THREE.Vector3(), []);
  useFrame(({ camera }) => {
    if (!anchor.current || !el.current) return;
    anchor.current.getWorldPosition(tmp);
    const d = camera.position.distanceTo(tmp);
    const o = Math.max(0, Math.min(1, (1100 - d) / 500));
    el.current.style.opacity = String(o);
    el.current.style.display = o < 0.02 ? 'none' : 'block';
  });
  return (
    <group ref={anchor} position={[0, y, z]}>
      <Html center zIndexRange={[20, 0]} style={{ pointerEvents: 'none' }}>
        <div ref={el} className="room-wall-label">{text}</div>
      </Html>
    </group>
  );
};

/** Scanned room part (wall / window / door / opening). Reference only: no wood, no part outline. */
export const RoomScanMesh: React.FC<{ object: FurnitureObject; focused: boolean; onPointerDown?: (e: any) => void }> = ({ object, focused, onPointerDown }) => {
  const { dimensions: d, position: p, rotation: r } = object;
  const kind = roomPartKind(object);
  const geometry = useMemo(() => new THREE.BoxGeometry(Math.max(d.length, 0.1), Math.max(d.height, 0.1), Math.max(d.width, 0.1)), [d.length, d.height, d.width]);
  const map = useMemo(() => {
    if (kind !== 'wall') return null;
    const base = getHatch();
    if (!base) return null;
    const t = base.clone();
    t.needsUpdate = true;
    t.repeat.set(d.length / 16, d.height / 16);
    return t;
  }, [kind, d.length, d.height]);
  if (object.visible === false) return null;

  const rot: [number, number, number] = [r.x * Math.PI / 180, r.y * Math.PI / 180, r.z * Math.PI / 180];
  const accent = '#e09f3e';
  return (
    <group position={[p.x, p.y, p.z]} rotation={rot}>
      <mesh geometry={geometry} onClick={onPointerDown} receiveShadow={kind === 'wall'} renderOrder={kind === 'wall' ? 0 : 1}>
        {kind === 'wall' && <meshStandardMaterial map={map ?? undefined} color="#ffffff" roughness={1} metalness={0} transparent opacity={0.92} />}
        {kind === 'window' && <meshStandardMaterial color="#bfe1ff" roughness={0.08} metalness={0.1} transparent opacity={0.45} depthWrite={false} />}
        {kind === 'door' && <meshStandardMaterial color="#e2e8f0" roughness={1} transparent opacity={0.3} depthWrite={false} />}
        {kind === 'opening' && <meshBasicMaterial color="#ffffff" transparent opacity={0.05} depthWrite={false} />}
      </mesh>
      {kind === 'wall' && <DashedEdges geometry={geometry} color={focused ? accent : '#94a3b8'} dashed={!focused} opacity={focused ? 1 : 0.8} />}
      {kind === 'window' && <DashedEdges geometry={geometry} color="#4f8fd0" dashed={false} />}
      {kind === 'door' && <DashedEdges geometry={geometry} color="#475569" dashed={false} />}
      {kind === 'opening' && <DashedEdges geometry={geometry} color="#64748b" dashed />}
      {kind === 'wall' && (
        <WallLabel text={object.name.replace(/ \(scan\)$/, '')} y={d.height / 2 - 8} z={d.width / 2 + 1} />
      )}
    </group>
  );
};
