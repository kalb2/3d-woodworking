import * as THREE from 'three';
import type { FurnitureObject, FurnitureProject, WoodMaterial } from '../types/furniture';
import { partCutters } from '../joinery/joints';
import { positiveSize } from '../theme/partSurface';
import { saveFile, type SaveResult } from '../native/fileExport';
import { cutHoles, cutSolids, getHoles, supportsHoles } from './holes';
import { createPartGeometry, partDrawScale } from './partGeometry';
import { freshenFinish } from './woodTextureGenerator';

/** Editor inches → file meters. glTF and USDZ both treat 1 unit as 1 meter. */
export const INCHES_TO_METERS = 0.0254;

export type ModelFormat = 'usdz' | 'glb';

export const MODEL_FILE: Record<ModelFormat, { extension: string; mime: string }> = {
  usdz: { extension: 'usdz', mime: 'model/vnd.usdz+zip' },
  glb: { extension: 'glb', mime: 'model/gltf-binary' },
};

export interface DesignSceneOptions {
  /** Scanned walls and other reference parts. Left out unless this is set. */
  includeRoom?: boolean;
}

/**
 * A part that belongs in the file: real stock, as placed. Groups are boxes
 * around members, not geometry. Scanned walls and reference parts are the
 * room, not the piece. Hidden parts are not on screen.
 */
export function isExportedPart(obj: FurnitureObject, includeRoom = false): boolean {
  if (obj.visible === false) return false;
  if (obj.shape === 'group') return false;
  if (!includeRoom && (obj.reference || obj.generator === 'room-scan')) return false;
  return true;
}

export function designParts(project: Pick<FurnitureProject, 'objects'>, includeRoom = false): FurnitureObject[] {
  return project.objects.filter((obj) => isExportedPart(obj, includeRoom));
}

/**
 * Flat color and sheen. USDZExporter only carries MeshStandardMaterial well,
 * and it rasterizes maps through a canvas (grain textures, repeat, bump)
 * which Quick Look then mishandles. The part's color, roughness, and
 * metalness are enough for the finish to read.
 */
function finishMaterial(input: WoodMaterial, cache: Map<string, THREE.MeshStandardMaterial>): THREE.MeshStandardMaterial {
  const mat = freshenFinish(input);
  const key = `${mat.baseColor}|${mat.roughness}|${mat.metalness}|${mat.name}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const material = new THREE.MeshStandardMaterial({
    name: mat.name,
    color: mat.baseColor,
    roughness: mat.roughness,
    metalness: mat.metalness,
  });
  material.side = THREE.FrontSide;
  material.transparent = false;
  material.opacity = 1;
  cache.set(key, material);
  return material;
}

/**
 * The piece as a Y-up scene in meters: each part's real size, world position,
 * and world rotation (group moves are already stored on the parts), with
 * holes and joinery cut the same way the viewport cuts them. No grid, floor,
 * gizmos, highlights, pins, or labels. Vertex positions are in meters so a
 * viewer that ignores node scale still measures a 24" board as 24".
 */
export function buildDesignScene(project: FurnitureProject, options: DesignSceneOptions = {}): THREE.Group {
  const root = new THREE.Group();
  root.name = project.name.trim() || 'Workbench';
  const materials = new Map<string, THREE.MeshStandardMaterial>();
  const includeRoom = options.includeRoom === true;

  for (const obj of project.objects) {
    if (!isExportedPart(obj, includeRoom)) continue;
    const length = positiveSize(obj.dimensions.length);
    const width = positiveSize(obj.dimensions.width);
    const height = positiveSize(obj.dimensions.height);
    let geometry = createPartGeometry(obj.shape, obj.dimensions, obj.board);
    const holes = supportsHoles(obj.shape) ? getHoles(obj) : [];
    if (holes.length) geometry = cutHoles(geometry, { length, width, height }, holes, obj.shape === 'board');
    const cutters = partCutters(project, obj.id);
    if (cutters.length) geometry = cutSolids(geometry, cutters);
    if (!geometry.getAttribute('normal')) geometry.computeVertexNormals();

    const [sx, sy, sz] = partDrawScale(obj.shape, obj.dimensions);
    const mesh = new THREE.Mesh(geometry, finishMaterial(obj.material, materials));
    mesh.name = obj.name || obj.id;
    mesh.position.set(obj.position.x * INCHES_TO_METERS, obj.position.y * INCHES_TO_METERS, obj.position.z * INCHES_TO_METERS);
    mesh.rotation.set(
      (obj.rotation.x * Math.PI) / 180,
      (obj.rotation.y * Math.PI) / 180,
      (obj.rotation.z * Math.PI) / 180,
    );
    mesh.scale.set(sx * INCHES_TO_METERS, sy * INCHES_TO_METERS, sz * INCHES_TO_METERS);
    mesh.updateMatrix();
    geometry.applyMatrix4(mesh.matrix);
    mesh.position.set(0, 0, 0);
    mesh.rotation.set(0, 0, 0);
    mesh.scale.set(1, 1, 1);
    mesh.updateMatrix();
    root.add(mesh);
  }

  root.updateMatrixWorld(true);
  return root;
}

function disposeScene(root: THREE.Object3D) {
  const materials = new Set<THREE.Material>();
  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.geometry?.dispose();
    const list = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    list.forEach((material) => materials.add(material));
  });
  materials.forEach((material) => material.dispose());
}

/** Binary → base64 for saveFile (images already go this way). */
export function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, Math.min(i + chunk, bytes.length)));
  }
  return btoa(binary);
}

async function modelBytes(root: THREE.Object3D, format: ModelFormat): Promise<Uint8Array> {
  if (format === 'glb') {
    const { GLTFExporter } = await import('three/examples/jsm/exporters/GLTFExporter.js');
    const data = await new GLTFExporter().parseAsync(root, { binary: true, onlyVisible: true, embedImages: false });
    if (!(data instanceof ArrayBuffer)) throw new Error('Expected a binary glTF');
    return new Uint8Array(data);
  }
  const { USDZExporter } = await import('three/examples/jsm/exporters/USDZExporter.js');
  const data = await new USDZExporter().parseAsync(root, { quickLookCompatible: true, onlyVisible: true });
  return new Uint8Array(data);
}

export function modelFileName(projectName: string, format: ModelFormat): string {
  const base = projectName.trim() || 'Workbench';
  return `${base}.${MODEL_FILE[format].extension}`;
}

/**
 * Write the current piece as .usdz or .glb through the same save path as the
 * other exports (share sheet on iOS, a download on the web).
 */
export async function exportDesignFile(project: FurnitureProject, format: ModelFormat): Promise<SaveResult> {
  if (designParts(project).length === 0) return 'failed';
  let scene: THREE.Group | null = null;
  try {
    scene = buildDesignScene(project);
    const bytes = await modelBytes(scene, format);
    const file = MODEL_FILE[format];
    return await saveFile(modelFileName(project.name, format), bytesToBase64(bytes), file.mime, {
      base64: true,
      title: project.name.trim() || 'Workbench',
    });
  } catch (err) {
    console.warn('3D export failed', err);
    return 'failed';
  } finally {
    if (scene) disposeScene(scene);
  }
}
