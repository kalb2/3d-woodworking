import React from 'react';
import * as THREE from 'three';

interface TransparentFloorProps {
  visible: boolean;
  opacity: number;
}

export const TransparentFloor: React.FC<TransparentFloorProps> = ({ visible, opacity }) => {
  if (!visible) return null;

  return (
    <group position={[0, -0.01, 0]}>
      {/* Semi-transparent ground plane mesh */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[200, 200]} />
        <meshPhysicalMaterial
          color="#1e293b"
          transparent
          opacity={opacity * 0.5}
          roughness={0.1}
          metalness={0.2}
          clearcoat={0.5}
          depthWrite={false}
          side={THREE.DoubleSide}
        />
      </mesh>

      {/* Grid lines helper */}
      <gridHelper
        args={[200, 100, '#e09f3e', '#334155']}
        position={[0, 0.01, 0]}
      />
    </group>
  );
};
