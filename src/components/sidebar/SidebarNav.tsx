import React, { useState } from 'react';
import {
  Box,
  Cylinder,
  Circle,
  Triangle,
  LayoutGrid,
  Armchair,
  Table,
  BookOpen,
  Eye,
  EyeOff,
  Trash2,
  Copy,
  Layers
} from 'lucide-react';
import { useProjectStore, STANDARD_WOOD_PRESETS } from '../../state/useProjectStore';
import { useAppStore } from '../../state/useAppStore';
import { useIsPhone } from '../../hooks/useIsPhone';
import { OverlayDismissButton, PhoneSheetGrab } from '../layout/OverlayChrome';
import { PHONE_SHEET_STYLE } from '../layout/phoneSheet';
import { fireReliableTap } from '../../utils/reliableTap';
import type { ShapeType } from '../../types/furniture';

export const SidebarNav: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'shapes' | 'templates' | 'scene'>('shapes');
  const isPhone = useIsPhone();
  const { overlays, setOverlayOpen } = useAppStore();
  const {
    addObject,
    addWoodPreset,
    addPresetTemplate,
    projects,
    activeProjectId,
    selectedObjectId,
    selectObject,
    deleteObject,
    duplicateObject,
    updateObject
  } = useProjectStore();

  const currentProject = projects.find(p => p.id === activeProjectId);

  if (!overlays.sidebar) return null;

  const shapes: { type: ShapeType; label: string; icon: any }[] = [
    { type: 'bevel_top', label: 'Beveled Tabletop', icon: LayoutGrid },
    { type: 'cube', label: 'Box / Panel', icon: Box },
    { type: 'cylinder', label: 'Round Leg / Pole', icon: Cylinder },
    { type: 'sphere', label: 'Sphere Knob', icon: Circle },
    { type: 'wedge', label: 'Triangular Wedge', icon: Triangle },
    { type: 'cushion', label: 'Soft Cushion', icon: Armchair }
  ];

  return (
    <aside
      className={`glass-panel project-overlay project-overlay-sidebar${isPhone ? ' phone-bottom-sheet' : ''}`}
      data-testid="overlay-sidebar"
      style={isPhone ? {
        ...PHONE_SHEET_STYLE,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden'
      } : {
        position: 'absolute',
        top: 88,
        left: 16,
        bottom: 24,
        width: 280,
        borderRadius: 16,
        zIndex: 40,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden'
      }}
    >
      {isPhone && <PhoneSheetGrab />}
      <div className={isPhone ? 'phone-sheet-header' : undefined} style={isPhone ? undefined : {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 8,
        padding: '8px 10px 4px',
      }}>
        <span className={isPhone ? 'phone-sheet-title' : undefined} style={isPhone ? undefined : { fontSize: 13, fontWeight: 700, letterSpacing: 0.3 }}>Parts</span>
        <OverlayDismissButton onDismiss={() => setOverlayOpen('sidebar', false)} />
      </div>

      {/* Tab Switcher */}
      <div className={isPhone ? 'phone-sheet-tabs' : undefined} style={isPhone ? undefined : {
        display: 'flex',
        borderBottom: '1px solid rgba(255,255,255,0.1)',
        padding: 6,
        gap: 4
      }}>
        <button
          className={isPhone ? `phone-sheet-tab${activeTab === 'shapes' ? ' is-active' : ''}` : `glass-button ${activeTab === 'shapes' ? 'active' : ''}`}
          onClick={() => setActiveTab('shapes')}
          style={isPhone ? undefined : { flex: 1, padding: '8px 4px', fontSize: 13 }}
        >
          <span>Shapes</span>
        </button>

        <button
          className={isPhone ? `phone-sheet-tab${activeTab === 'templates' ? ' is-active' : ''}` : `glass-button ${activeTab === 'templates' ? 'active' : ''}`}
          onClick={() => setActiveTab('templates')}
          style={isPhone ? undefined : { flex: 1, padding: '8px 4px', fontSize: 13 }}
        >
          <span>Starters</span>
        </button>

        <button
          className={isPhone ? `phone-sheet-tab${activeTab === 'scene' ? ' is-active' : ''}` : `glass-button ${activeTab === 'scene' ? 'active' : ''}`}
          onClick={() => setActiveTab('scene')}
          style={isPhone ? undefined : { flex: 1, padding: '8px 4px', fontSize: 13 }}
        >
          <span>Scene ({currentProject?.objects.length || 0})</span>
        </button>
      </div>

      {/* Tab Content */}
      <div style={{ flex: 1, overflowY: 'auto', padding: 12 }}>
        {/* SHAPES TAB */}
        {activeTab === 'shapes' && (
          <div style={isPhone ? undefined : { display: 'flex', flexDirection: 'column', gap: 12 }}>
            {!isPhone && (
            <div style={{ fontSize: 12, fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: 0.5 }}>
              Basic Shapes
            </div>
            )}

            <div className={isPhone ? 'phone-shape-grid' : undefined} style={isPhone ? undefined : { display: 'flex', flexDirection: 'column', gap: 12 }}>
            {shapes.map(({ type, label, icon: Icon }) => (
              <button
                key={type}
                type="button"
                className={isPhone ? 'phone-shape-cell' : 'glass-button'}
                onClick={isPhone ? undefined : () => addObject(type)}
                onPointerUp={isPhone ? (event) => fireReliableTap(event, () => addObject(type)) : undefined}
                style={isPhone ? undefined : {
                  justifyContent: 'flex-start',
                  width: '100%',
                  padding: '10px 12px',
                  background: 'rgba(255, 255, 255, 0.05)'
                }}
              >
                <div className={isPhone ? 'phone-shape-cell-icon' : undefined} style={isPhone ? undefined : {
                  width: 28,
                  height: 28,
                  borderRadius: 8,
                  background: 'rgba(224, 159, 62, 0.15)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginRight: 10
                }}>
                  <Icon size={isPhone ? 22 : 16} color={isPhone ? '#64748b' : '#e09f3e'} strokeWidth={isPhone ? 1.5 : 2} />
                </div>
                {isPhone ? (
                  <span>{label.replace('Beveled ', '').replace(' / Panel', '').replace(' / Pole', '')}</span>
                ) : (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
                  <span style={{ fontSize: 13, fontWeight: 600 }}>{label}</span>
                  <span style={{ fontSize: 10, color: '#9ca3af' }}>Click to spawn on canvas</span>
                </div>
                )}
              </button>
            ))}
            </div>

            {/* Standard Lumber & Sheet Stock Presets */}
            <div style={{
              fontSize: 12,
              fontWeight: isPhone ? 500 : 600,
              color: isPhone ? '#94a3b8' : '#e09f3e',
              textTransform: isPhone ? 'none' : 'uppercase',
              letterSpacing: isPhone ? 0 : 0.5,
              marginTop: 8,
              borderTop: isPhone ? '1px solid #eef2f6' : '1px solid rgba(255,255,255,0.08)',
              paddingTop: 12
            }}>
              Standard Wood Sizes
            </div>

            {STANDARD_WOOD_PRESETS.map((preset) => (
              <button
                key={preset.id}
                type="button"
                className={isPhone ? 'phone-sheet-row' : 'glass-button'}
                onClick={isPhone ? undefined : () => addWoodPreset(preset.id)}
                onPointerUp={isPhone ? (event) => fireReliableTap(event, () => addWoodPreset(preset.id)) : undefined}
                style={isPhone ? undefined : {
                  justifyContent: 'flex-start',
                  width: '100%',
                  padding: '10px 12px',
                  background: 'rgba(224, 159, 62, 0.06)',
                  borderColor: 'rgba(224, 159, 62, 0.2)'
                }}
                title={preset.description}
              >
                <div style={{
                  width: 28,
                  height: 28,
                  borderRadius: 8,
                  background: isPhone ? '#f8fafc' : 'rgba(224, 159, 62, 0.2)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginRight: 10,
                  flexShrink: 0
                }}>
                  <Layers size={16} color={isPhone ? '#64748b' : '#e09f3e'} />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', overflow: 'hidden' }}>
                  <span style={{ fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden', width: '100%' }}>
                    {preset.label}
                  </span>
                  <span style={{ fontSize: 10, color: '#9ca3af' }}>
                    {preset.dimensions.length}" × {preset.dimensions.width}" × {preset.dimensions.height}"
                  </span>
                </div>
              </button>
            ))}
          </div>
        )}

        {/* TEMPLATES TAB */}
        {activeTab === 'templates' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: 0.5 }}>
              Pre-built Furniture Assemblies
            </div>

            <button
              className="glass-button"
              onClick={() => addPresetTemplate('table')}
              style={{ justifyContent: 'flex-start', width: '100%', padding: '12px' }}
            >
              <Table size={20} color="#e09f3e" style={{ marginRight: 10 }} />
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
                <span style={{ fontSize: 14, fontWeight: 600 }}>Dining Table</span>
                <span style={{ fontSize: 11, color: '#9ca3af' }}>Top & 4 Round Metal Legs</span>
              </div>
            </button>

            <button
              className="glass-button"
              onClick={() => addPresetTemplate('chair')}
              style={{ justifyContent: 'flex-start', width: '100%', padding: '12px' }}
            >
              <Armchair size={20} color="#e09f3e" style={{ marginRight: 10 }} />
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
                <span style={{ fontSize: 14, fontWeight: 600 }}>Modern Chair</span>
                <span style={{ fontSize: 11, color: '#9ca3af' }}>Beveled Seat & Backrest</span>
              </div>
            </button>

            <button
              className="glass-button"
              onClick={() => addPresetTemplate('bookshelf')}
              style={{ justifyContent: 'flex-start', width: '100%', padding: '12px' }}
            >
              <BookOpen size={20} color="#e09f3e" style={{ marginRight: 10 }} />
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
                <span style={{ fontSize: 14, fontWeight: 600 }}>Standing Bookshelf</span>
                <span style={{ fontSize: 11, color: '#9ca3af' }}>Vertical Side Panels & Shelves</span>
              </div>
            </button>
          </div>
        )}

        {/* SCENE TAB */}
        {activeTab === 'scene' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>
              Active Furniture Parts
            </div>

            {currentProject?.objects.map((obj) => {
              const isSelected = obj.id === selectedObjectId;

              return (
                <div
                  key={obj.id}
                  onClick={() => selectObject(obj.id)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '8px 12px',
                    borderRadius: 8,
                    background: isSelected ? 'rgba(224, 159, 62, 0.2)' : 'rgba(255, 255, 255, 0.04)',
                    border: isSelected ? '1px solid #e09f3e' : '1px solid transparent',
                    cursor: 'pointer'
                  }}
                >
                  <span style={{ fontSize: 13, fontWeight: isSelected ? 600 : 400 }}>
                    {obj.name}
                  </span>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <button
                      style={{ background: 'none', border: 'none', color: '#9ca3af', cursor: 'pointer' }}
                      onClick={(e) => {
                        e.stopPropagation();
                        updateObject(obj.id, { visible: !obj.visible });
                      }}
                    >
                      {obj.visible ? <Eye size={14} /> : <EyeOff size={14} color="#ef4444" />}
                    </button>

                    <button
                      style={{ background: 'none', border: 'none', color: '#9ca3af', cursor: 'pointer' }}
                      onClick={(e) => {
                        e.stopPropagation();
                        duplicateObject(obj.id);
                      }}
                    >
                      <Copy size={14} />
                    </button>

                    <button
                      style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer' }}
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteObject(obj.id);
                      }}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </aside>
  );
};
