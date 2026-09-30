import React from 'react';
import { Check, Palette } from 'lucide-react';
import { useProjectStore } from '../../state/useProjectStore';
import { useAppStore } from '../../state/useAppStore';
import { useIsPhone } from '../../hooks/useIsPhone';
import { OverlayDismissButton } from '../layout/OverlayChrome';
import { PHONE_SHEET_EMBEDDED_STYLE } from '../layout/phoneSheet';
import {
  FINISH_MATERIALS,
  NAMED_PAINT_COLORS,
  PRESET_WOOD_MATERIALS,
  matchesNamedPaint,
  materialFromSpecies,
  paintMaterialFromColor
} from '../../utils/woodTextureGenerator';
import type { WoodMaterial } from '../../types/furniture';

function swatchInk(hex: string): string {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  const luminance = (r * 299 + g * 587 + b * 114) / 1000;
  return luminance > 160 ? '#0f172a' : '#ffffff';
}

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

  const applyMaterial = (material: WoodMaterial) => {
    updateObject(object.id, { material });
  };

  return (
    <div
      className={`project-overlay project-overlay-materials finish-picker${isPhone ? ' phone-sheet-embed' : ' glass-panel'}`}
      data-testid="overlay-materials"
      style={isPhone ? {
        ...PHONE_SHEET_EMBEDDED_STYLE,
        padding: '0 16px 16px',
        gap: 14,
        overflowY: 'auto',
        WebkitOverflowScrolling: 'touch'
      } : {
        position: 'absolute',
        bottom: 24,
        right: 16,
        left: 'auto',
        width: 340,
        borderRadius: 16,
        zIndex: 40,
        padding: 16,
        display: 'flex',
        flexDirection: 'column',
        gap: 14,
        maxHeight: 'min(520px, calc(100dvh - 200px))',
        overflowY: 'auto'
      }}
    >
      <div className="finish-picker-header">
        <div className="finish-picker-heading">
          <Palette size={18} strokeWidth={2} />
          <div className="finish-picker-titles">
            <span className="finish-picker-title">Finish</span>
            <span className="finish-picker-part" data-testid="finish-part-name">{object.name}</span>
          </div>
        </div>
        <OverlayDismissButton onDismiss={() => setOverlayOpen('materials', false)} />
      </div>

      <section className="finish-section" aria-label="Color">
        <h3 className="finish-section-label">Color</h3>
        <div className="finish-chip-grid" data-testid="finish-colors">
          {NAMED_PAINT_COLORS.map((color) => {
            const selected = matchesNamedPaint(object.material, color);
            return (
              <button
                key={color.id}
                type="button"
                className={`finish-chip${selected ? ' is-selected' : ''}`}
                aria-pressed={selected}
                aria-label={`${color.name} paint`}
                data-testid={`finish-color-${color.id}`}
                onClick={() => applyMaterial(paintMaterialFromColor(color, object.material.varnishSheen))}
              >
                <span className="finish-swatch" style={{ backgroundColor: color.hex }}>
                  {selected && <Check size={14} color={swatchInk(color.hex)} strokeWidth={3} />}
                </span>
                <span className="finish-chip-label">{color.name}</span>
              </button>
            );
          })}
        </div>
      </section>

      <section className="finish-section" aria-label="Material">
        <h3 className="finish-section-label">Material</h3>
        <div className="finish-chip-grid" data-testid="finish-materials">
          {FINISH_MATERIALS.map((option) => {
            const preset = PRESET_WOOD_MATERIALS[option.species];
            const selected = object.material.species === option.species;
            return (
              <button
                key={option.species}
                type="button"
                className={`finish-chip${selected ? ' is-selected' : ''}`}
                aria-pressed={selected}
                aria-label={`${option.label} material`}
                data-testid={`finish-material-${option.species}`}
                onClick={() => applyMaterial(materialFromSpecies(option.species, option.label))}
              >
                <span
                  className={`finish-swatch finish-swatch-wood${option.species === 'metal_accent' ? ' is-metal' : ''}`}
                  style={{
                    backgroundColor: preset.baseColor,
                    backgroundImage: option.species === 'metal_accent'
                      ? 'linear-gradient(135deg, rgba(255,255,255,0.45), transparent 42%, rgba(0,0,0,0.18))'
                      : `repeating-linear-gradient(90deg, ${preset.secondaryColor} 0 1px, transparent 1px 7px)`
                  }}
                >
                  {selected && <Check size={14} color={swatchInk(preset.baseColor)} strokeWidth={3} />}
                </span>
                <span className="finish-chip-label">{option.label}</span>
              </button>
            );
          })}
        </div>
      </section>

      <section className="finish-section finish-sheen" aria-label="Sheen">
        <h3 className="finish-section-label">Sheen</h3>
        <div className="finish-sheen-row">
          {(['matte', 'satin', 'glossy'] as const).map(sheen => (
            <button
              key={sheen}
              type="button"
              className={`finish-sheen-btn${object.material.varnishSheen === sheen ? ' is-selected' : ''}`}
              aria-pressed={object.material.varnishSheen === sheen}
              data-testid={`finish-sheen-${sheen}`}
              onClick={() => applyMaterial({ ...object.material, varnishSheen: sheen })}
            >
              {sheen}
            </button>
          ))}
        </div>
      </section>
    </div>
  );
};
