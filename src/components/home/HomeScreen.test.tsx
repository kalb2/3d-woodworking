// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { act, cleanup, fireEvent, render, within } from '@testing-library/react';

afterEach(cleanup);
window.matchMedia ??= ((q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, onchange: null, dispatchEvent: () => false })) as unknown as typeof window.matchMedia;

const { useProjectStore } = await import('../../state/useProjectStore');
const { useAppStore } = await import('../../state/useAppStore');
const { HomeScreen } = await import('./HomeScreen');
const { PROJECT_TEMPLATES } = await import('../../catalog/templates');
const s = () => useProjectStore.getState();

describe('Home', () => {
  it('project cards say "1 part", not "1 parts"', () => {
    s().createProject('One part', 'in');
    act(() => { s().addObject('board'); });
    useProjectStore.setState((st) => ({ projects: st.projects.map((p) => (p.id === st.activeProjectId ? { ...p, objects: p.objects.slice(-1) } : p)) }));
    act(() => useAppStore.getState().setHomeTab('projects'));
    const r = render(<HomeScreen />);
    const card = r.getByText('One part').closest('.project-card') as HTMLElement;
    expect(within(card).getByText('1 part')).toBeTruthy();
    expect(within(card).queryByText(/1 parts/)).toBeNull();
  });

  it('the welcome card does not repeat the Templates and Community tabs', () => {
    localStorage.removeItem('workbench_welcome_dismissed_v1');
    act(() => useAppStore.getState().setHomeTab('projects'));
    const r = render(<HomeScreen />);
    const welcome = r.getByTestId('home-welcome');
    expect(within(welcome).queryByText('Templates')).toBeNull();
    expect(within(welcome).queryByText('Community')).toBeNull();
    expect(within(welcome).getByLabelText('Dismiss welcome')).toBeTruthy();
    expect(r.getByTestId('home-tab-templates')).toBeTruthy();
    expect(r.getByTestId('home-tab-community')).toBeTruthy();
  });

  it('template preview sizes use the unit the project will start in', () => {
    act(() => useAppStore.getState().updatePreferences({ defaultUnit: 'mm' }));
    act(() => useAppStore.getState().setHomeTab('templates'));
    const template = PROJECT_TEMPLATES[0];
    const r = render(<HomeScreen />);
    fireEvent.click(r.getByTestId(`template-preview-${template.id}`));
    const sheet = r.getByTestId('template-preview');
    const d = template.objects[0].dimensions;
    const mm = (v: number) => Math.round(v * 25.4);
    expect(within(sheet).getAllByText(`${mm(d.length)} × ${mm(d.width)} × ${mm(d.height)} mm`).length).toBeGreaterThan(0);
    expect(sheet.textContent).not.toMatch(/\d in\b/);
  });
});
