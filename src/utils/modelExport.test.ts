import { beforeEach, describe, expect, it, vi } from 'vitest';

// GLTFExporter reads the binary chunk with FileReader, which browsers have and Node does not.
if (typeof globalThis.FileReader === 'undefined') {
  class NodeFileReader {
    result: ArrayBuffer | null = null;
    onloadend: (() => void) | null = null;
    readAsArrayBuffer(blob: Blob) {
      void blob.arrayBuffer().then((buffer) => {
        this.result = buffer;
        this.onloadend?.();
      });
    }
  }
  globalThis.FileReader = NodeFileReader as unknown as typeof FileReader;
}
import * as THREE from 'three';
import type { FurnitureObject, FurnitureProject, Joint } from '../types/furniture';
import { PRESET_WOOD_MATERIALS } from './woodTextureGenerator';

const saveFile = vi.fn(async (..._args: unknown[]) => 'downloaded' as const);
vi.mock('../native/fileExport', () => ({ saveFile: (...args: unknown[]) => saveFile(...args) }));

const { buildDesignScene, designParts, exportDesignFile, INCHES_TO_METERS, MODEL_FILE } = await import('./modelExport');

const part = (id: string, dims: [number, number, number], extra: Partial<FurnitureObject> = {}): FurnitureObject => ({
  id, name: id, shape: 'board',
  dimensions: { length: dims[0], height: dims[1], width: dims[2] },
  position: { x: 0, y: dims[1] / 2, z: 0 },
  rotation: { x: 0, y: 0, z: 0 },
  material: { ...PRESET_WOOD_MATERIALS.walnut },
  ...extra,
});

const project = (objects: FurnitureObject[], extra: Partial<FurnitureProject> = {}): FurnitureProject => ({
  id: 'p', name: 'Bench', createdAt: 0, updatedAt: 0, unit: 'in', objects,
  snapSettings: { enabled: true, faceSnap: true, gridSnap: true, gridSize: 0.5, floorCollision: true },
  showFloor: true, floorOpacity: 0.4,
  measurements: [{ id: 'm', a: { x: 0, y: 0, z: 0 }, b: { x: 24, y: 0, z: 0 } }],
  ...extra,
});

const meters = (inches: number) => inches * INCHES_TO_METERS;

function bounds(root: THREE.Object3D) {
  const box = new THREE.Box3().setFromObject(root, true);
  return { box, size: box.getSize(new THREE.Vector3()), center: box.getCenter(new THREE.Vector3()) };
}

function volume(mesh: THREE.Mesh) {
  const g = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry;
  const p = g.getAttribute('position');
  let v = 0;
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  for (let i = 0; i < p.count; i += 3) {
    a.fromBufferAttribute(p, i); b.fromBufferAttribute(p, i + 1); c.fromBufferAttribute(p, i + 2);
    v += a.dot(b.clone().cross(c)) / 6;
  }
  return Math.abs(v);
}

const meshNamed = (root: THREE.Object3D, name: string) => root.children.find((child) => child.name === name) as THREE.Mesh;

beforeEach(() => { saveFile.mockClear(); });

describe('design scene', () => {
  it('exports a 24" board in meters, Y-up, with its finish and nothing else', () => {
    const scene = buildDesignScene(project([
      part('top', [24, 0.75, 12]),
      part('Group', [24, 20, 12], { shape: 'group' }),
      part('hidden', [10, 1, 10], { visible: false }),
      part('Wall 1 (scan)', [120, 96, 4], { generator: 'room-scan', reference: true, shape: 'cube', material: { ...PRESET_WOOD_MATERIALS.custom_paint } }),
      part('reference', [40, 4, 2], { reference: true, shape: 'cube' }),
      part('leg', [1.5, 28, 1.5], { shape: 'pole', position: { x: 10, y: 14, z: 4 }, material: { ...PRESET_WOOD_MATERIALS.metal_accent } }),
    ]));

    expect(scene.children.map((child) => child.name).sort()).toEqual(['leg', 'top']);
    scene.traverse((obj) => {
      expect(['Group', 'Mesh']).toContain(obj.type);
      expect(obj.type === 'Line' || obj.type === 'LineSegments' || obj.type === 'Sprite' || obj.type === 'GridHelper').toBe(false);
    });

    const top = meshNamed(scene, 'top');
    const { box, size } = bounds(top);
    expect(size.x).toBeCloseTo(meters(24), 5);
    expect(size.y).toBeCloseTo(meters(0.75), 5);
    expect(size.z).toBeCloseTo(meters(12), 5);
    // The thin face is height, so the board sits on the floor instead of standing in Z.
    expect(box.min.y).toBeCloseTo(0, 5);
    const mat = top.material as THREE.MeshStandardMaterial;
    expect(mat).toBeInstanceOf(THREE.MeshStandardMaterial);
    expect(mat.map).toBeNull();
    expect(mat.color.getHexString()).toBe(new THREE.Color(PRESET_WOOD_MATERIALS.walnut.baseColor).getHexString());
    expect(mat.roughness).toBe(PRESET_WOOD_MATERIALS.walnut.roughness);
    expect(mat.metalness).toBe(0);
    const leg = meshNamed(scene, 'leg').material as THREE.MeshStandardMaterial;
    expect(leg.metalness).toBe(PRESET_WOOD_MATERIALS.metal_accent.metalness);
    expect(leg.map).toBeNull();

    const legBox = bounds(meshNamed(scene, 'leg'));
    expect(legBox.size.y).toBeCloseTo(meters(28), 4);
    expect(legBox.size.x).toBeCloseTo(meters(1.5), 4);
    expect(legBox.center.x).toBeCloseTo(meters(10), 5);
  });

  it('keeps a part\'s world pose after its group was turned, and can include the room', () => {
    // Group moves are written onto each part. The group's own box is not a second transform.
    const turned = part('shelf', [24, 0.75, 12], {
      parentId: 'g',
      position: { x: 10, y: 0.375, z: 4 },
      rotation: { x: 0, y: 90, z: 0 },
    });
    const scene = buildDesignScene(project([
      part('g', [30, 30, 30], { shape: 'group', position: { x: 10, y: 0, z: 0 }, rotation: { x: 0, y: 90, z: 0 } }),
      turned,
    ]));
    expect(scene.children).toHaveLength(1);
    const { size, center } = bounds(scene);
    expect(center.x).toBeCloseTo(meters(10), 5);
    expect(center.y).toBeCloseTo(meters(0.375), 5);
    expect(center.z).toBeCloseTo(meters(4), 5);
    // One 90° yaw: the 24" length lies on Z, the 12" width on X.
    expect(size.x).toBeCloseTo(meters(12), 5);
    expect(size.z).toBeCloseTo(meters(24), 5);
    expect(size.y).toBeCloseTo(meters(0.75), 5);

    const wall = part('Wall 1 (scan)', [80, 96, 4], { generator: 'room-scan', shape: 'cube' });
    expect(designParts(project([wall]))).toHaveLength(0);
    expect(buildDesignScene(project([wall]), { includeRoom: true }).children.map((c) => c.name)).toEqual(['Wall 1 (scan)']);
  });

  it('cuts an outline hole and a dado the way the viewport does', () => {
    const solid = buildDesignScene(project([part('top', [24, 0.75, 12])]));
    const holed = buildDesignScene(project([
      part('top', [24, 0.75, 12], { board: { cornerRadius: 0, edge: 'none', holes: [{ id: 'h', x: 0, z: 0, diameter: 2 }] } }),
    ]));
    const outer = bounds(holed);
    expect(outer.size.x).toBeCloseTo(meters(24), 5);
    expect(volume(meshNamed(holed, 'top'))).toBeLessThan(volume(meshNamed(solid, 'top')) * 0.99);

    const side = part('side', [0.75, 30, 12], { position: { x: 0, y: 15, z: 0 } });
    const shelf = part('shelf', [24, 0.75, 12], { position: { x: 12.375, y: 12.375, z: 0 } });
    const dado: Joint = { id: 'j', type: 'dado', receiverId: 'side', materId: 'shelf', face: '+x', depth: 0.25, extended: 0 };
    const plain = buildDesignScene(project([side, shelf]));
    const joined = buildDesignScene(project([side, shelf], { joints: [dado] }));
    expect(volume(meshNamed(joined, 'side'))).toBeLessThan(volume(meshNamed(plain, 'side')) * 0.999);
    expect(joined.children).toHaveLength(2);
  });
});

function decodeBase64(text: string): Uint8Array {
  const bin = atob(text);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

function glbJson(bytes: Uint8Array) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  expect(String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3])).toBe('glTF');
  expect(view.getUint32(4, true)).toBe(2);
  const length = view.getUint32(12, true);
  expect(view.getUint32(16, true)).toBe(0x4E4F534A);
  return JSON.parse(new TextDecoder().decode(bytes.subarray(20, 20 + length))) as {
    meshes: { name?: string; primitives: { attributes: { POSITION: number } }[] }[];
    accessors: { min: number[]; max: number[] }[];
    materials: { pbrMetallicRoughness?: { baseColorFactor?: number[]; roughnessFactor?: number; metallicFactor?: number } }[];
    nodes: { name?: string; scale?: number[] }[];
    cameras?: unknown;
  };
}

describe('exportDesignFile', () => {
  const bench = () => project([part('top', [24, 0.75, 12])]);

  it('saves a .glb in meters through saveFile', async () => {
    expect(await exportDesignFile(bench(), 'glb')).toBe('downloaded');
    expect(saveFile).toHaveBeenCalledTimes(1);
    const [name, payload, mime, opts] = saveFile.mock.calls[0] as [string, string, string, { base64: boolean; title: string }];
    expect(name).toBe('Bench.glb');
    expect(mime).toBe(MODEL_FILE.glb.mime);
    expect(opts).toEqual({ base64: true, title: 'Bench' });
    const json = glbJson(decodeBase64(payload));
    expect(json.cameras).toBeUndefined();
    expect(json.nodes.every((node) => !node.scale || node.scale.every((s) => Math.abs(s - 1) < 1e-6))).toBe(true);
    const position = json.accessors[json.meshes[0].primitives[0].attributes.POSITION];
    expect(position.max[0] - position.min[0]).toBeCloseTo(meters(24), 4);
    expect(position.max[1] - position.min[1]).toBeCloseTo(meters(0.75), 4);
    expect(position.min[1]).toBeCloseTo(0, 4);
    const color = new THREE.Color(PRESET_WOOD_MATERIALS.walnut.baseColor);
    const factor = json.materials[0].pbrMetallicRoughness?.baseColorFactor ?? [];
    expect(factor[0]).toBeCloseTo(color.r, 4);
    expect(factor[1]).toBeCloseTo(color.g, 4);
    expect(factor[2]).toBeCloseTo(color.b, 4);
    expect(json.materials[0].pbrMetallicRoughness?.roughnessFactor).toBeCloseTo(PRESET_WOOD_MATERIALS.walnut.roughness, 5);
    expect(json.materials[0].pbrMetallicRoughness?.metallicFactor).toBe(0);
  });

  it('saves a .usdz in meters, Y-up, without textures', async () => {
    expect(await exportDesignFile({ ...bench(), name: 'Window bench' }, 'usdz')).toBe('downloaded');
    const [name, payload, mime, opts] = saveFile.mock.calls[0] as [string, string, string, { base64: boolean }];
    expect(name).toBe('Window bench.usdz');
    expect(mime).toBe(MODEL_FILE.usdz.mime);
    expect(opts.base64).toBe(true);
    const bytes = decodeBase64(payload);
    expect(String.fromCharCode(bytes[0], bytes[1])).toBe('PK');
    const { unzipSync } = await import('three/examples/jsm/libs/fflate.module.js');
    const files = unzipSync(bytes);
    const model = new TextDecoder().decode(files['model.usda']);
    const geometryName = Object.keys(files).find((name) => name.startsWith('geometries/'));
    const geometry = new TextDecoder().decode(files[geometryName!]);
    expect(model).toContain('metersPerUnit = 1');
    expect(model).toContain('upAxis = "Y"');
    expect(model).toContain('UsdPreviewSurface');
    expect(Object.keys(files).some((name) => name.startsWith('textures/'))).toBe(false);
    const points = geometry.split('point3f[] points = [')[1]?.split(']')[0] ?? '';
    const coords = [...points.matchAll(/\(([^)]+)\)/g)].map((m) => m[1].split(',').map(Number));
    const xs = coords.map((c) => c[0]);
    const ys = coords.map((c) => c[1]);
    expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(meters(24), 4);
    expect(Math.max(...ys) - Math.min(...ys)).toBeCloseTo(meters(0.75), 4);
    expect(Math.min(...ys)).toBeCloseTo(0, 4);
  });

  it('does not write a file when the project has no design parts', async () => {
    const empty = project([
      part('g', [1, 1, 1], { shape: 'group' }),
      part('wall', [10, 10, 1], { generator: 'room-scan', shape: 'cube' }),
    ]);
    expect(await exportDesignFile(empty, 'glb')).toBe('failed');
    expect(saveFile).not.toHaveBeenCalled();
  });
});
