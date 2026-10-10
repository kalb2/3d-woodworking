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
import { supportsHoles } from '../../utils/holes';
import { HolesSection } from './HolesSection';

/** Clean number: at most 2 decimals, no trailing zeros (24, 23.5, 0.75). */
export function formatMeasure(inches: number, scale: number) {
  const v = Math.round(inches * scale * 100) / 100;
  return String(Object.is(v, -0) ? 0 : v);
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

      <div className="part-properties-title-row">
        <input
          className="glass-input"
          data-testid="part-name"
          aria-label="Name"
          title={`${object.name} (${shapeLabel(object.shape)})`}
          value={object.name}
          onChange={(event) => updateObject(object.id, { name: event.target.value })}
        />
        <span className="part-properties-dims" data-testid="part-size">
          {length} × {width} × {height} {unit}
        </span>
      </div>

      {object.shape === 'board' && (
        <div className="part-properties-board" data-testid="board-tools">
          <span className="part-properties-kicker">Board ({unit})</span>
          <label>
            Corner radius
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
        </div>
      )}

      {supportsHoles(object.shape) && <HolesSection object={object} unit={unit} scale={scale} />}

      {!isGroup && <PartColorSection />}
    </div>
  );
};
