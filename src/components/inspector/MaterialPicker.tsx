import React from 'react';
import { Palette, Sparkles, Droplet } from 'lucide-react';
import { useProjectStore } from '../../state/useProjectStore';
import { useAppStore } from '../../state/useAppStore';
import { useIsPhone } from '../../hooks/useIsPhone';
import { OverlayDismissButton } from '../layout/OverlayChrome';
import { PRESET_WOOD_MATERIALS } from '../../utils/woodTextureGenerator';
import type { WoodSpecies } from '../../types/furniture';

export const MaterialPicker: React.FC = () => {
  const isPhone = useIsPhone();
  const { overlays, setOverlayOpen } = useAppStore();
  const {
    projects,
    activeProjectId,
    selectedObjectId,
    updateObject
  } = useProjectStore();

  const currentProject = projects.find(p => p.id === activeProjectId);
  if (!overlays.materials || !currentProject || !selectedObjectId) return null;

  const object = currentProject.objects.find(o => o.id === selectedObjectId);
  if (!object) return null;

  const speciesPresets = Object.values(PRESET_WOOD_MATERIALS);

  const handleSelectSpecies = (speciesId: WoodSpecies) => {
    const preset = PRESET_WOOD_MATERIALS[speciesId];
    updateObject(object.id, {
      material: {
        ...preset,
        stainColor: object.material.stainColor,
        stainOpacity: object.material.stainOpacity
      }
    });
  };

  const handleStainColor = (color: string) => {
    updateObject(object.id, {
      material: {
        ...object.material,
        stainColor: color,
        stainOpacity: object.material.stainOpacity || 0.4
      }
    });
  };

  const handleStainOpacity = (opacity: number) => {
    updateObject(object.id, {
      material: {
        ...object.material,
        stainOpacity: opacity
      }
    });
  };

  const handleSheenChange = (sheen: 'matte' | 'satin' | 'glossy') => {
    updateObject(object.id, {
      material: {
        ...object.material,
        varnishSheen: sheen
      }
    });
  };

  return (
    <div
      className="glass-panel project-overlay project-overlay-materials"
      data-testid="overlay-materials"
      style={{
        position: 'absolute',
        bottom: isPhone ? 16 : 24,
        right: isPhone ? 8 : 16,
        left: isPhone ? 8 : 'auto',
        width: isPhone ? 'auto' : 320,
        borderRadius: 16,
        zIndex: 16,
        padding: 16,
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
        maxHeight: isPhone ? 'calc(100vh - 140px)' : 'none',
        overflowY: isPhone ? 'auto' : 'visible'
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
          <Palette size={18} color="#e09f3e" />
          <span style={{ fontSize: 13, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5 }}>
            Wood Finish & Materials
          </span>
        </div>
        <OverlayDismissButton onDismiss={() => setOverlayOpen('materials', false)} />
      </div>

      {/* WOOD SPECIES GRID */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
        {speciesPresets.map((mat) => {
          const isSelected = object.material.species === mat.species;

          return (
            <button
              key={mat.id}
              onClick={() => handleSelectSpecies(mat.species)}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 4,
                padding: 6,
                borderRadius: 8,
                background: isSelected ? 'rgba(224, 159, 62, 0.25)' : 'rgba(0, 0, 0, 0.3)',
                border: isSelected ? '2px solid #e09f3e' : '1px solid rgba(255,255,255,0.1)',
                cursor: 'pointer'
              }}
              title={mat.name}
            >
              <div style={{
                width: 28,
                height: 28,
                borderRadius: '50%',
                backgroundColor: mat.baseColor,
                border: '1px solid rgba(255,255,255,0.3)',
                boxShadow: 'inset 0 0 4px rgba(0,0,0,0.5)'
              }} />
              <span style={{ fontSize: 10, color: isSelected ? '#e09f3e' : '#9ca3af', fontWeight: 600, textAlign: 'center', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', width: '100%' }}>
                {mat.name.split(' ')[0]}
              </span>
            </button>
          );
        })}
      </div>

      {/* WOOD STAIN SHADE OVERLAY */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 4 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Droplet size={14} color="#e09f3e" />
            <span style={{ fontSize: 12, fontWeight: 600, color: '#f3f4f6' }}>Stain Shade Overlay</span>
          </div>

          <input
            type="color"
            value={object.material.stainColor || '#8b5a2b'}
            onChange={(e) => handleStainColor(e.target.value)}
            style={{ width: 28, height: 24, borderRadius: 4, border: 'none', cursor: 'pointer', background: 'none' }}
          />
        </div>

        {object.material.stainColor && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 11, color: '#9ca3af' }}>Density:</span>
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={object.material.stainOpacity || 0}
              onChange={(e) => handleStainOpacity(parseFloat(e.target.value))}
              style={{ flex: 1, accentColor: '#e09f3e' }}
            />
            <span style={{ fontSize: 11, color: '#e09f3e', width: 28, textAlign: 'right' }}>
              {Math.round((object.material.stainOpacity || 0) * 100)}%
            </span>
          </div>
        )}
      </div>

      {/* VARNISH SHEEN */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Sparkles size={14} color="#e09f3e" />
          <span style={{ fontSize: 12, fontWeight: 600, color: '#f3f4f6' }}>Polish Sheen</span>
        </div>

        <div style={{ display: 'flex', gap: 4 }}>
          {(['matte', 'satin', 'glossy'] as const).map(sheen => (
            <button
              key={sheen}
              onClick={() => handleSheenChange(sheen)}
              style={{
                background: object.material.varnishSheen === sheen ? '#e09f3e' : 'rgba(255,255,255,0.08)',
                color: object.material.varnishSheen === sheen ? '#000' : '#9ca3af',
                border: 'none',
                borderRadius: 4,
                padding: '4px 8px',
                fontSize: 11,
                fontWeight: 600,
                textTransform: 'capitalize',
                cursor: 'pointer'
              }}
            >
              {sheen}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};
