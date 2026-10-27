import * as THREE from 'three';
import type { FurnitureProject } from '../types/furniture';
import { buildDesignScene, isExportedPart } from '../utils/modelExport';
import { createWoodMeshMaterial } from '../utils/woodTextureGenerator';
import { featureEdges } from '../utils/featureEdges';

export interface CoverImage { dataUrl: string; width: number; height: number }

/** Unit vector the cover camera looks from: front-right, a little above (isometric-ish). */
export const COVER_VIEW = new THREE.Vector3(1, 0.85, 1.25).normalize();

/**
 * Fit an orthographic camera looking along -dir at a box: returns the
 * frustum half-extents for the given aspect (width / height) with a margin.
 */
export function fitOrtho(box: THREE.Box3, dir: THREE.Vector3, aspect: number, margin = 0.08) {
  const center = box.getCenter(new THREE.Vector3());
  const radius = Math.max(box.getSize(new THREE.Vector3()).length() / 2, 1e-3);
  const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.001, radius * 10);
  cam.position.copy(center).addScaledVector(dir, radius * 4);
  cam.up.set(0, 1, 0);
  cam.lookAt(center);
  cam.updateMatrixWorld(true);
  const inv = cam.matrixWorldInverse;
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (let i = 0; i < 8; i++) {
    const p = new THREE.Vector3(i & 4 ? box.max.x : box.min.x, i & 2 ? box.max.y : box.min.y, i & 1 ? box.max.z : box.min.z).applyMatrix4(inv);
    minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x); minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y);
  }
  let hw = ((maxX - minX) / 2) * (1 + margin), hh = ((maxY - minY) / 2) * (1 + margin);
  if (hw / hh < aspect) hw = hh * aspect; else hh = hw / aspect;
  const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
  cam.left = cx - hw; cam.right = cx + hw; cam.top = cy + hh; cam.bottom = cy - hh;
  cam.near = 0.001; cam.far = radius * 10;
  cam.updateProjectionMatrix();
  return cam;
}

/**
 * The cover picture: the project drawn offscreen in the Clean style (flat
 * finish colors with dark feature edges) from an isometric-ish angle, on
 * white. Browser only; returns null when WebGL isn't available so the PDF
 * falls back to its vector drawing.
 */
export function renderCover(project: FurnitureProject, width = 1500, height = 1040): CoverImage | null {
  if (typeof document === 'undefined') return null;
  let renderer: THREE.WebGLRenderer | null = null;
  const root = buildDesignScene(project);
  try {
    const canvas = document.createElement('canvas');
    canvas.width = width; canvas.height = height;
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true, alpha: false });
    renderer.setPixelRatio(1);
    renderer.setSize(width, height, false);
    renderer.setClearColor(0xffffff, 1);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#ffffff');
    const parts = project.objects.filter((o) => isExportedPart(o, false));
    const lineMat = new THREE.LineBasicMaterial({ color: '#1f2937' });
    [...root.children].forEach((child, i) => {
      const mesh = child as THREE.Mesh;
      const part = parts[i];
      if (!mesh.isMesh) return;
      const mat = createWoodMeshMaterial(part?.material ?? { species: 'birch' } as never, 'clean');
      mat.polygonOffset = true; mat.polygonOffsetFactor = 1; mat.polygonOffsetUnits = 1;
      mesh.material = mat;
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(featureEdges(mesh.geometry, 24), 3));
      root.add(new THREE.LineSegments(g, lineMat));
    });
    scene.add(root);
    scene.add(new THREE.HemisphereLight('#fff8f1', '#d5dee8', 0.9));
    scene.add(new THREE.AmbientLight('#ffffff', 0.45));
    const key = new THREE.DirectionalLight('#ffffff', 1.1);
    key.position.set(0.5, 1, 0.8);
    scene.add(key);
    const fill = new THREE.DirectionalLight('#ffffff', 0.35);
    fill.position.set(-0.8, 0.4, -0.3);
    scene.add(fill);
    const box = new THREE.Box3().setFromObject(root);
    if (box.isEmpty()) return null;
    const cam = fitOrtho(box, COVER_VIEW, width / height);
    renderer.render(scene, cam);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.92);
    if (!dataUrl.startsWith('data:image/jpeg')) return null;
    return { dataUrl, width, height };
  } catch {
    return null;
  } finally {
    root.traverse((o) => {
      const m = o as THREE.Mesh;
      m.geometry?.dispose?.();
      const mats = Array.isArray(m.material) ? m.material : m.material ? [m.material] : [];
      mats.forEach((x) => x.dispose());
    });
    renderer?.dispose();
    renderer?.forceContextLoss();
  }
}
