import React, { useEffect, useRef, useState } from 'react';
import {
  Box,
  Cylinder,
  Circle,
  Triangle,
  LayoutGrid,
  Eye,
  EyeOff,
  Trash2,
  Copy,
  Layers,
  RectangleHorizontal,
  Blend,
} from 'lucide-react';
import { SHAPE_CATALOG, SHAPE_GROUPS, shapeLabel, type ShapeCatalogEntry } from '../../catalog/shapeCatalog';
import { PROJECT_TEMPLATES } from '../../catalog/templates';
import { useProjectStore, STANDARD_WOOD_PRESETS } from '../../state/useProjectStore';
import { useAppStore, type SidebarPanel } from '../../state/useAppStore';
import { useIsPhone } from '../../hooks/useIsPhone';
import { OverlayDismissButton } from '../layout/OverlayChrome';
import { PHONE_SHEET_EMBEDDED_STYLE } from '../layout/phoneSheet';
import { fireReliableTap, useReliableTap } from '../../utils/reliableTap';
import type { FurnitureObject } from '../../types/furniture';

const SHAPE_ICONS: Record<ShapeCatalogEntry['type'], React.ComponentType<{ size?: number; color?: string; strokeWidth?: number }>> = {
  cube: Box,
  wedge: Triangle,
  cushion: Blend,
  board: RectangleHorizontal,
  bevel_top: LayoutGrid,
  cylinder: Cylinder,
  pole: Cylinder,
  sphere: Circle,
};

export const SidebarNav: React.FC = () => {
  const isPhone = useIsPhone();
  const { overlays, setOverlayOpen, openHome, sidebarPanel, setSidebarPanel } = useAppStore();
  const [activeTab, setActiveTab] = useState<SidebarPanel>(sidebarPanel);

  useEffect(() => {
    setActiveTab(sidebarPanel);
  }, [sidebarPanel]);

  const selectTab = (panel: SidebarPanel) => {
    setActiveTab(panel);
    setSidebarPanel(panel);
  };
  const {
    addObject,
    addWoodPreset,
    insertTemplate,
    projects,
    activeProjectId,
    selectedObjectId,
    selectedObjectIds,
    selectObject,
    deleteObject,
    duplicateObject,
    updateObject
  } = useProjectStore();

  const currentProject = projects.find(p => p.id === activeProjectId);
  const lastAddAt = useRef(0);
  const addPart = (action: () => void) => (event: React.SyntheticEvent) => {
    fireReliableTap(event, () => {
      const now = performance.now();
      if (now - lastAddAt.current < 400) return;
      lastAddAt.current = now;
      action();
      setOverlayOpen('sidebar', false);
    });
  };

  if (!overlays.sidebar) return null;

  return (
    <aside
      className={`project-overlay project-overlay-sidebar${isPhone ? ' phone-sheet-embed' : ' glass-panel'}`}
      data-testid="overlay-sidebar"
      style={isPhone ? {
        ...PHONE_SHEET_EMBEDDED_STYLE,
      } : {
        position: 'absolute',
        top: 'var(--ipad-panel-top)',
        left: 16,
        bottom: 'calc(24px + env(safe-area-inset-bottom, 0px))',
        width: 280,
        borderRadius: 16,
        zIndex: 40,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden'
      }}
    >
      <div className={isPhone ? 'phone-sheet-header' : undefined} style={isPhone ? undefined : {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 8,
        padding: '8px 10px 4px',
      }}>
        <span className={isPhone ? 'phone-sheet-title' : undefined} style={isPhone ? undefined : { fontSize: 13, fontWeight: 700, letterSpacing: 0.3 }}>Add</span>
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
          onClick={() => selectTab('shapes')}
          style={isPhone ? undefined : { flex: 1, padding: '8px 4px', fontSize: 13 }}
        >
          <span>Shapes</span>
        </button>

        <button
          className={isPhone ? `phone-sheet-tab${activeTab === 'templates' ? ' is-active' : ''}` : `glass-button ${activeTab === 'templates' ? 'active' : ''}`}
          onClick={() => selectTab('templates')}
          style={isPhone ? undefined : { flex: 1, padding: '8px 4px', fontSize: 13 }}
        >
          <span>Layouts</span>
        </button>

        <button
          className={isPhone ? `phone-sheet-tab${activeTab === 'scene' ? ' is-active' : ''}` : `glass-button ${activeTab === 'scene' ? 'active' : ''}`}
          onClick={() => selectTab('scene')}
          style={isPhone ? undefined : { flex: 1, padding: '8px 4px', fontSize: 13 }}
        >
          <span>Scene ({currentProject?.objects.length || 0})</span>
        </button>
      </div>

      {/* Tab Content */}
      <div style={{ flex: isPhone ? 'none' : 1, overflowY: isPhone ? 'visible' : 'auto', padding: 12 }}>
        {/* SHAPES TAB */}
        {activeTab === 'shapes' && (
          <div style={isPhone ? undefined : { display: 'flex', flexDirection: 'column', gap: 12 }}>
            {SHAPE_GROUPS.map((group) => {
              const entries = SHAPE_CATALOG.filter((entry) => entry.group === group);
              return (
                <div key={group}>
                  <div style={{
                    fontSize: 12,
                    fontWeight: isPhone ? 500 : 600,
                    color: isPhone ? '#94a3b8' : '#9ca3af',
                    textTransform: isPhone ? 'none' : 'uppercase',
                    letterSpacing: isPhone ? 0 : 0.5,
                    margin: isPhone ? '4px 4px 0' : '0 0 8px',
                  }}>
                    {group}
                  </div>
                  <div className={isPhone ? 'phone-shape-grid' : undefined} style={isPhone ? undefined : { display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {entries.map((entry) => {
                      const Icon = SHAPE_ICONS[entry.type];
                      return (
                        <button
                          key={entry.type}
                          type="button"
                          data-testid={`shape-${entry.type}`}
                          aria-label={entry.label}
                          className={isPhone ? 'phone-shape-cell' : 'glass-button'}
                          onClick={addPart(() => addObject(entry.type))}
                          onPointerUp={addPart(() => addObject(entry.type))}
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
                            <span>{entry.shortLabel}</span>
                          ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
                              <span style={{ fontSize: 13, fontWeight: 600 }}>{entry.label}</span>
                              <span style={{ fontSize: 10, color: '#9ca3af' }}>{entry.hint}</span>
                            </div>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}

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
                data-testid={`preset-${preset.id}`}
                aria-label={preset.label}
                className={isPhone ? 'phone-sheet-row' : 'glass-button'}
                onClick={addPart(() => addWoodPreset(preset.id))}
                onPointerUp={addPart(() => addWoodPreset(preset.id))}
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
              Shape layouts
            </div>
            <p style={{ fontSize: 12, color: '#9ca3af', margin: 0, lineHeight: 1.45 }}>
              Drop a starter into this project, or open the Templates tab to begin a new one.
            </p>
            <button
              type="button"
              className={isPhone ? 'phone-sheet-row' : 'glass-button'}
              data-testid="browse-templates"
              onClick={addPart(() => openHome('templates'))}
              onPointerUp={addPart(() => openHome('templates'))}
              style={isPhone ? undefined : { justifyContent: 'flex-start', width: '100%', padding: '10px 12px' }}
            >
              <span style={{ fontSize: 13, fontWeight: 700 }}>Browse templates</span>
            </button>
            {PROJECT_TEMPLATES.map((template) => (
              <button
                key={template.id}
                type="button"
                className={isPhone ? 'phone-sheet-row' : 'glass-button'}
                data-testid={`insert-template-${template.id}`}
                aria-label={template.name}
                onClick={addPart(() => { insertTemplate(template.id); })}
                onPointerUp={addPart(() => { insertTemplate(template.id); })}
                style={isPhone ? undefined : { justifyContent: 'flex-start', width: '100%', padding: '12px' }}
              >
                <Layers size={18} color={isPhone ? '#64748b' : '#e09f3e'} style={{ marginRight: 10, flexShrink: 0 }} />
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', minWidth: 0 }}>
                  <span style={{ fontSize: 14, fontWeight: 600 }}>{template.name}</span>
                  <span style={{ fontSize: 11, color: '#9ca3af', textAlign: 'left' }}>{template.description}</span>
                </div>
              </button>
            ))}
          </div>
        )}

        {/* SCENE TAB */}
        {activeTab === 'scene' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>
              Shapes in this project
            </div>

            {currentProject?.objects.filter((obj) => !obj.parentId).map((obj) => (
              <SceneRow
                key={obj.id}
                objectId={obj.id}
                depth={0}
                objects={currentProject.objects}
                selectedObjectId={selectedObjectId}
                selectedObjectIds={selectedObjectIds}
                selectObject={selectObject}
                updateObject={updateObject}
                duplicateObject={duplicateObject}
                deleteObject={deleteObject}
              />
            ))}
          </div>
        )}
      </div>
    </aside>
  );
};

const SceneRow: React.FC<{
  objectId: string;
  depth: number;
  objects: FurnitureObject[];
  selectedObjectId: string | null;
  selectedObjectIds: string[];
  selectObject: (id: string | null, options?: { additive?: boolean }) => void;
  updateObject: (id: string, updates: Partial<FurnitureObject>) => void;
  duplicateObject: (id: string) => void;
  deleteObject: (id: string) => void;
}> = ({ objectId, depth, objects, selectedObjectId, selectedObjectIds, selectObject, updateObject, duplicateObject, deleteObject }) => {
  const obj = objects.find((item) => item.id === objectId);
  if (!obj) return null;
  const isSelected = obj.id === selectedObjectId || selectedObjectIds.includes(obj.id);
  const children = objects.filter((item) => item.parentId === obj.id);
  return (
    <>
      <div
        onClick={() => selectObject(obj.id)}
        data-testid={`scene-row-${obj.id}`}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '8px 12px',
          paddingLeft: 12 + depth * 16,
          borderRadius: 8,
          background: isSelected ? 'rgba(224, 159, 62, 0.2)' : 'rgba(255, 255, 255, 0.04)',
          border: isSelected ? '1px solid #e09f3e' : '1px solid transparent',
          cursor: 'pointer'
        }}
      >
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }} onClick={(event) => event.stopPropagation()}>
          <input
            type="checkbox"
            aria-label={`Add ${obj.name} to selection`}
            data-testid={`scene-check-${obj.id}`}
            checked={selectedObjectIds.includes(obj.id)}
            onChange={() => selectObject(obj.id, { additive: true })}
            style={{ width: 18, height: 18 }}
          />
          <span style={{ fontSize: 13, fontWeight: isSelected ? 600 : 400, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{obj.name}</span>
            <span style={{ fontSize: 10, color: '#9ca3af', fontWeight: 500 }}>{shapeLabel(obj.shape)}</span>
          </span>
        </label>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <SceneIconButton
            label={obj.visible ? `Hide ${obj.name}` : `Show ${obj.name}`}
            onTap={() => updateObject(obj.id, { visible: !obj.visible })}
          >
            {obj.visible ? <Eye size={14} /> : <EyeOff size={14} color="#ef4444" />}
          </SceneIconButton>
          <SceneIconButton
            label={`Duplicate ${obj.name}`}
            onTap={() => duplicateObject(obj.id)}
          >
            <Copy size={14} />
          </SceneIconButton>
          <SceneIconButton
            danger
            label={`Delete ${obj.name}`}
            onTap={() => deleteObject(obj.id)}
          >
            <Trash2 size={14} />
          </SceneIconButton>
        </div>
      </div>
      {children.map((child) => (
        <SceneRow
          key={child.id}
          objectId={child.id}
          depth={depth + 1}
          objects={objects}
          selectedObjectId={selectedObjectId}
          selectedObjectIds={selectedObjectIds}
          selectObject={selectObject}
          updateObject={updateObject}
          duplicateObject={duplicateObject}
          deleteObject={deleteObject}
        />
      ))}
    </>
  );
};

const SceneIconButton: React.FC<{
  label: string;
  onTap: () => void;
  danger?: boolean;
  testId?: string;
  children: React.ReactNode;
}> = ({ label, onTap, danger, testId, children }) => {
  const handler = useReliableTap(onTap);
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      data-testid={testId}
      style={{
        background: 'none',
        border: 'none',
        color: danger ? '#ef4444' : '#9ca3af',
        cursor: 'pointer',
        padding: 6,
        minWidth: 32,
        minHeight: 32,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        touchAction: 'manipulation',
      }}
      onClick={handler}
      onPointerUp={handler}
    >
      {children}
    </button>
  );
};
