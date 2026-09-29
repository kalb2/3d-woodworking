import React from 'react';

interface TransparentFloorProps {
  visible: boolean;
  opacity: number;
}

/**
 * One workshop floor. The old plane + gridHelper stack read as two grounds
 * on mobile; Floor on is the grid alone.
 */
export const TransparentFloor: React.FC<TransparentFloorProps> = ({ visible }) => {
  if (!visible) return null;

  return (
    <group position={[0, -0.01, 0]}>
      <gridHelper
        args={[200, 100, '#e09f3e', '#334155']}
        position={[0, 0.01, 0]}
      />
    </group>
  );
};
