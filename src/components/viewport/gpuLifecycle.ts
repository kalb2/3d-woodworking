import { useEffect, useRef, type MutableRefObject } from 'react';
import * as THREE from 'three';

/** EdgesGeometry keeps the source geometry alive on `parameters.geometry`. */
function edgesSource(geometry: THREE.BufferGeometry): THREE.BufferGeometry | undefined {
  const params = (geometry as THREE.BufferGeometry & { parameters?: { geometry?: unknown } }).parameters;
  const source = params?.geometry;
  if (source instanceof THREE.BufferGeometry && source !== geometry) return source;
  return undefined;
}

/** Drop a geometry. Also drops the source mesh an EdgesGeometry was built from. */
export function disposeGeometry(geometry: THREE.BufferGeometry | null | undefined): void {
  if (!geometry) return;
  const source = edgesSource(geometry);
  geometry.dispose();
  if (source) source.dispose();
}

/** Drop a geometry and leave a shared source (the wall box an outline still uses) alone. */
export function disposeGeometryOnly(geometry: THREE.BufferGeometry | null | undefined): void {
  geometry?.dispose();
}

/** Drop a material. Shared wood textures stay in the cache. */
export function disposeMaterial(material: THREE.Material | null | undefined): void {
  material?.dispose();
}

/**
 * Dispose a GPU resource when it is replaced and when the component unmounts.
 * StrictMode runs effect cleanup once on mount and then sets the effect up
 * again; disposal waits a microtask and skips a resource that is still current.
 */
export function useDisposable<T>(value: T | null | undefined, dispose: (value: T) => void): void {
  const current = useRef(value);
  const mounted = useRef(false);
  current.current = value;

  useEffect(() => {
    const resource = value;
    return () => {
      queueMicrotask(() => {
        if (resource != null && current.current !== resource) dispose(resource);
      });
    };
  }, [value, dispose]);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      const resource = current.current;
      queueMicrotask(() => {
        if (!mounted.current && resource != null) dispose(resource);
      });
    };
  }, [dispose]);
}

function latestGeometry(slot: MutableRefObject<THREE.BufferGeometry | null>): THREE.BufferGeometry | null {
  return slot.current;
}

/** Dispose the latest geometry a per-frame swap stored, once the component is really gone. */
export function useDisposeLatest(slot: MutableRefObject<THREE.BufferGeometry | null>): void {
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      const resource = latestGeometry(slot);
      queueMicrotask(() => {
        if (!mounted.current && resource) resource.dispose();
      });
    };
  }, [slot]);
}
