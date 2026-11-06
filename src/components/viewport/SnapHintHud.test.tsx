// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, act, cleanup } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { SnapHintHud, useSnapHighlight, clearSnapHighlight } from './SnapHighlight';

afterEach(() => { cleanup(); act(() => clearSnapHighlight()); });

describe('SnapHintHud', () => {
  it('shows the hint as a top HUD pill while snapping and fades out after', () => {
    render(<SnapHintHud />);
    expect(screen.queryByTestId('snap-hint')).toBeNull();
    act(() => useSnapHighlight.getState().set('a', [], { hint: 'Ends touching · Tops flush' }));
    const el = screen.getByTestId('snap-hint');
    expect(el.textContent).toBe('Ends touching · Tops flush');
    expect(el.className).toContain('snap-hint-hud');
    expect(el.className).toContain('is-visible');
    act(() => clearSnapHighlight());
    expect(screen.getByTestId('snap-hint').className).not.toContain('is-visible');
  });

  it('is a non-interactive fixed pill, not anchored in the 3D scene', () => {
    const css = readFileSync('src/index.css', 'utf8');
    const rule = css.match(/\.snap-hint-hud \{[^}]*\}/)?.[0] ?? '';
    expect(rule).toContain('position: fixed');
    expect(rule).toContain('pointer-events: none');
    expect(rule).toContain('safe-area-inset-top');
    const src = readFileSync('src/components/viewport/SnapHighlight.tsx', 'utf8');
    expect(src).not.toContain('<Html');
  });
});
