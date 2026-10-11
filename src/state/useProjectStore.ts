import { create } from 'zustand';
import { migrateLegacyLabels, nextStockName, shapeCatalogEntry } from '../catalog/shapeCatalog';
import { findTemplate, instantiateTemplate } from '../catalog/templates';
import { generateMediaWall, MEDIA_WALL_TAG, type MediaWallInput } from '../generators/mediaWall';
import type { FurnitureObject, FurnitureProject, LengthUnit, ShapeType, SnapSettings, WoodMaterial } from '../types/furniture';
import { defaultBoardOptions } from '../utils/boardGeometry';
import { PRESET_WOOD_MATERIALS } from '../utils/woodTextureGenerator';

export interface WoodPreset {
  id: string;
  label: string;
  description: string;
  dimensions: { length: number; width: number; height: number };
  material: WoodMaterial;
  shape: ShapeType;
}

export const STANDARD_WOOD_PRESETS: WoodPreset[] = [
  {
    id: 'plywood_4x8_3_4',
    label: '4×8 Plywood Sheet (3/4")',
    description: '96" × 48" × 0.75" — Standard cabinet-grade plywood',
    dimensions: { length: 96, width: 48, height: 0.75 },
    material: PRESET_WOOD_MATERIALS.birch,
    shape: 'cube'
  },
  {
    id: 'plywood_4x8_1_2',
    label: '4×8 Plywood Sheet (1/2")',
    description: '96" × 48" × 0.5" — Thinner plywood for backing/shelves',
    dimensions: { length: 96, width: 48, height: 0.5 },
    material: PRESET_WOOD_MATERIALS.birch,
    shape: 'cube'
  },
  {
    id: 'pine_2x4_8ft',
    label: '2×4 Pine Board (8ft)',
    description: '96" × 3.5" × 1.5" — Standard dimensional lumber',
    dimensions: { length: 96, width: 3.5, height: 1.5 },
    material: PRESET_WOOD_MATERIALS.pine,
    shape: 'cube'
  },
  {
    id: 'mdf_4x8_3_4',
    label: '4×8 MDF Sheet (3/4")',
    description: '96" × 48" × 0.75" — Medium density fiberboard',
    dimensions: { length: 96, width: 48, height: 0.75 },
    material: PRESET_WOOD_MATERIALS.custom_paint,
    shape: 'cube'
  },
  {
    id: 'mdf_4x8_1_2',
    label: '4×8 MDF Sheet (1/2")',
    description: '96" × 48" × 0.5" — Thinner MDF sheet stock',
    dimensions: { length: 96, width: 48, height: 0.5 },
    material: PRESET_WOOD_MATERIALS.custom_paint,
    shape: 'cube'
  }
];

const LOCAL_STORAGE_KEY = 'ipad_3d_furniture_projects_v1';
const LIGHT_STARTING_WOOD = PRESET_WOOD_MATERIALS.birch;

export type ProjectPersistEvent =
  | { type: 'save' }
  | { type: 'delete'; id: string; updatedAt: number };

let persistListener: ((event: ProjectPersistEvent) => void) | null = null;
let persistSuppressed = false;

export function setProjectPersistListener(listener: ((event: ProjectPersistEvent) => void) | null) {
  persistListener = listener;
}

function notifyProjectPersist(event: ProjectPersistEvent) {
  if (persistSuppressed) return;
  persistListener?.(event);
}

function isStartingBoard(object: FurnitureObject): boolean {
  return (
    object.id === 'tabletop_1' ||
    object.name === 'Starting Cube' ||
    object.name === 'Table Top'
  );
}

function withLightStartingWood(projects: FurnitureProject[]): FurnitureProject[] {
  return projects.map((project) => ({
    ...project,
    objects: project.objects.map((object) => {
      const species = object.material?.species;
      const isDarkStart = species === 'walnut' || species === 'oak';
      if (isStartingBoard(object) && isDarkStart) {
        return { ...object, material: { ...LIGHT_STARTING_WOOD } };
      }
      return object;
    }),
  }));
}

function defaultSnapSettings(): SnapSettings {
  return {
    enabled: true,
    faceSnap: true,
    gridSnap: true,
    gridSize: 0.5,
    floorCollision: true,
  };
}

const createInitialProject = (): FurnitureProject => ({
  id: 'proj_default',
  name: 'Starter Layout',
  createdAt: Date.now(),
  updatedAt: Date.now(),
  unit: 'in',
  objects: [
    {
      id: 'starter_box',
      name: 'Box',
      shape: 'cube',
      dimensions: { length: 12, width: 12, height: 12 },
      position: { x: 0, y: 6, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
      material: LIGHT_STARTING_WOOD,
      visible: true,
    },
  ],
  snapSettings: defaultSnapSettings(),
  showFloor: true,
  floorOpacity: 0.4,
});

const INITIAL_PROJECT = createInitialProject();

interface ProjectState {
  projects: FurnitureProject[];
  activeProjectId: string;
  selectedObjectId: string | null;
  selectedObjectIds: string[];
  multiSelect: boolean;
  editingGroupId: string | null;
  activeGizmoMode: 'move' | 'resize' | 'rotate';
  showDimensions: boolean;

  historyStack: FurnitureObject[][];
  historyIndex: number;

  loadProjects: () => void;
  replaceAllProjects: (projects: FurnitureProject[]) => void;
  saveCurrentProject: () => void;
  createProject: (name: string, unit?: LengthUnit) => void;
  renameProject: (id: string, newName: string) => void;
  duplicateProject: (id: string) => void;
  deleteProject: (id: string) => void;
  switchProject: (id: string) => void;
  importProject: (project: FurnitureProject) => void;

  selectObject: (id: string | null, options?: { additive?: boolean }) => void;
  toggleMultiSelect: () => void;
  groupSelected: () => void;
  ungroup: (id: string) => void;
  enterGroup: (id: string) => void;
  exitGroup: () => void;
  addObject: (shape: ShapeType, name?: string) => void;
  addWoodPreset: (presetId: string) => void;
  createProjectFromTemplate: (templateId: string, unit?: LengthUnit) => boolean;
  insertTemplate: (templateId: string) => boolean;
  /** Adds a generated media wall as one group, replacing any earlier one in this project. */
  insertMediaWall: (input: MediaWallInput) => boolean;
  updateObject: (id: string, updates: Partial<FurnitureObject>, skipHistory?: boolean) => void;
  deleteObject: (id: string) => void;
  duplicateObject: (id: string) => void;
  setGizmoMode: (mode: 'move' | 'resize' | 'rotate') => void;
  toggleDimensions: () => void;

  pushHistoryState: () => void;
  undo: () => void;
  redo: () => void;

  toggleFloor: () => void;
  setFloorOpacity: (opacity: number) => void;
  setProjectBackgroundColor: (color: string) => void;
  updateSnapSettings: (settings: Partial<SnapSettings>) => void;
  setUnit: (unit: LengthUnit) => void;
}

export const useProjectStore = create<ProjectState>((set, get) => ({
  projects: [INITIAL_PROJECT],
  activeProjectId: INITIAL_PROJECT.id,
  selectedObjectId: INITIAL_PROJECT.objects[0]?.id ?? null,
  selectedObjectIds: INITIAL_PROJECT.objects[0] ? [INITIAL_PROJECT.objects[0].id] : [],
  multiSelect: false,
  editingGroupId: null,
  activeGizmoMode: 'move',
  showDimensions: true,
  historyStack: [[...INITIAL_PROJECT.objects]],
  historyIndex: 0,

  loadProjects: () => {
    try {
      const saved = localStorage.getItem(LOCAL_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          const projects = migrateLegacyLabels(withLightStartingWood(parsed));
          const firstId = projects[0].objects[0]?.id ?? null;
          set({
            projects,
            activeProjectId: projects[0].id,
            selectedObjectId: firstId,
            selectedObjectIds: firstId ? [firstId] : [],
            editingGroupId: null,
            historyStack: [[...projects[0].objects]],
            historyIndex: 0
          });
          try {
            localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(projects));
          } catch {
            // keep the in-memory light starting wood even if persist fails
          }
        }
      }
    } catch (err) {
      console.warn('Failed to load projects from localStorage:', err);
    }
  },

  saveCurrentProject: () => {
    const { projects, activeProjectId } = get();
    const updatedProjects = projects.map(p =>
      p.id === activeProjectId ? { ...p, updatedAt: Date.now() } : p
    );
    try {
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(updatedProjects));
      set({ projects: updatedProjects });
      notifyProjectPersist({ type: 'save' });
    } catch (err) {
      console.warn('Failed to auto-save project:', err);
    }
  },

  replaceAllProjects: (projects) => {
    const previousId = get().activeProjectId;
    const active = projects.find((project) => project.id === previousId) ?? projects[0] ?? null;
    const selected = active?.objects.find((object) => object.id === get().selectedObjectId)?.id
      ?? active?.objects[0]?.id
      ?? null;
    persistSuppressed = true;
    try {
      set({
        projects,
        activeProjectId: active?.id ?? '',
        selectedObjectId: selected,
        selectedObjectIds: selected ? [selected] : [],
        editingGroupId: null,
        historyStack: active ? [[...active.objects]] : [[]],
        historyIndex: 0,
      });
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(projects));
    } catch (err) {
      console.warn('Failed to apply synced projects:', err);
    } finally {
      persistSuppressed = false;
    }
  },

  createProject: (name: string, unit: LengthUnit = 'in') => {
    const defaultCube: FurnitureObject = {
      id: `obj_${Date.now()}_cube`,
      name: 'Box',
      shape: 'cube',
      dimensions: { length: 12, width: 12, height: 12 },
      position: { x: 0, y: 6, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
      material: LIGHT_STARTING_WOOD,
      visible: true
    };

    const newProj: FurnitureProject = {
      id: `proj_${Date.now()}`,
      name: name || 'Untitled Project',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      unit,
      objects: [defaultCube],
      snapSettings: defaultSnapSettings(),
      showFloor: true,
      floorOpacity: 0.4
    };

    set(state => ({
      projects: [...state.projects, newProj],
      activeProjectId: newProj.id,
      selectedObjectId: defaultCube.id,
      selectedObjectIds: [defaultCube.id],
      editingGroupId: null,
      multiSelect: false,
      historyStack: [[defaultCube]],
      historyIndex: 0
    }));

    get().saveCurrentProject();
  },

  renameProject: (id: string, newName: string) => {
    set(state => ({
      projects: state.projects.map(p => (p.id === id ? { ...p, name: newName } : p))
    }));
    get().saveCurrentProject();
  },

  duplicateProject: (id: string) => {
    const target = get().projects.find(p => p.id === id);
    if (!target) return;

    const dupProj: FurnitureProject = {
      ...target,
      id: `proj_${Date.now()}`,
      name: `${target.name} (Copy)`,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      objects: target.objects.map(o => ({ ...o, id: `obj_${Date.now()}_${Math.random().toString(36).substring(2, 5)}` }))
    };

    set(state => ({
      projects: [...state.projects, dupProj],
      activeProjectId: dupProj.id,
      selectedObjectId: dupProj.objects[0]?.id || null,
      selectedObjectIds: dupProj.objects[0] ? [dupProj.objects[0].id] : [],
      editingGroupId: null,
      historyStack: [[...dupProj.objects]],
      historyIndex: 0
    }));

    get().saveCurrentProject();
  },

  deleteProject: (id: string) => {
    const { projects, activeProjectId } = get();
    if (projects.length <= 1) return;

    const remaining = projects.filter(p => p.id !== id);
    const newActiveId = activeProjectId === id ? remaining[0].id : activeProjectId;
    const newActiveProj = remaining.find(p => p.id === newActiveId)!;

    set({
      projects: remaining,
      activeProjectId: newActiveId,
      selectedObjectId: newActiveProj.objects[0]?.id || null,
      selectedObjectIds: newActiveProj.objects[0] ? [newActiveProj.objects[0].id] : [],
      editingGroupId: null,
      historyStack: [[...newActiveProj.objects]],
      historyIndex: 0
    });

    try {
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(remaining));
    } catch (e) {}
    notifyProjectPersist({ type: 'delete', id, updatedAt: Date.now() });
  },

  switchProject: (id: string) => {
    const proj = get().projects.find(p => p.id === id);
    if (!proj) return;

    set({
      activeProjectId: id,
      selectedObjectId: proj.objects[0]?.id || null,
      selectedObjectIds: proj.objects[0] ? [proj.objects[0].id] : [],
      editingGroupId: null,
      historyStack: [[...proj.objects]],
      historyIndex: 0
    });
  },

  importProject: (project: FurnitureProject) => {
    set(state => ({
      projects: [...state.projects, project],
      activeProjectId: project.id,
      selectedObjectId: project.objects[0]?.id || null,
      selectedObjectIds: project.objects[0] ? [project.objects[0].id] : [],
      editingGroupId: null,
      historyStack: [[...project.objects]],
      historyIndex: 0
    }));

    get().saveCurrentProject();
  },

  selectObject: (id, options) => {
    const additive = Boolean(options?.additive || get().multiSelect);
    if (!id) {
      set({ selectedObjectId: null, selectedObjectIds: [] });
      return;
    }
    if (!additive) {
      set({ selectedObjectId: id, selectedObjectIds: [id] });
      return;
    }
    const current = get().selectedObjectIds;
    const next = current.includes(id) ? current.filter((item) => item !== id) : [...current, id];
    set({
      selectedObjectIds: next,
      selectedObjectId: next[next.length - 1] ?? null,
    });
  },

  toggleMultiSelect: () => set((state) => ({ multiSelect: !state.multiSelect })),

  groupSelected: () => {
    const { projects, activeProjectId, selectedObjectIds, pushHistoryState, saveCurrentProject } = get();
    const proj = projects.find((p) => p.id === activeProjectId);
    if (!proj) return;

    const members = proj.objects.filter((object) =>
      selectedObjectIds.includes(object.id) && object.shape !== 'group' && !object.parentId
    );
    if (members.length < 2) return;

    let minX = Infinity;
    let minY = Infinity;
    let minZ = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    let maxZ = -Infinity;
    for (const object of members) {
      const hx = object.dimensions.length / 2;
      const hy = object.dimensions.height / 2;
      const hz = object.dimensions.width / 2;
      minX = Math.min(minX, object.position.x - hx);
      maxX = Math.max(maxX, object.position.x + hx);
      minY = Math.min(minY, object.position.y - hy);
      maxY = Math.max(maxY, object.position.y + hy);
      minZ = Math.min(minZ, object.position.z - hz);
      maxZ = Math.max(maxZ, object.position.z + hz);
    }

    const group: FurnitureObject = {
      id: `grp_${Date.now()}`,
      name: 'Group',
      shape: 'group',
      dimensions: {
        length: Math.max(maxX - minX, 0.5),
        height: Math.max(maxY - minY, 0.5),
        width: Math.max(maxZ - minZ, 0.5),
      },
      position: {
        x: (minX + maxX) / 2,
        y: (minY + maxY) / 2,
        z: (minZ + maxZ) / 2,
      },
      rotation: { x: 0, y: 0, z: 0 },
      material: LIGHT_STARTING_WOOD,
      visible: true,
    };

    const memberIds = new Set(members.map((object) => object.id));
    const objects = proj.objects.map((object) =>
      memberIds.has(object.id) ? { ...object, parentId: group.id } : object
    );

    set((state) => ({
      projects: state.projects.map((p) =>
        p.id === activeProjectId ? { ...p, objects: [...objects, group] } : p
      ),
      selectedObjectId: group.id,
      selectedObjectIds: [group.id],
      multiSelect: false,
      editingGroupId: null,
    }));
    pushHistoryState();
    saveCurrentProject();
  },

  ungroup: (id) => {
    const { projects, activeProjectId, pushHistoryState, saveCurrentProject } = get();
    const proj = projects.find((p) => p.id === activeProjectId);
    if (!proj) return;
    const group = proj.objects.find((object) => object.id === id && object.shape === 'group');
    if (!group) return;
    const children = proj.objects.filter((object) => object.parentId === id);
    const objects = proj.objects
      .filter((object) => object.id !== id)
      .map((object) => (object.parentId === id ? { ...object, parentId: undefined } : object));
    const nextId = children[0]?.id ?? objects[0]?.id ?? null;
    set((state) => ({
      projects: state.projects.map((p) =>
        p.id === activeProjectId ? { ...p, objects } : p
      ),
      selectedObjectId: nextId,
      selectedObjectIds: nextId ? [nextId] : [],
      editingGroupId: state.editingGroupId === id ? null : state.editingGroupId,
    }));
    pushHistoryState();
    saveCurrentProject();
  },

  enterGroup: (id) => {
    const proj = get().projects.find((p) => p.id === get().activeProjectId);
    const child = proj?.objects.find((object) => object.parentId === id);
    set({
      editingGroupId: id,
      multiSelect: false,
      selectedObjectId: child?.id ?? id,
      selectedObjectIds: child ? [child.id] : [id],
    });
  },

  exitGroup: () => {
    const id = get().editingGroupId;
    set({
      editingGroupId: null,
      selectedObjectId: id,
      selectedObjectIds: id ? [id] : [],
    });
  },

  addObject: (shape: ShapeType, customName?: string) => {
    const { projects, activeProjectId, pushHistoryState, saveCurrentProject } = get();
    const proj = projects.find(p => p.id === activeProjectId);
    if (!proj) return;

    const spec = shapeCatalogEntry(shape);
    const dimensions = spec?.dimensions ?? { length: 12, width: 12, height: 12 };
    const baseName = spec?.defaultName ?? 'Box';
    const newObj: FurnitureObject = {
      id: `obj_${Date.now()}_${Math.random().toString(36).substring(2, 5)}`,
      name: customName || nextStockName(proj.objects.map((object) => object.name), baseName),
      shape,
      dimensions: { ...dimensions },
      position: { x: 0, y: dimensions.height / 2, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
      material: LIGHT_STARTING_WOOD,
      visible: true,
      board: shape === 'board' ? defaultBoardOptions() : undefined,
    };

    const updatedObjects = [...proj.objects, newObj];

    set(state => ({
      projects: state.projects.map(p =>
        p.id === activeProjectId ? { ...p, objects: updatedObjects } : p
      ),
      selectedObjectId: newObj.id,
      selectedObjectIds: [newObj.id],
      multiSelect: false,
    }));

    pushHistoryState();
    saveCurrentProject();
  },

  addWoodPreset: (presetId: string) => {
    const preset = STANDARD_WOOD_PRESETS.find(p => p.id === presetId);
    if (!preset) return;

    const { projects, activeProjectId, pushHistoryState, saveCurrentProject } = get();
    const proj = projects.find(p => p.id === activeProjectId);
    if (!proj) return;

    const newObj: FurnitureObject = {
      id: `obj_${Date.now()}_${Math.random().toString(36).substring(2, 5)}`,
      name: preset.label,
      shape: preset.shape,
      dimensions: { ...preset.dimensions },
      position: { x: 0, y: preset.dimensions.height / 2, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
      material: preset.material,
      visible: true
    };

    const updatedObjects = [...proj.objects, newObj];

    set(state => ({
      projects: state.projects.map(p =>
        p.id === activeProjectId ? { ...p, objects: updatedObjects } : p
      ),
      selectedObjectId: newObj.id,
      selectedObjectIds: [newObj.id],
      multiSelect: false,
    }));

    pushHistoryState();
    saveCurrentProject();
  },

  createProjectFromTemplate: (templateId, unit = 'in') => {
    const template = findTemplate(templateId);
    const objects = instantiateTemplate(templateId);
    if (!template || !objects || objects.length === 0) return false;

    const newProj: FurnitureProject = {
      id: `proj_${Date.now()}`,
      name: template.name,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      unit,
      objects,
      snapSettings: defaultSnapSettings(),
      showFloor: true,
      floorOpacity: 0.4,
    };

    set((state) => ({
      projects: [...state.projects, newProj],
      activeProjectId: newProj.id,
      selectedObjectId: objects[0].id,
      selectedObjectIds: [objects[0].id],
      editingGroupId: null,
      multiSelect: false,
      historyStack: [[...objects]],
      historyIndex: 0,
    }));
    get().saveCurrentProject();
    return true;
  },

  insertMediaWall: (input) => {
    const { projects, activeProjectId, pushHistoryState, saveCurrentProject } = get();
    const proj = projects.find((p) => p.id === activeProjectId);
    if (!proj) return false;
    const stamp = Date.now();
    const groupId = `grp_${stamp}_mediawall`;
    const parts: FurnitureObject[] = generateMediaWall(input).map((object, index) => ({
      ...object,
      id: `obj_${stamp}_${index}_${Math.random().toString(36).slice(2, 6)}`,
      parentId: groupId,
    }));
    if (parts.length === 0) return false;
    let minX = Infinity, minY = Infinity, minZ = Infinity;
    let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
    for (const o of parts) {
      minX = Math.min(minX, o.position.x - o.dimensions.length / 2);
      maxX = Math.max(maxX, o.position.x + o.dimensions.length / 2);
      minY = Math.min(minY, o.position.y - o.dimensions.height / 2);
      maxY = Math.max(maxY, o.position.y + o.dimensions.height / 2);
      minZ = Math.min(minZ, o.position.z - o.dimensions.width / 2);
      maxZ = Math.max(maxZ, o.position.z + o.dimensions.width / 2);
    }
    const group: FurnitureObject = {
      id: groupId,
      name: 'Media wall',
      shape: 'group',
      dimensions: { length: maxX - minX, height: maxY - minY, width: maxZ - minZ },
      position: { x: (minX + maxX) / 2, y: (minY + maxY) / 2, z: (minZ + maxZ) / 2 },
      rotation: { x: 0, y: 0, z: 0 },
      material: LIGHT_STARTING_WOOD,
      visible: true,
      generator: MEDIA_WALL_TAG,
    };
    // Replace an earlier generated wall: its group and every part still inside it.
    const oldGroupIds = new Set(
      proj.objects.filter((o) => o.shape === 'group' && o.generator === MEDIA_WALL_TAG).map((o) => o.id)
    );
    const kept = proj.objects.filter(
      (o) => !(o.generator === MEDIA_WALL_TAG && (o.shape === 'group' || !o.parentId || oldGroupIds.has(o.parentId)))
    ).map((o) => (o.parentId && oldGroupIds.has(o.parentId) ? { ...o, parentId: undefined } : o));

    set((state) => ({
      projects: state.projects.map((p) =>
        p.id === activeProjectId ? { ...p, objects: [...kept, ...parts, group] } : p
      ),
      selectedObjectId: group.id,
      selectedObjectIds: [group.id],
      multiSelect: false,
      editingGroupId: null,
    }));
    pushHistoryState();
    saveCurrentProject();
    return true;
  },

  insertTemplate: (templateId) => {
    const objects = instantiateTemplate(templateId);
    if (!objects || objects.length === 0) return false;
    const { projects, activeProjectId, pushHistoryState, saveCurrentProject } = get();
    const proj = projects.find((p) => p.id === activeProjectId);
    if (!proj) return false;

    set((state) => ({
      projects: state.projects.map((p) =>
        p.id === activeProjectId ? { ...p, objects: [...p.objects, ...objects] } : p
      ),
      selectedObjectId: objects[0].id,
      selectedObjectIds: [objects[0].id],
      multiSelect: false,
    }));
    pushHistoryState();
    saveCurrentProject();
    return true;
  },

  updateObject: (id: string, updates: Partial<FurnitureObject>, skipHistory = false) => {
    const { projects, activeProjectId, pushHistoryState, saveCurrentProject } = get();
    const proj = projects.find(p => p.id === activeProjectId);
    if (!proj) return;

    const existingObj = proj.objects.find(o => o.id === id);
    if (!existingObj) return;

    // Groups keep their own pivot. Members stay on the floor themselves.
    if (updates.position && proj.snapSettings.floorCollision && existingObj.shape !== 'group') {
      const objHeight = updates.dimensions?.height ?? existingObj.dimensions.height;
      const minY = objHeight / 2;
      if (updates.position.y < minY) {
        updates = { ...updates, position: { ...updates.position, y: minY } };
      }
    }

    let updatedObjects = proj.objects.map(o => (o.id === id ? { ...o, ...updates } : o));

    if (existingObj.shape === 'group' && (updates.position || updates.rotation)) {
      const dx = (updates.position?.x ?? existingObj.position.x) - existingObj.position.x;
      const dy = (updates.position?.y ?? existingObj.position.y) - existingObj.position.y;
      const dz = (updates.position?.z ?? existingObj.position.z) - existingObj.position.z;
      const drx = (updates.rotation?.x ?? existingObj.rotation.x) - existingObj.rotation.x;
      const dry = (updates.rotation?.y ?? existingObj.rotation.y) - existingObj.rotation.y;
      const drz = (updates.rotation?.z ?? existingObj.rotation.z) - existingObj.rotation.z;
      const pivot = existingObj.position;
      const rad = (deg: number) => (deg * Math.PI) / 180;
      updatedObjects = updatedObjects.map((object) => {
        if (object.parentId !== id) return object;
        let x = object.position.x - pivot.x;
        let y = object.position.y - pivot.y;
        let z = object.position.z - pivot.z;
        if (dry) {
          const c = Math.cos(rad(dry));
          const s = Math.sin(rad(dry));
          const nx = x * c - z * s;
          const nz = x * s + z * c;
          x = nx;
          z = nz;
        }
        if (drx) {
          const c = Math.cos(rad(drx));
          const s = Math.sin(rad(drx));
          const ny = y * c - z * s;
          const nz = y * s + z * c;
          y = ny;
          z = nz;
        }
        if (drz) {
          const c = Math.cos(rad(drz));
          const s = Math.sin(rad(drz));
          const nx = x * c - y * s;
          const ny = x * s + y * c;
          x = nx;
          y = ny;
        }
        return {
          ...object,
          position: { x: x + pivot.x + dx, y: y + pivot.y + dy, z: z + pivot.z + dz },
          rotation: {
            x: object.rotation.x + drx,
            y: object.rotation.y + dry,
            z: object.rotation.z + drz,
          },
        };
      });
    }

    set(state => ({
      projects: state.projects.map(p =>
        p.id === activeProjectId ? { ...p, objects: updatedObjects } : p
      )
    }));

    if (!skipHistory) {
      pushHistoryState();
      saveCurrentProject();
    }
  },

  deleteObject: (id: string) => {
    const { projects, activeProjectId, pushHistoryState, saveCurrentProject } = get();
    const proj = projects.find(p => p.id === activeProjectId);
    if (!proj) return;

    const target = proj.objects.find(o => o.id === id);
    let updatedObjects = proj.objects.filter(o => o.id !== id);
    if (target?.shape === 'group') {
      updatedObjects = updatedObjects.map(o =>
        o.parentId === id ? { ...o, parentId: undefined } : o
      );
    }

    const remaining = get().selectedObjectIds.filter(
      (item) => item !== id && updatedObjects.some((object) => object.id === item)
    );
    const nextSelected = remaining[remaining.length - 1] ?? updatedObjects[0]?.id ?? null;

    set(state => ({
      projects: state.projects.map(p =>
        p.id === activeProjectId ? { ...p, objects: updatedObjects } : p
      ),
      selectedObjectId: nextSelected,
      selectedObjectIds: nextSelected ? (remaining.length ? remaining : [nextSelected]) : [],
      editingGroupId: state.editingGroupId === id ? null : state.editingGroupId,
    }));

    pushHistoryState();
    saveCurrentProject();
  },

  duplicateObject: (id: string) => {
    const { projects, activeProjectId, pushHistoryState, saveCurrentProject } = get();
    const proj = projects.find(p => p.id === activeProjectId);
    if (!proj) return;

    const source = proj.objects.find(o => o.id === id);
    if (!source) return;

    const dupId = `obj_${Date.now()}_${Math.random().toString(36).substring(2, 5)}`;
    const dup: FurnitureObject = {
      ...source,
      id: dupId,
      name: `${source.name} Copy`,
      position: {
        x: source.position.x + 4,
        y: source.position.y,
        z: source.position.z + 4
      }
    };

    const copies: FurnitureObject[] = [dup];
    if (source.shape === 'group') {
      proj.objects.filter((object) => object.parentId === source.id).forEach((child, index) => {
        copies.push({
          ...child,
          id: `${dupId}_c${index}`,
          parentId: dupId,
          position: {
            x: child.position.x + 4,
            y: child.position.y,
            z: child.position.z + 4,
          },
        });
      });
    }

    const updatedObjects = [...proj.objects, ...copies];

    set(state => ({
      projects: state.projects.map(p =>
        p.id === activeProjectId ? { ...p, objects: updatedObjects } : p
      ),
      selectedObjectId: dup.id,
      selectedObjectIds: [dup.id],
      multiSelect: false,
    }));

    pushHistoryState();
    saveCurrentProject();
  },

  setGizmoMode: (mode) => set({ activeGizmoMode: mode }),

  toggleDimensions: () => set((state) => ({ showDimensions: !state.showDimensions })),

  pushHistoryState: () => {
    const { projects, activeProjectId, historyStack, historyIndex } = get();
    const proj = projects.find(p => p.id === activeProjectId);
    if (!proj) return;

    const newHistory = historyStack.slice(0, historyIndex + 1);
    newHistory.push(JSON.parse(JSON.stringify(proj.objects)));

    if (newHistory.length > 50) newHistory.shift();

    set({
      historyStack: newHistory,
      historyIndex: newHistory.length - 1
    });
  },

  undo: () => {
    const { historyIndex, historyStack, activeProjectId, saveCurrentProject } = get();
    if (historyIndex > 0) {
      const prevIndex = historyIndex - 1;
      const prevObjects = JSON.parse(JSON.stringify(historyStack[prevIndex]));

      set(state => ({
        historyIndex: prevIndex,
        projects: state.projects.map(p =>
          p.id === activeProjectId ? { ...p, objects: prevObjects } : p
        )
      }));

      saveCurrentProject();
    }
  },

  redo: () => {
    const { historyIndex, historyStack, activeProjectId, saveCurrentProject } = get();
    if (historyIndex < historyStack.length - 1) {
      const nextIndex = historyIndex + 1;
      const nextObjects = JSON.parse(JSON.stringify(historyStack[nextIndex]));

      set(state => ({
        historyIndex: nextIndex,
        projects: state.projects.map(p =>
          p.id === activeProjectId ? { ...p, objects: nextObjects } : p
        )
      }));

      saveCurrentProject();
    }
  },

  toggleFloor: () => {
    const { activeProjectId, saveCurrentProject } = get();
    set(state => ({
      projects: state.projects.map(p =>
        p.id === activeProjectId ? { ...p, showFloor: !p.showFloor } : p
      )
    }));
    saveCurrentProject();
  },

  setFloorOpacity: (opacity: number) => {
    const { activeProjectId, saveCurrentProject } = get();
    set(state => ({
      projects: state.projects.map(p =>
        p.id === activeProjectId ? { ...p, floorOpacity: opacity } : p
      )
    }));
    saveCurrentProject();
  },

  updateSnapSettings: (updates: Partial<SnapSettings>) => {
    const { activeProjectId, saveCurrentProject } = get();
    set(state => ({
      projects: state.projects.map(p =>
        p.id === activeProjectId
          ? { ...p, snapSettings: { ...p.snapSettings, ...updates } }
          : p
      )
    }));
    saveCurrentProject();
  },

  setUnit: (unit) => {
    const { activeProjectId, saveCurrentProject } = get();
    set(state => ({
      projects: state.projects.map(p => (p.id === activeProjectId ? { ...p, unit } : p))
    }));
    saveCurrentProject();
  },

  setProjectBackgroundColor: (color: string) => {
    const { activeProjectId, saveCurrentProject } = get();
    set(state => ({
      projects: state.projects.map(p =>
        p.id === activeProjectId ? { ...p, backgroundColor: color } : p
      )
    }));
    saveCurrentProject();
  }
}));
