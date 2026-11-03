// @vitest-environment jsdom
import { StrictMode, useState } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { act, cleanup, render } from '@testing-library/react';
import * as THREE from 'three';
import { disposeGeometry, disposeMaterial, useDisposable } from './gpuLifecycle';
import { createWoodMeshMaterial, PRESET_WOOD_MATERIALS } from '../../utils/woodTextureGenerator';

afterEach(() => cleanup());

function Hold({ geometry }: { geometry: THREE.BufferGeometry | null }) {
  useDisposable(geometry, disposeGeometry);
  return null;
}

async function flush() {
  await act(async () => { await Promise.resolve(); });
}

describe('GPU resource disposal', () => {
  it('disposes a geometry when it is replaced and when the holder unmounts', async () => {
    const first = new THREE.BoxGeometry(1, 1, 1);
    const second = new THREE.BoxGeometry(2, 2, 2);
    const disposed: string[] = [];
    first.addEventListener('dispose', () => disposed.push('first'));
    second.addEventListener('dispose', () => disposed.push('second'));
    const r = render(<Hold geometry={first} />);
    await flush();
    expect(disposed).toEqual([]);
    r.rerender(<Hold geometry={second} />);
    await flush();
    expect(disposed).toEqual(['first']);
    r.unmount();
    await flush();
    expect(disposed).toEqual(['first', 'second']);
  });

  it('does not dispose the live geometry when StrictMode replays effects', async () => {
    const geometry = new THREE.BoxGeometry(1, 2, 3);
    let disposed = false;
    geometry.addEventListener('dispose', () => { disposed = true; });
    const r = render(<StrictMode><Hold geometry={geometry} /></StrictMode>);
    await flush();
    expect(disposed).toBe(false);
    r.unmount();
    await flush();
    expect(disposed).toBe(true);
  });

  it('disposes an EdgesGeometry and the source it still holds', () => {
    const source = new THREE.CircleGeometry(1, 8);
    const edges = new THREE.EdgesGeometry(source);
    let sourceGone = false;
    let edgesGone = false;
    source.addEventListener('dispose', () => { sourceGone = true; });
    edges.addEventListener('dispose', () => { edgesGone = true; });
    disposeGeometry(edges);
    expect(edgesGone).toBe(true);
    expect(sourceGone).toBe(true);
  });

  it('releases a wood material without dropping the shared texture', () => {
    const material = createWoodMeshMaterial(PRESET_WOOD_MATERIALS.walnut, 'realistic');
    const texture = material.map!;
    let textureGone = false;
    texture.addEventListener('dispose', () => { textureGone = true; });
    disposeMaterial(material);
    expect(textureGone).toBe(false);
  });

  it('swaps geometries from a state update the way a resize does', async () => {
    const disposed: number[] = [];
    function Resizing() {
      const [size, setSize] = useState(1);
      const geometry = new THREE.BoxGeometry(size, 1, 1);
      geometry.addEventListener('dispose', () => disposed.push(size));
      useDisposable(geometry, disposeGeometry);
      return <button type="button" onClick={() => setSize((n) => n + 1)}>grow</button>;
    }
    const r = render(<Resizing />);
    await flush();
    await act(async () => { r.getByRole('button').click(); });
    await flush();
    expect(disposed).toContain(1);
    r.unmount();
    await flush();
    expect(disposed).toContain(2);
  });
});
