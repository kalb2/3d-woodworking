import { describe, expect, it } from 'vitest';
import { PRESET_WOOD_MATERIALS, freshenFinish, lighten } from './woodTextureGenerator';

const lum = (hex: string) => {
  const n = parseInt(hex.slice(1), 16);
  const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => { const x = v / 255; return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; });
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
};

describe('wood colors', () => {
  it('walnut is a medium-dark brown, not near black', () => {
    // Base sits a touch above real walnut (#5C4033-#7A5640) because scene lighting and
    // tone mapping darken it ~15%; on screen the lit face lands inside that range.
    const w = PRESET_WOOD_MATERIALS.walnut.baseColor;
    expect(lum(w)).toBeGreaterThan(lum('#5c4033'));
    expect(lum(w)).toBeLessThan(lum('#8a6550'));
  });
  it('dark woods stay above a readable floor', () => {
    for (const s of ['walnut', 'cherry', 'mahogany'] as const) expect(lum(PRESET_WOOD_MATERIALS[s].baseColor)).toBeGreaterThan(0.06);
    expect(lum(PRESET_WOOD_MATERIALS.ebony.baseColor)).toBeGreaterThan(0.015);
  });
  it('parts saved with the old near-black walnut pick up the new color', () => {
    const old = { ...PRESET_WOOD_MATERIALS.walnut, baseColor: '#4a3525', secondaryColor: '#2b1b10' };
    expect(freshenFinish(old).baseColor).toBe(PRESET_WOOD_MATERIALS.walnut.baseColor);
    const custom = { ...PRESET_WOOD_MATERIALS.walnut, baseColor: '#123456' };
    expect(freshenFinish(custom).baseColor).toBe('#123456');
  });
  it('lighten mixes toward white', () => {
    expect(lighten('#000000', 0.5)).toBe('#808080');
    expect(lighten('#7d5842', 0)).toBe('#7d5842');
  });
});
