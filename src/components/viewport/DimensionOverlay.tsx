import React from 'react';
import { Html } from '@react-three/drei';
import type { FurnitureObject } from '../../types/furniture';

interface DimensionOverlayProps {
  object: FurnitureObject;
  unit: 'in' | 'cm' | 'mm';
}

export const DimensionOverlay: React.FC<DimensionOverlayProps> = ({ object, unit }) => {
  const { length, width, height } = object.dimensions;
  const { x, y, z } = object.position;

  let scale = 1;
  if (unit === 'cm') scale = 2.54;
  if (unit === 'mm') scale = 25.4;

  const displayL = (length * scale).toFixed(1);
  const displayW = (width * scale).toFixed(1);
  const displayH = (height * scale).toFixed(1);

  return (
    <group position={[x, y + height / 2 + 2, z]}>
      <Html center distanceFactor={25}>
        <div style={{
          background: 'rgba(15, 17, 23, 0.88)',
          border: '1px solid rgba(224, 159, 62, 0.6)',
          borderRadius: '8px',
          padding: '6px 12px',
          color: '#ffffff',
          fontFamily: 'Inter, sans-serif',
          fontSize: '12px',
          fontWeight: 600,
          whiteSpace: 'nowrap',
          boxShadow: '0 4px 16px rgba(0,0,0,0.5)',
          display: 'flex',
          gap: '8px',
          alignItems: 'center',
          pointerEvents: 'none'
        }}>
          <span style={{ color: '#ef4444' }}>L: {displayL}{unit}</span>
          <span style={{ color: '#3b82f6' }}>W: {displayW}{unit}</span>
          <span style={{ color: '#10b981' }}>H: {displayH}{unit}</span>
        </div>
      </Html>
    </group>
  );
};
