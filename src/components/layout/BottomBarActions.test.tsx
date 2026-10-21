// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { act, cleanup, render } from '@testing-library/react';

afterEach(cleanup);
window.matchMedia ??= ((q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, onchange: null, dispatchEvent: () => false })) as unknown as typeof window.matchMedia;

const { useProjectStore } = await import('../../state/useProjectStore');
const { useAppStore } = await import('../../state/useAppStore');
const { PhoneBottomSheet } = await import('./PhoneCanvasChrome');
const { TransformMenu } = await import('./TransformMenu');
const s = () => useProjectStore.getState();

describe('bottom bar Duplicate/Delete', () => {
  for (const [name, el] of [['phone', <PhoneBottomSheet key="p" />], ['iPad', <TransformMenu key="t" />]] as const) {
    it(`${name}: hidden with nothing selected, shown (enabled) once a part is selected`, () => {
      s().createProject(`Bar ${name}`, 'in');
      act(() => { s().addObject('board'); });
      act(() => s().selectObject(null));
      act(() => useAppStore.getState().setOverlayOpen('inspector', false));
      const r = render(el);
      expect(r.getByTestId('overlay-launch-tools')).toBeTruthy();
      expect(r.queryByTestId('toolbar-duplicate')).toBeNull();
      expect(r.queryByTestId('toolbar-delete')).toBeNull();
      const id = s().projects.find((p) => p.id === s().activeProjectId)!.objects.slice(-1)[0].id;
      act(() => s().selectObject(id));
      const dup = r.getByTestId('toolbar-duplicate') as HTMLButtonElement;
      expect(dup.disabled).toBe(false);
      expect((r.getByTestId('toolbar-delete') as HTMLButtonElement).disabled).toBe(false);
    });
  }
});
