import React, { useState } from 'react';
import { ChevronRight, Circle, Square } from 'lucide-react';
import type { FurnitureObject } from '../../types/furniture';
import { useProjectStore } from '../../state/useProjectStore';
import { useAppStore } from '../../state/useAppStore';
import { describeHole, faceTowards, getHoles, holesUpdate, newHole, useHoleFocus } from '../../utils/holes';
import { cameraDir } from '../../templates/userTemplates';

/** Compact hole list; editing happens on the canvas (hole mode). */
export const HolesSection: React.FC<{ object: FurnitureObject; unit: string; scale: number }> = ({ object, unit, scale }) => {
  const updateObject = useProjectStore((s) => s.updateObject);
  const [choosing, setChoosing] = useState(false);
  const holes = getHoles(object);

  const enterHoleMode = (holeId: string) => {
    useAppStore.getState().setOverlayOpen('inspector', false);
    useHoleFocus.getState().edit(object.id, holeId);
  };
  const add = (kind: 'round' | 'rect') => {
    // Face that looks most toward the camera, in the part's local frame.
    const yaw = (object.rotation.y * Math.PI) / 180;
    const c = Math.cos(-yaw), s = Math.sin(-yaw);
    const local = { x: cameraDir.x * c + cameraDir.z * s, y: cameraDir.y, z: -cameraDir.x * s + cameraDir.z * c };
    const h = newHole(object, holes.length, kind, faceTowards(local));
    updateObject(object.id, holesUpdate(object, [...holes, h]));
    setChoosing(false);
    enterHoleMode(h.id);
  };

  return (
    <div className="holes-section" data-testid="holes-section">
      {holes.length > 0 && <span className="part-properties-kicker">Holes</span>}
      {holes.map((h) => (
        <button key={h.id} type="button" className="hole-list-row" data-testid="hole-row" onClick={() => enterHoleMode(h.id)}>
          <span>{describeHole(h, unit, scale)}</span>
          <ChevronRight size={14} />
        </button>
      ))}
      {choosing ? (
        <div className="hole-choice" data-testid="hole-choice">
          <button type="button" onClick={() => add('round')} data-testid="hole-add-round"><Circle size={22} /> Round</button>
          <button type="button" onClick={() => add('rect')} data-testid="hole-add-square"><Square size={22} /> Square</button>
        </div>
      ) : (
        <button type="button" className="hole-add" data-testid="hole-add" onClick={() => setChoosing(true)}>+ Add hole</button>
      )}
    </div>
  );
};
