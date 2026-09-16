import React from 'react';
import { Html } from '@react-three/drei';
import type { FurnitureObject } from '../../types/furniture';
import { useIsPhone } from '../../hooks/useIsPhone';

interface DimensionOverlayProps {
  object: FurnitureObject;
  unit: 'in' | 'cm' | 'mm';
}

export const DimensionOverlay: React.FC<DimensionOverlayProps> = ({ object, unit }) => {
  const isPhone = useIsPhone();
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
          background: isPhone ? 'rgba(255, 255, 255, 0.88)' : 'rgba(15, 17, 23, 0.88)',
          border: isPhone ? '1px solid rgba(15, 23, 42, 0.08)' : '1px solid rgba(224, 159, 62, 0.6)',
          borderRadius: isPhone ? '999px' : '8px',
          padding: isPhone ? '4px 10px' : '6px 12px',
          color: isPhone ? '#0f172a' : '#ffffff',
          fontFamily: 'Inter, sans-serif',
          fontSize: isPhone ? '11px' : '12px',
          fontWeight: 600,
          whiteSpace: 'nowrap',
          boxShadow: isPhone ? '0 4px 14px rgba(15, 23, 42, 0.08)' : '0 4px 16px rgba(0,0,0,0.5)',
          display: 'flex',
          gap: isPhone ? '6px' : '8px',
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
