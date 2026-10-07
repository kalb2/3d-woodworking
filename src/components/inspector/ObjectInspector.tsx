import React from 'react';
import { useProjectStore } from '../../state/useProjectStore';
import { useAppStore } from '../../state/useAppStore';
import { useIsPhone } from '../../hooks/useIsPhone';
import { OverlayDismissButton } from '../layout/OverlayChrome';
import { PHONE_SHEET_EMBEDDED_STYLE } from '../layout/phoneSheet';
import { PartColorSection } from './MaterialPicker';
import { unitScale } from '../../utils/units';
import type { RoutedEdge } from '../../types/furniture';
import { defaultBoardOptions } from '../../utils/boardGeometry';
import { shapeLabel } from '../../catalog/shapeCatalog';

function formatMeasure(inches: number, scale: number) {
  return (inches * scale).toFixed(2);
}

export const ObjectInspector: React.FC = () => {
  const isPhone = useIsPhone();
  const { overlays, setOverlayOpen } = useAppStore();
  const { projects, activeProjectId, selectedObjectId, updateObject } = useProjectStore();

  const currentProject = projects.find((project) => project.id === activeProjectId);
  if (!overlays.inspector || !currentProject || !selectedObjectId) return null;

  const object = currentProject.objects.find((item) => item.id === selectedObjectId);
  if (!object) return null;

  const unit = currentProject.unit;
  const scale = unitScale(unit);
  const isGroup = object.shape === 'group';
  const board = object.board ?? defaultBoardOptions();
  const length = formatMeasure(object.dimensions.length, scale);
  const width = formatMeasure(object.dimensions.width, scale);
  const height = formatMeasure(object.dimensions.height, scale);

  return (
    <div
      className={`project-overlay project-overlay-inspector part-properties${isPhone ? ' phone-sheet-embed' : ' glass-panel'}`}
      data-testid="overlay-inspector"
      style={isPhone ? {
        ...PHONE_SHEET_EMBEDDED_STYLE,
        padding: '0 16px 12px',
        overflowY: 'auto',
      } : {
        position: 'absolute',
        top: 'var(--ipad-panel-top)',
        right: 16,
        left: 'auto',
        width: 348,
        borderRadius: 16,
        zIndex: 40,
        padding: 16,
        maxHeight: 'calc(100dvh - var(--ipad-panel-top) - 24px - env(safe-area-inset-bottom, 0px))',
        overflowY: 'auto',
        display: 'flex',
        flexDirection: 'column',
        gap: 14,
      }}
    >
      <div className="part-properties-head">
        <span>Properties</span>
        <OverlayDismissButton onDismiss={() => setOverlayOpen('inspector', false)} />
      </div>

      <label className="part-properties-name">
        Name
        <input
          className="glass-input"
          data-testid="part-name"
          value={object.name}
          onChange={(event) => updateObject(object.id, { name: event.target.value })}
        />
      </label>
      <p className="part-properties-shape" data-testid="part-shape">{shapeLabel(object.shape)}</p>

      <p className="part-properties-size" data-testid="part-size">
        <span>{length}</span>
        <span aria-hidden="true">×</span>
        <span>{width}</span>
        <span aria-hidden="true">×</span>
        <span>{height}</span>
        <span className="part-properties-unit">{unit}</span>
      </p>
      <p className="part-properties-size-caption">Length × width × height. Change size with Resize.</p>

      {isGroup && (
        <p className="part-properties-note" data-testid="group-properties-note">
          This group moves and rotates as one piece. Choose Edit parts to change a member.
        </p>
      )}

      {object.shape === 'board' && (
        <div className="part-properties-board" data-testid="board-tools">
          <span className="part-properties-kicker">Board</span>
          <label>
            Corner radius ({unit})
            <input
              type="number"
              className="glass-input"
              data-testid="board-corner-radius"
              min={0}
              step="0.25"
              value={formatMeasure(board.cornerRadius, scale)}
              onChange={(event) => {
                const num = parseFloat(event.target.value);
                if (Number.isNaN(num) || num < 0) return;
                updateObject(object.id, { board: { ...board, cornerRadius: num / scale } });
              }}
            />
          </label>
          <div className="part-properties-edges">
            {(['none', 'roundover', 'chamfer'] as RoutedEdge[]).map((edge) => (
              <button
                key={edge}
                type="button"
                data-testid={`board-edge-${edge}`}
                className={`glass-button${board.edge === edge ? ' active' : ''}`}
                onClick={() => updateObject(object.id, { board: { ...board, edge } })}
              >
                {edge === 'none' ? 'Square' : edge === 'roundover' ? 'Round' : 'Chamfer'}
              </button>
            ))}
          </div>
          <label>
            Hole diameter ({unit})
            <input
              type="number"
              className="glass-input"
              data-testid="board-hole-diameter"
              min={0}
              step="0.25"
              value={formatMeasure(board.holes[0]?.diameter ?? 0, scale)}
              onChange={(event) => {
                const num = parseFloat(event.target.value);
                if (Number.isNaN(num) || num < 0) return;
                const diameter = num / scale;
                const holes = board.holes.length
                  ? board.holes.map((hole, index) => index === 0 ? { ...hole, diameter } : hole)
                  : [{ id: `hole_${Date.now()}`, x: 0, z: 0, diameter }];
                updateObject(object.id, { board: { ...board, holes } });
              }}
            />
          </label>
          <button
            type="button"
            className="glass-button"
            data-testid="board-add-hole"
            onClick={() => updateObject(object.id, {
              board: {
                ...board,
                holes: [...board.holes, { id: `hole_${Date.now()}`, x: board.holes.length * 2, z: 0, diameter: 1 }],
              },
            })}
          >
            Add hole
          </button>
        </div>
      )}

      {!isGroup && <PartColorSection />}
    </div>
  );
};
