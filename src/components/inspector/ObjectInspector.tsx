import React from 'react';
import { RotateCw, Copy, Trash2, Type } from 'lucide-react';
import { useProjectStore } from '../../state/useProjectStore';
import { useAppStore } from '../../state/useAppStore';
import { useIsPhone } from '../../hooks/useIsPhone';
import { OverlayDismissButton } from '../layout/OverlayChrome';
import { PHONE_SHEET_EMBEDDED_STYLE } from '../layout/phoneSheet';
import { PartColorSection } from './MaterialPicker';
import { useReliableTap } from '../../utils/reliableTap';
import { unitScale } from '../../utils/units';
import type { LengthUnit, RoutedEdge } from '../../types/furniture';
import { defaultBoardOptions } from '../../utils/boardGeometry';

export const ObjectInspector: React.FC = () => {
  const isPhone = useIsPhone();
  const { overlays, setOverlayOpen } = useAppStore();
  const {
    projects,
    activeProjectId,
    selectedObjectId,
    updateObject,
    deleteObject,
    duplicateObject,
    setUnit
  } = useProjectStore();

  const handleDuplicate = useReliableTap(() => {
    if (selectedObjectId) duplicateObject(selectedObjectId);
  });
  const handleDelete = useReliableTap(() => {
    if (selectedObjectId) deleteObject(selectedObjectId);
  });

  const currentProject = projects.find(p => p.id === activeProjectId);
  if (!overlays.inspector || !currentProject || !selectedObjectId) return null;

  const object = currentProject.objects.find(o => o.id === selectedObjectId);
  if (!object) return null;

  const unit = currentProject.unit;
  const scale = unitScale(unit);
  const isGroup = object.shape === 'group';
  const board = object.board ?? defaultBoardOptions();

  const displayLength = (object.dimensions.length * scale).toFixed(2);
  const displayWidth = (object.dimensions.width * scale).toFixed(2);
  const displayHeight = (object.dimensions.height * scale).toFixed(2);

  const handleDimensionChange = (key: 'length' | 'width' | 'height', valueStr: string) => {
    const num = parseFloat(valueStr);
    if (isNaN(num) || num <= 0) return;
    const valueInInches = num / scale;

    updateObject(object.id, {
      dimensions: {
        ...object.dimensions,
        [key]: valueInInches
      }
    });
  };

  const handlePositionChange = (key: 'x' | 'y' | 'z', valueStr: string) => {
    const num = parseFloat(valueStr);
    if (isNaN(num)) return;
    updateObject(object.id, {
      position: {
        ...object.position,
        [key]: num
      }
    });
  };

  const handleRotationChange = (key: 'x' | 'y' | 'z', valueStr: string) => {
    const num = parseFloat(valueStr);
    if (isNaN(num)) return;
    updateObject(object.id, {
      rotation: {
        ...object.rotation,
        [key]: num
      }
    });
  };

  const rotateStep = (axis: 'x' | 'y' | 'z', degrees: number) => {
    const currentAngle = object.rotation[axis];
    const newAngle = (currentAngle + degrees) % 360;
    updateObject(object.id, {
      rotation: {
        ...object.rotation,
        [axis]: newAngle
      }
    });
  };

  return (
    <div
      className={`project-overlay project-overlay-inspector${isPhone ? ' phone-sheet-embed' : ' glass-panel'}`}
      data-testid="overlay-inspector"
      style={isPhone ? {
        ...PHONE_SHEET_EMBEDDED_STYLE,
        padding: '0 16px 12px',
        overflowY: 'auto',
        WebkitOverflowScrolling: 'touch',
        gap: 16
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
        WebkitOverflowScrolling: 'touch',
        display: 'flex',
        flexDirection: 'column',
        gap: 16
      }}
    >
      {/* Object Header & Rename */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <span style={{ fontSize: 13, fontWeight: 700, letterSpacing: 0.3 }}>Part properties</span>
          <OverlayDismissButton onDismiss={() => setOverlayOpen('inspector', false)} />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Type size={16} color="#e09f3e" />
          <input
            className="glass-input"
            value={object.name}
            onChange={(e) => updateObject(object.id, { name: e.target.value })}
            style={{ fontWeight: 600, fontSize: 14 }}
          />
        </div>
      </div>

      {/* DIMENSIONS SECTION */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: '#e09f3e', textTransform: 'uppercase', letterSpacing: 0.5 }}>
            Dimensions ({unit})
          </span>

          <div style={{ display: 'flex', gap: 2, background: 'rgba(0,0,0,0.3)', padding: 2, borderRadius: 6 }}>
            {(['in', 'cm', 'mm', 'ft'] as LengthUnit[]).map(u => (
              <button
                key={u}
                onClick={() => setUnit(u)}
                style={{
                  background: unit === u ? '#e09f3e' : 'transparent',
                  color: unit === u ? '#000' : '#9ca3af',
                  border: 'none',
                  borderRadius: 4,
                  padding: '2px 8px',
                  fontSize: 11,
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                {u}
              </button>
            ))}
          </div>
        </div>

        {/* Length (X), Width (Z), Height (Y) Direct Numeric Inputs */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
          <div>
            <label style={{ fontSize: 11, color: '#ef4444', display: 'block', marginBottom: 4, fontWeight: 600 }}>Length (X)</label>
            <input
              type="number"
              className="glass-input"
              value={displayLength}
              step="0.5"
              disabled={isGroup}
              onChange={(e) => handleDimensionChange('length', e.target.value)}
            />
          </div>

          <div>
            <label style={{ fontSize: 11, color: '#3b82f6', display: 'block', marginBottom: 4, fontWeight: 600 }}>Width (Z)</label>
            <input
              type="number"
              className="glass-input"
              value={displayWidth}
              step="0.5"
              disabled={isGroup}
              onChange={(e) => handleDimensionChange('width', e.target.value)}
            />
          </div>

          <div>
            <label style={{ fontSize: 11, color: '#10b981', display: 'block', marginBottom: 4, fontWeight: 600 }}>Height (Y)</label>
            <input
              type="number"
              className="glass-input"
              value={displayHeight}
              step="0.5"
              disabled={isGroup}
              onChange={(e) => handleDimensionChange('height', e.target.value)}
            />
          </div>
        </div>
        {isGroup && (
          <p style={{ margin: 0, fontSize: 12, color: '#9ca3af' }} data-testid="group-properties-note">
            This group moves and rotates as one piece. Choose Edit parts to change a member.
          </p>
        )}
      </div>

      {object.shape === 'board' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }} data-testid="board-tools">
          <span style={{ fontSize: 12, fontWeight: 700, color: '#e09f3e', textTransform: 'uppercase', letterSpacing: 0.5 }}>
            Board
          </span>
          <label style={{ fontSize: 11, color: '#9ca3af' }}>
            Corner radius ({unit})
            <input
              type="number"
              className="glass-input"
              data-testid="board-corner-radius"
              min={0}
              step="0.25"
              value={(board.cornerRadius * scale).toFixed(2)}
              onChange={(e) => {
                const num = parseFloat(e.target.value);
                if (Number.isNaN(num) || num < 0) return;
                updateObject(object.id, { board: { ...board, cornerRadius: num / scale } });
              }}
            />
          </label>
          <div style={{ display: 'flex', gap: 6 }}>
            {(['none', 'roundover', 'chamfer'] as RoutedEdge[]).map((edge) => (
              <button
                key={edge}
                type="button"
                data-testid={`board-edge-${edge}`}
                className="glass-button"
                onClick={() => updateObject(object.id, { board: { ...board, edge } })}
                style={{
                  flex: 1,
                  minHeight: 40,
                  background: board.edge === edge ? '#e09f3e' : undefined,
                  color: board.edge === edge ? '#000' : undefined,
                }}
              >
                {edge === 'none' ? 'Square' : edge === 'roundover' ? 'Round' : 'Chamfer'}
              </button>
            ))}
          </div>
          <label style={{ fontSize: 11, color: '#9ca3af' }}>
            Hole diameter ({unit})
            <input
              type="number"
              className="glass-input"
              data-testid="board-hole-diameter"
              min={0}
              step="0.25"
              value={((board.holes[0]?.diameter ?? 0) * scale).toFixed(2)}
              onChange={(e) => {
                const num = parseFloat(e.target.value);
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

      {/* ROTATION & FINGER ROTATE BUTTONS */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: '#e09f3e', textTransform: 'uppercase', letterSpacing: 0.5 }}>
          Rotation (Degrees)
        </span>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
          <div>
            <label style={{ fontSize: 11, color: '#9ca3af', display: 'block', marginBottom: 4 }}>Pitch (X)</label>
            <input
              type="number"
              className="glass-input"
              value={object.rotation.x}
              onChange={(e) => handleRotationChange('x', e.target.value)}
            />
          </div>

          <div>
            <label style={{ fontSize: 11, color: '#9ca3af', display: 'block', marginBottom: 4 }}>Yaw (Y)</label>
            <input
              type="number"
              className="glass-input"
              value={object.rotation.y}
              onChange={(e) => handleRotationChange('y', e.target.value)}
            />
          </div>

          <div>
            <label style={{ fontSize: 11, color: '#9ca3af', display: 'block', marginBottom: 4 }}>Roll (Z)</label>
            <input
              type="number"
              className="glass-input"
              value={object.rotation.z}
              onChange={(e) => handleRotationChange('z', e.target.value)}
            />
          </div>
        </div>

        <div style={{ display: 'flex', gap: 6 }}>
          <button
            className="glass-button"
            onClick={() => rotateStep('y', 90)}
            style={{ flex: 1, padding: '6px 8px', fontSize: 12 }}
          >
            <RotateCw size={14} /> +90° Y
          </button>

          <button
            className="glass-button"
            onClick={() => rotateStep('x', 90)}
            style={{ flex: 1, padding: '6px 8px', fontSize: 12 }}
          >
            <RotateCw size={14} /> +90° X
          </button>
        </div>
      </div>

      {/* POSITION SECTION */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: '#e09f3e', textTransform: 'uppercase', letterSpacing: 0.5 }}>
          Position Coordinates
        </span>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
          <div>
            <label style={{ fontSize: 11, color: '#9ca3af', display: 'block', marginBottom: 4 }}>X</label>
            <input
              type="number"
              className="glass-input"
              value={object.position.x.toFixed(1)}
              onChange={(e) => handlePositionChange('x', e.target.value)}
            />
          </div>

          <div>
            <label style={{ fontSize: 11, color: '#9ca3af', display: 'block', marginBottom: 4 }}>Y</label>
            <input
              type="number"
              className="glass-input"
              value={object.position.y.toFixed(1)}
              onChange={(e) => handlePositionChange('y', e.target.value)}
            />
          </div>

          <div>
            <label style={{ fontSize: 11, color: '#9ca3af', display: 'block', marginBottom: 4 }}>Z</label>
            <input
              type="number"
              className="glass-input"
              value={object.position.z.toFixed(1)}
              onChange={(e) => handlePositionChange('z', e.target.value)}
            />
          </div>
        </div>
      </div>

      {/* QUICK ACTIONS */}
      <div className="inspector-quick-actions" style={{ display: 'flex', gap: 8, marginTop: 8 }}>
        <button
          className="glass-button"
          onClick={handleDuplicate}
          onPointerUp={handleDuplicate}
          style={{ flex: 1 }}
          data-testid="inspector-duplicate"
        >
          <Copy size={16} /> Duplicate
        </button>

        <button
          className="glass-button"
          onClick={handleDelete}
          onPointerUp={handleDelete}
          style={{ flex: 1, borderColor: 'rgba(239, 68, 68, 0.4)', color: '#ef4444' }}
          data-testid="inspector-delete"
        >
          <Trash2 size={16} /> Delete
        </button>
      </div>
    </div>
  );
};
