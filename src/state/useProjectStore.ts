import { create } from 'zustand';
import { migrateLegacyLabels, nextStockName, shapeCatalogEntry } from '../catalog/shapeCatalog';
import { findTemplate, instantiateTemplate } from '../catalog/templates';
import { roomScanParts, syncRoomFromParts } from '../generators/roomScan';
import { placeBuiltIn, slideAlongWall, type BuiltInRequest } from '../builtins/builtIns';
import { squareUpRoom } from '../generators/squareRoom';
import { DEFAULT_RESIZE_STEP, floorSafeDy, floorSafeY } from '../utils/resizeRules';
import { groupsToRefit, turnObjects, type TurnAxis } from '../utils/turn90';
import { instantiateUserTemplate, type Placement, type UserTemplate } from '../templates/userTemplates';
import { extendMater, jointGeometry, shiftAlong } from '../joinery/joints';
import { isViewStyle, savedAppStyle, type ViewStyle } from './viewStyle';
import { stretchObjects } from '../utils/groupStretch';
import { reanchorUpdate } from '../utils/holes';
import type { Face } from '../utils/pushPull';
import type { Joint, Position3D, FurnitureObject, FurnitureProject, LengthUnit, ScannedRoom, ShapeType, SnapSettings, WoodMaterial } from '../types/furniture';
import { defaultBoardOptions } from '../utils/boardGeometry';
import { PRESET_WOOD_MATERIALS, freshenFinish } from '../utils/woodTextureGenerator';
import { ancestorIds, leavesOf, deepDuplicate, deleteCascade, groupIds, moveSet, normalizeTree, refitGroups, ungroupOne } from './groupTree';

// Also refreshes finishes saved with the old, far-too-dark wood presets (walnut read as black).
const freshenObjects = (os: FurnitureObject[]) => {
  let changed = false;
  const out = os.map((o) => { if (!o.material) return o; const m = freshenFinish(o.material); if (m === o.material) return o; changed = true; return { ...o, material: m }; });
  return changed ? out : os;
};
const normalizeProjects = (ps: FurnitureProject[]) => {
  // Projects from before per-project styles keep the look they had (the old app-wide style).
  let legacy: ViewStyle | null = null;
  return ps.map((p) => {
    const objects = freshenObjects(normalizeTree(p.objects ?? []));
    const styled = isViewStyle(p.viewStyle);
    if (objects === p.objects && styled) return p;
    return { ...p, objects, viewStyle: styled ? p.viewStyle : (legacy ??= savedAppStyle()) };
  });
};

export interface WoodPreset {
  id: string;
  label: string;
  description: string;
  dimensions: { length: number; width: number; height: number };
  material: WoodMaterial;
  shape: ShapeType;
  category: PresetCategory;
}

export type PresetCategory = 'Plywood sheets' | 'MDF sheets' | 'Lumber';

const THICKNESSES: Array<[string, number]> = [['1/4', 0.25], ['1/2', 0.5], ['3/4', 0.75]];
const sheet = (kind: 'plywood' | 'mdf', [label, t]: [string, number]): WoodPreset => ({
  id: `${kind}_4x8_${label.replace('/', '_')}`,
  label: `${kind === 'plywood' ? 'Plywood' : 'MDF'} 4×8 · ${label}"`,
  description: `96" × 48" × ${t}"`,
  dimensions: { length: 96, width: 48, height: t },
  material: kind === 'plywood' ? PRESET_WOOD_MATERIALS.plywood : PRESET_WOOD_MATERIALS.mdf,
  shape: 'board',
  category: kind === 'plywood' ? 'Plywood sheets' : 'MDF sheets',
});

export const STANDARD_WOOD_PRESETS: WoodPreset[] = [
  ...THICKNESSES.map((t) => sheet('plywood', t)),
  ...THICKNESSES.map((t) => sheet('mdf', t)),
  {
    id: 'pine_2x4_8ft',
    label: '2×4 Pine (8 ft)',
    description: '96" × 3.5" × 1.5"',
    dimensions: { length: 96, width: 3.5, height: 1.5 },
    material: PRESET_WOOD_MATERIALS.pine,
    shape: 'cube',
    category: 'Lumber',
  },
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
  /** Clean or Realistic for the open project (saved and synced with it). */
  setViewStyle: (style: ViewStyle) => void;

  selectObject: (id: string | null, options?: { additive?: boolean }) => void;
  toggleMultiSelect: () => void;
  groupSelected: () => void;
  ungroup: (id: string) => void;
  enterGroup: (id: string) => void;
  /** Exit one level (to the opened group's parent). */
  exitGroup: () => void;
  /** Jump to a group context (breadcrumb); null = top level. */
  setGroupContext: (id: string | null) => void;
  /** Replace the selection (area select). */
  selectMany: (ids: string[]) => void;
  deleteSelected: () => void;
  duplicateSelected: () => void;
  /** Move every selected item (and everything inside) by a delta. */
  translateSelection: (delta: { x: number; y: number; z: number }, skipHistory?: boolean) => void;
  /** Turn the selection 90° about a world axis through its center (one undo step). */
  turnSelection90: (axis: TurnAxis, sign?: 1 | -1) => void;
  addObject: (shape: ShapeType, name?: string) => void;
  addWoodPreset: (presetId: string) => void;
  createProjectFromTemplate: (templateId: string, unit?: LengthUnit) => boolean;
  insertTemplate: (templateId: string) => boolean;
  /** Adds a built-in (or regenerates `editId`); returns its group id. */
  insertBuiltIn: (req: BuiltInRequest) => string | null;
  /** Removes a built-in's group and all its parts. */
  deleteBuiltIn: (groupId: string) => void;
  /** Insert a saved user template as one group (or a single part); one undo step. */
  insertUserTemplate: (template: UserTemplate, place: { at?: { x: number; z: number }; wallId?: string | null }) => boolean;
  /** Put a scanned room into the current project, replacing only an earlier room scan. */
  addScannedRoom: (room: ScannedRoom) => boolean;
  /** Align the scanned room to the grid and square near-right corners; wall-fitted built-ins follow. */
  squareUpWalls: () => boolean;
  /** Lock/unlock the scanned room's walls for editing (per project). */
  /** When unlocking with `selectWallId`, that wall's part becomes the selection (ready for Move/Delete). */
  setRoomLocked: (locked: boolean, selectWallId?: string | null) => void;
  /** Pin a tape-measure dimension line in the active project. Returns its id. */
  addMeasurement: (a: Position3D, b: Position3D) => string | null;
  removeMeasurement: (id: string) => void;
  /** Add or edit a joint; dado/rabbet can lengthen the mating part into the groove. */
  saveJoint: (j: Omit<Joint, 'id' | 'extended'> & { id?: string }, extend: boolean) => string | null;
  removeJoint: (id: string) => void;
  /**
   * Slide where a joint is cut along the receiving board (dado position, rabbet edge).
   * The mating board, and anything that sits on it, follows so it stays seated. One undo step.
   */
  slideJoint: (id: string, delta: number) => boolean;
  /**
   * Push/pull a group or multi-selection on one face to a new size (from `base`
   * objects when given, e.g. the drag start). No undo step; the caller commits.
   */
  stretchSelection: (rootIds: string[], face: Face, size: number, base?: FurnitureObject[], exact?: boolean) => void;
  /** New project whose scene is the scanned room (locked reference parts). */
  createProjectFromScan: (name: string, room: ScannedRoom, unit?: LengthUnit) => boolean;
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

/** Keep project.scannedRoom in step with edited room-scan parts. */
function withRoomSync(p: FurnitureProject, objects: FurnitureObject[]): FurnitureProject {
  return p.scannedRoom ? { ...p, objects, scannedRoom: syncRoomFromParts(p.scannedRoom, objects) } : { ...p, objects };
}

/** Joints that went with each undo snapshot (keyed by the snapshot array). */
const jointSnaps = new WeakMap<FurnitureObject[], Joint[]>();
/** First undo entry for a project: its parts plus its joints. */
function seedHistory(objects: FurnitureObject[], joints?: Joint[]): FurnitureObject[] {
  const snap = [...objects];
  jointSnaps.set(snap, JSON.parse(JSON.stringify(joints ?? [])));
  return snap;
}

/** Max undo steps kept per project. */
export const HISTORY_LIMIT = 100;

export const useProjectStore = create<ProjectState>((set, get) => {
  /** Swap the active project's objects for a history entry; the saved project then matches it. */
  const restoreHistory = (index: number) => {
    const { historyStack, activeProjectId, selectedObjectIds, editingGroupId, saveCurrentProject } = get();
    const objects: FurnitureObject[] = JSON.parse(JSON.stringify(historyStack[index]));
    const ids = new Set(objects.map((o) => o.id));
    // Undo/redo restores joints with the parts (depth, type, seating stay in step).
    const snapJoints = jointSnaps.get(historyStack[index]);
    const keep = selectedObjectIds.filter((id) => ids.has(id));
    set((state) => ({
      historyIndex: index,
      projects: state.projects.map((p) => {
        if (p.id !== activeProjectId) return p;
        const joints = (snapJoints ? JSON.parse(JSON.stringify(snapJoints)) as Joint[] : p.joints ?? [])
          .filter((j) => ids.has(j.receiverId) && ids.has(j.materId));
        return { ...withRoomSync(p, objects), joints, updatedAt: Date.now() };
      }),
      selectedObjectIds: keep,
      selectedObjectId: keep[keep.length - 1] ?? null,
      editingGroupId: editingGroupId && ids.has(editingGroupId) ? editingGroupId : null,
    }));
    saveCurrentProject();
  };
  return {
  projects: [INITIAL_PROJECT],
  activeProjectId: INITIAL_PROJECT.id,
  selectedObjectId: INITIAL_PROJECT.objects[0]?.id ?? null,
  selectedObjectIds: INITIAL_PROJECT.objects[0] ? [INITIAL_PROJECT.objects[0].id] : [],
  multiSelect: false,
  editingGroupId: null,
  activeGizmoMode: 'move',
  showDimensions: true,
  historyStack: [seedHistory(INITIAL_PROJECT.objects, INITIAL_PROJECT.joints)],
  historyIndex: 0,

  loadProjects: () => {
    try {
      const saved = localStorage.getItem(LOCAL_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          const projects = normalizeProjects(migrateLegacyLabels(withLightStartingWood(parsed)));
          const firstId = projects[0].objects[0]?.id ?? null;
          set({
            projects,
            activeProjectId: projects[0].id,
            selectedObjectId: firstId,
            selectedObjectIds: firstId ? [firstId] : [],
            editingGroupId: null,
            historyStack: [seedHistory(projects[0].objects, projects[0].joints)],
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

  replaceAllProjects: (incoming) => {
    const projects = normalizeProjects(incoming);
    const previousId = get().activeProjectId;
    const active = projects.find((project) => project.id === previousId) ?? projects[0] ?? null;
    const selected = active?.objects.find((object) => object.id === get().selectedObjectId)?.id
      ?? active?.objects[0]?.id
      ?? null;
    // Sync usually echoes what we already have: keep history, selection and
    // the opened group then, so a sync never resets the editor mid-session.
    const prevActive = get().projects.find((p) => p.id === previousId);
    const sameActive = Boolean(active && prevActive && active.id === prevActive.id
      && JSON.stringify(active.objects) === JSON.stringify(prevActive.objects));
    persistSuppressed = true;
    try {
      if (sameActive) {
        set({ projects });
        localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(projects));
        return;
      }
      set({
        projects,
        activeProjectId: active?.id ?? '',
        selectedObjectId: selected,
        selectedObjectIds: selected ? [selected] : [],
        editingGroupId: null,
        historyStack: active ? [seedHistory(active.objects, active.joints)] : [seedHistory([])],
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
      floorOpacity: 0.4,
      viewStyle: savedAppStyle(),
    };

    set(state => ({
      projects: [...state.projects, newProj],
      activeProjectId: newProj.id,
      selectedObjectId: defaultCube.id,
      selectedObjectIds: [defaultCube.id],
      editingGroupId: null,
      multiSelect: false,
      historyStack: [seedHistory([defaultCube])],
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
      historyStack: [seedHistory(dupProj.objects, dupProj.joints)],
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
      historyStack: [seedHistory(newActiveProj.objects, newActiveProj.joints)],
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
      historyStack: [seedHistory(proj.objects, proj.joints)],
      historyIndex: 0
    });
  },

  importProject: (raw: FurnitureProject) => {
    const project = { ...raw, objects: freshenObjects(normalizeTree(raw.objects ?? [])), viewStyle: isViewStyle(raw.viewStyle) ? raw.viewStyle : savedAppStyle() };
    set(state => ({
      projects: [...state.projects, project],
      activeProjectId: project.id,
      selectedObjectId: project.objects[0]?.id || null,
      selectedObjectIds: project.objects[0] ? [project.objects[0].id] : [],
      editingGroupId: null,
      historyStack: [seedHistory(project.objects, project.joints)],
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
    const { projects, activeProjectId, selectedObjectIds, editingGroupId, pushHistoryState, saveCurrentProject } = get();
    const proj = projects.find((p) => p.id === activeProjectId);
    if (!proj) return;
    const result = groupIds(proj.objects, selectedObjectIds, editingGroupId, LIGHT_STARTING_WOOD);
    if (!result) return;
    set((state) => ({
      projects: state.projects.map((p) => (p.id === activeProjectId ? { ...p, objects: result.objects } : p)),
      selectedObjectId: result.groupId,
      selectedObjectIds: [result.groupId],
      multiSelect: false,
    }));
    pushHistoryState();
    saveCurrentProject();
  },

  ungroup: (id) => {
    const { projects, activeProjectId, editingGroupId, pushHistoryState, saveCurrentProject } = get();
    const proj = projects.find((p) => p.id === activeProjectId);
    if (!proj) return;
    const result = ungroupOne(proj.objects, id);
    if (!result) return;
    const group = proj.objects.find((o) => o.id === id);
    set((state) => ({
      projects: state.projects.map((p) => (p.id === activeProjectId ? { ...p, objects: result.objects } : p)),
      selectedObjectId: result.childIds[result.childIds.length - 1] ?? null,
      selectedObjectIds: result.childIds,
      editingGroupId: editingGroupId === id ? (group?.parentId ?? null) : editingGroupId,
    }));
    pushHistoryState();
    saveCurrentProject();
  },

  enterGroup: (id) => {
    set({ editingGroupId: id, multiSelect: false, selectedObjectId: null, selectedObjectIds: [] });
  },

  exitGroup: () => {
    const id = get().editingGroupId;
    const proj = get().projects.find((p) => p.id === get().activeProjectId);
    const parent = id ? proj?.objects.find((o) => o.id === id)?.parentId ?? null : null;
    set({ editingGroupId: parent, selectedObjectId: id, selectedObjectIds: id ? [id] : [] });
  },

  setGroupContext: (target) => {
    const { editingGroupId, projects, activeProjectId } = get();
    const proj = projects.find((p) => p.id === activeProjectId);
    // Select the crumb we came up from, so the user keeps their place.
    let from: string | null = null;
    if (proj && editingGroupId) {
      const chain = [editingGroupId, ...ancestorIds(proj.objects, editingGroupId)];
      const i = target ? chain.indexOf(target) : chain.length;
      from = i > 0 ? chain[i - 1] : null;
    }
    set({ editingGroupId: target, selectedObjectId: from, selectedObjectIds: from ? [from] : [] });
  },

  selectMany: (ids) => set({ selectedObjectIds: ids, selectedObjectId: ids[ids.length - 1] ?? null }),

  deleteSelected: () => {
    const { projects, activeProjectId, selectedObjectIds, pushHistoryState, saveCurrentProject } = get();
    const proj = projects.find((p) => p.id === activeProjectId);
    if (!proj || !selectedObjectIds.length) return;
    const room = proj.objects.some((o) => selectedObjectIds.includes(o.id) && o.generator === 'room-scan');
    const objects = deleteCascade(proj.objects, selectedObjectIds);
    set((state) => ({
      projects: state.projects.map((p) => (p.id === activeProjectId ? (room ? withRoomSync(p, objects) : { ...p, objects }) : p)),
      selectedObjectId: null,
      selectedObjectIds: [],
      editingGroupId: state.editingGroupId && objects.some((o) => o.id === state.editingGroupId) ? state.editingGroupId : null,
    }));
    pushHistoryState();
    saveCurrentProject();
  },

  duplicateSelected: () => {
    const { projects, activeProjectId, selectedObjectIds, pushHistoryState, saveCurrentProject } = get();
    const proj = projects.find((p) => p.id === activeProjectId);
    if (!proj) return;
    const ids = selectedObjectIds.filter((id) => proj.objects.find((o) => o.id === id)?.generator !== 'room-scan');
    if (!ids.length) return;
    const result = deepDuplicate(proj.objects, ids);
    set((state) => ({
      projects: state.projects.map((p) => (p.id === activeProjectId ? { ...p, objects: result.objects } : p)),
      selectedObjectIds: result.topIds,
      selectedObjectId: result.topIds[result.topIds.length - 1] ?? null,
    }));
    pushHistoryState();
    saveCurrentProject();
  },

  turnSelection90: (axis, sign = 1) => {
    const { projects, activeProjectId, selectedObjectIds, pushHistoryState, saveCurrentProject } = get();
    const proj = projects.find((p) => p.id === activeProjectId);
    if (!proj || !selectedObjectIds.length) return;
    // Wall-fitted built-ins don't rotate freely.
    if (selectedObjectIds.some((id) => { const o = proj.objects.find((x) => x.id === id); return !!o?.builtIn?.wallId && !o.parentId; })) return;
    const floorOn = proj.showFloor && proj.snapSettings.floorCollision !== false;
    let objects = turnObjects(proj.objects, selectedObjectIds, axis, { floorOn, sign });
    if (objects === proj.objects) return;
    objects = refitGroups(objects, groupsToRefit(proj.objects, selectedObjectIds));
    set((state) => ({ projects: state.projects.map((p) => (p.id === activeProjectId ? { ...p, objects } : p)) }));
    pushHistoryState();
    saveCurrentProject();
  },

  translateSelection: (delta, skipHistory = false) => {
    const { projects, activeProjectId, selectedObjectIds, pushHistoryState, saveCurrentProject } = get();
    const proj = projects.find((p) => p.id === activeProjectId);
    if (!proj || !selectedObjectIds.length) return;
    const moving = new Set<string>();
    for (const id of selectedObjectIds) for (const m of moveSet(proj.objects, id)) moving.add(m);
    // Keep everything above the floor when floor collision is on.
    let dy = delta.y;
    if (proj.snapSettings.floorCollision && dy < 0) {
      dy = floorSafeDy(proj.objects.filter((o) => moving.has(o.id) && o.shape !== 'group' && o.generator !== 'room-scan'), dy);
    }
    const parents = new Set(selectedObjectIds.map((id) => proj.objects.find((o) => o.id === id)?.parentId).filter(Boolean) as string[]);
    let objects = proj.objects.map((o) => moving.has(o.id)
      ? { ...o, position: { x: o.position.x + delta.x, y: o.position.y + dy, z: o.position.z + delta.z } }
      : o);
    objects = refitGroups(objects, parents);
    set((state) => ({ projects: state.projects.map((p) => (p.id === activeProjectId ? { ...p, objects } : p)) }));
    if (!skipHistory) {
      pushHistoryState();
      saveCurrentProject();
    }
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
      name: nextStockName(proj.objects.map((o) => o.name), preset.label),
      shape: preset.shape,
      dimensions: { ...preset.dimensions },
      position: { x: 0, y: preset.dimensions.height / 2, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
      material: { ...preset.material },
      visible: true,
      board: preset.shape === 'board' ? defaultBoardOptions() : undefined,
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
      viewStyle: savedAppStyle(),
    };

    set((state) => ({
      projects: [...state.projects, newProj],
      activeProjectId: newProj.id,
      selectedObjectId: objects[0].id,
      selectedObjectIds: [objects[0].id],
      editingGroupId: null,
      multiSelect: false,
      historyStack: [seedHistory(objects)],
      historyIndex: 0,
    }));
    get().saveCurrentProject();
    return true;
  },

  insertBuiltIn: (req) => {
    const { projects, activeProjectId, pushHistoryState, saveCurrentProject } = get();
    const proj = projects.find((p) => p.id === activeProjectId);
    if (!proj) return null;
    const result = placeBuiltIn(proj.objects, proj.scannedRoom, req, LIGHT_STARTING_WOOD);
    if (!result) return null;
    set((state) => ({
      projects: state.projects.map((p) => (p.id === activeProjectId ? { ...p, objects: result.objects } : p)),
      selectedObjectId: result.groupId,
      selectedObjectIds: [result.groupId],
      multiSelect: false,
      editingGroupId: null,
    }));
    pushHistoryState();
    saveCurrentProject();
    return result.groupId;
  },

  insertUserTemplate: (template, place) => {
    const { projects, activeProjectId, pushHistoryState } = get();
    const proj = projects.find((p) => p.id === activeProjectId);
    if (!proj) return false;
    const wall = place.wallId ? proj.scannedRoom?.walls.find((w) => w.id === place.wallId) : undefined;
    const placement: Placement = wall ? { wall } : { at: place.at };
    const added = instantiateUserTemplate(template, placement, LIGHT_STARTING_WOOD);
    if (added.length === 0) return false;
    const top = added.find((o) => o.shape === 'group') ?? added[0];
    set((state) => ({
      projects: state.projects.map((p) => (p.id === activeProjectId ? { ...p, objects: [...p.objects, ...added] } : p)),
      selectedObjectId: top.id,
      selectedObjectIds: [top.id],
      editingGroupId: null,
      multiSelect: false,
    }));
    pushHistoryState();
    return true;
  },

  addScannedRoom: (room) => {
    const { projects, activeProjectId, pushHistoryState } = get();
    const proj = projects.find((p) => p.id === activeProjectId);
    if (!proj || room.walls.length === 0) return false;
    const stamp = Date.now();
    const roomParts: FurnitureObject[] = roomScanParts(room).map((o, i) => ({ ...o, id: `obj_${stamp}_room_${i}` }));
    const kept = proj.objects.filter((o) => o.generator !== 'room-scan');
    set((state) => ({
      projects: state.projects.map((p) => (p.id === activeProjectId
        ? { ...p, objects: [...roomParts, ...kept], scannedRoom: room, roomLocked: undefined }
        : p)),
      selectedObjectId: null,
      selectedObjectIds: [],
      editingGroupId: null,
    }));
    pushHistoryState();
    return true;
  },

  squareUpWalls: () => {
    const { projects, activeProjectId, pushHistoryState, saveCurrentProject } = get();
    const proj = projects.find((p) => p.id === activeProjectId);
    if (!proj?.scannedRoom?.walls.length) return false;
    const room = squareUpRoom(proj.scannedRoom);
    const stamp = Date.now();
    const locked = proj.roomLocked !== false;
    const roomParts: FurnitureObject[] = roomScanParts(room).map((o, i) => ({ ...o, id: `obj_${stamp}_room_${i}`, ...(locked ? {} : { locked: false }) }));
    let objects = [...roomParts, ...proj.objects.filter((o) => o.generator !== 'room-scan')];
    // Re-fit built-ins that sit on a scanned wall so they stay flush.
    for (const g of proj.objects) {
      const bi = g.builtIn;
      if (g.shape !== 'group' || !bi?.wallId || !room.walls.some((w) => w.id === bi.wallId)) continue;
      const width = typeof bi.input.wallWidth === 'number' ? bi.input.wallWidth : undefined;
      const placed = placeBuiltIn(objects, room, { template: bi.template, input: bi.input, wallId: bi.wallId, center: bi.center, width, editId: bi.id }, g.material);
      if (placed) objects = placed.objects;
    }
    set((state) => ({
      projects: state.projects.map((p) => (p.id === activeProjectId ? { ...p, objects, scannedRoom: room } : p)),
      selectedObjectId: null,
      selectedObjectIds: [],
    }));
    pushHistoryState();
    saveCurrentProject();
    return true;
  },

  addMeasurement: (a, b) => {
    const { activeProjectId, saveCurrentProject } = get();
    if (!activeProjectId) return null;
    const id = `dim_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    set((st) => ({ projects: st.projects.map((p) => (p.id === activeProjectId ? { ...p, measurements: [...(p.measurements ?? []), { id, a: { ...a }, b: { ...b } }] } : p)) }));
    saveCurrentProject();
    return id;
  },
  removeMeasurement: (id) => {
    const { activeProjectId, saveCurrentProject } = get();
    set((st) => ({ projects: st.projects.map((p) => (p.id === activeProjectId ? { ...p, measurements: (p.measurements ?? []).filter((m) => m.id !== id) } : p)) }));
    saveCurrentProject();
  },

  saveJoint: (j, extend) => {
    const { activeProjectId, projects, updateObject, pushHistoryState, saveCurrentProject } = get();
    const proj = projects.find((p) => p.id === activeProjectId);
    if (!proj) return null;
    const find = (id: string) => get().projects.find((p) => p.id === activeProjectId)?.objects.find((o) => o.id === id);
    const old = j.id ? proj.joints?.find((x) => x.id === j.id) : undefined;
    if (old?.extended) {
      const R = find(old.receiverId), M = find(old.materId);
      if (R && M) updateObject(M.id, extendMater(R, M, old.face, -old.extended), true);
    }
    const grow = extend && (j.type === 'dado' || j.type === 'rabbet') ? j.depth : 0;
    if (grow) {
      const R = find(j.receiverId), M = find(j.materId);
      if (R && M) updateObject(M.id, extendMater(R, M, j.face, grow), true);
    }
    const id = j.id ?? `joint_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const joint: Joint = { ...j, id, extended: grow };
    set((st) => ({
      projects: st.projects.map((p) => {
        if (p.id !== activeProjectId) return p;
        const ids = new Set(p.objects.map((o) => o.id));
        const rest = (p.joints ?? []).filter((x) => x.id !== id && ids.has(x.receiverId) && ids.has(x.materId));
        return { ...p, joints: [...rest, joint] };
      }),
    }));
    pushHistoryState();
    saveCurrentProject();
    return id;
  },
  slideJoint: (id, delta) => {
    const { activeProjectId, projects, pushHistoryState, saveCurrentProject } = get();
    const proj = projects.find((p) => p.id === activeProjectId);
    const j = proj?.joints?.find((x) => x.id === id);
    if (!proj || !j || !Number.isFinite(delta) || Math.abs(delta) < 1e-9) return false;
    const byId = new Map(proj.objects.map((o) => [o.id, o]));
    const R = byId.get(j.receiverId), M = byId.get(j.materId);
    const g = jointGeometry(j, R, M);
    if (!g || !R || !M) return false;
    // Keep the cut on the board.
    const half = g.span / 2;
    const d = Math.max(-half - g.groove[0], Math.min(half - g.groove[1], delta));
    if (Math.abs(d) < 1e-9) return false;
    // The mating board and parts joined onto it (it is their receiver) move together.
    const moving = new Set([M.id]);
    for (let grew = true; grew;) {
      grew = false;
      for (const k of proj.joints ?? []) {
        if (moving.has(k.receiverId) && !moving.has(k.materId) && k.materId !== R.id && byId.has(k.materId)) { moving.add(k.materId); grew = true; }
      }
    }
    set((st) => ({
      projects: st.projects.map((p) => (p.id !== activeProjectId ? p : {
        ...p,
        objects: p.objects.map((o) => (moving.has(o.id) ? { ...o, position: shiftAlong(R, o, g.L.t, d) } : o)),
        updatedAt: Date.now(),
      })),
    }));
    pushHistoryState();
    saveCurrentProject();
    return true;
  },
  removeJoint: (id) => {
    const { activeProjectId, projects, updateObject, pushHistoryState, saveCurrentProject } = get();
    const proj = projects.find((p) => p.id === activeProjectId);
    const old = proj?.joints?.find((x) => x.id === id);
    if (!proj || !old) return;
    const R = proj.objects.find((o) => o.id === old.receiverId), M = proj.objects.find((o) => o.id === old.materId);
    if (old.extended && R && M) updateObject(M.id, extendMater(R, M, old.face, -old.extended), true);
    set((st) => ({ projects: st.projects.map((p) => (p.id === activeProjectId ? { ...p, joints: (p.joints ?? []).filter((x) => x.id !== id) } : p)) }));
    pushHistoryState();
    saveCurrentProject();
  },

  stretchSelection: (rootIds, face, size, base, exact = false) => {
    const { activeProjectId, projects } = get();
    const proj = projects.find((p) => p.id === activeProjectId);
    if (!proj) return;
    const floorOn = Boolean(proj.showFloor && proj.snapSettings.floorCollision !== false);
    const objects = stretchObjects(base ?? proj.objects, rootIds, face, size, {
      snap: !exact && proj.snapSettings.enabled !== false, step: proj.snapSettings.resizeStep ?? DEFAULT_RESIZE_STEP, unit: proj.unit, floorOn,
    });
    if (objects === (base ?? proj.objects)) return;
    set((st) => ({ projects: st.projects.map((p) => (p.id === activeProjectId ? { ...p, objects } : p)) }));
  },

  setRoomLocked: (locked, selectWallId) => {
    const { activeProjectId, saveCurrentProject, projects, selectedObjectIds } = get();
    const proj = projects.find((p) => p.id === activeProjectId);
    const wall = selectWallId ? proj?.scannedRoom?.walls.find((w) => w.id === selectWallId) : undefined;
    const wallPart = wall ? proj?.objects.find((o) => o.generator === 'room-scan' && !o.openingId
      && !/\b(Window|Door|Opening)\b/.test(o.name) && (o.wallId === wall.id || o.name === `${wall.label} (scan)`)) : undefined;
    const roomIds = new Set(proj?.objects.filter((o) => o.generator === 'room-scan').map((o) => o.id));
    const keep = selectedObjectIds.filter((id) => !roomIds.has(id));
    set((state) => ({
      projects: state.projects.map((p) => (p.id === activeProjectId
        ? { ...p, roomLocked: locked, objects: p.objects.map((o) => (o.generator === 'room-scan' ? { ...o, locked } : o)) }
        : p)),
      ...(locked
        ? { selectedObjectIds: keep, selectedObjectId: keep[keep.length - 1] ?? null }
        : wallPart ? { selectedObjectId: wallPart.id, selectedObjectIds: [wallPart.id], editingGroupId: null, multiSelect: false } : {}),
    }));
    saveCurrentProject();
  },

  deleteBuiltIn: (groupId) => {
    const { projects, activeProjectId, pushHistoryState, saveCurrentProject } = get();
    const proj = projects.find((p) => p.id === activeProjectId);
    const group = proj?.objects.find((o) => o.id === groupId);
    if (!proj || !group?.builtIn) return;
    const id = group.builtIn.id;
    const objects = deleteCascade(proj.objects.filter((o) => o.builtInId !== id || o.parentId), [groupId]);
    set((state) => ({
      projects: state.projects.map((p) => (p.id === activeProjectId ? { ...p, objects } : p)),
      selectedObjectId: null,
      selectedObjectIds: [],
      editingGroupId: state.editingGroupId === groupId ? null : state.editingGroupId,
    }));
    pushHistoryState();
    saveCurrentProject();
  },

  createProjectFromScan: (name, room, unit = 'in') => {
    if (room.walls.length === 0) return false;
    const stamp = Date.now();
    const objects: FurnitureObject[] = roomScanParts(room).map((o, i) => ({ ...o, id: `obj_${stamp}_room_${i}` }));
    const newProj: FurnitureProject = {
      id: `proj_${stamp}`,
      name,
      createdAt: stamp,
      updatedAt: stamp,
      unit,
      objects,
      snapSettings: defaultSnapSettings(),
      showFloor: true,
      floorOpacity: 0.4,
      viewStyle: savedAppStyle(),
      scannedRoom: room,
    };
    set((state) => ({
      projects: [...state.projects, newProj],
      activeProjectId: newProj.id,
      selectedObjectId: null,
      selectedObjectIds: [],
      editingGroupId: null,
      multiSelect: false,
      historyStack: [seedHistory(objects)],
      historyIndex: 0,
    }));
    get().saveCurrentProject();
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

    // Floor on: resizing keeps a resting part's bottom fixed (grows up) and nothing dips below the floor.
    const floorOn = proj.showFloor && proj.snapSettings.floorCollision !== false && existingObj.generator !== 'room-scan';
    if (floorOn && existingObj.shape !== 'group' && (updates.dimensions || updates.rotation) && !updates.position) {
      const after = { ...existingObj, ...updates } as FurnitureObject;
      const y = floorSafeY(existingObj, after);
      if (Math.abs(y - existingObj.position.y) > 1e-6) updates = { ...updates, position: { ...existingObj.position, y } };
    }
    if (floorOn && existingObj.shape === 'group' && updates.position) {
      const dy = floorSafeDy(leavesOf(proj.objects, id), updates.position.y - existingObj.position.y);
      updates = { ...updates, position: { ...updates.position, y: existingObj.position.y + dy } };
    }

    // Wall-fitted built-ins slide along their wall, flush and on the floor; no free rotation.
    const fittedWall = existingObj.builtIn?.wallId
      ? proj.scannedRoom?.walls.find((w) => w.id === existingObj.builtIn!.wallId)
      : undefined;
    if (fittedWall && existingObj.builtIn && !existingObj.parentId && (updates.position || updates.rotation)) {
      const { rotation: _ignored, ...rest } = updates;
      void _ignored;
      updates = rest;
      if (updates.position) {
        const slid = slideAlongWall(existingObj, fittedWall, updates.position);
        updates = { ...updates, position: slid.position, builtIn: { ...existingObj.builtIn, center: slid.center } };
      }
    }

    // Holes and notches keep their distance from their anchored edge.
    if (updates.dimensions && !('holes' in updates) && !('board' in updates)) {
      updates = { ...updates, ...reanchorUpdate(existingObj, updates.dimensions) };
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
      const below = new Set(moveSet(proj.objects, id));
      below.delete(id);
      updatedObjects = updatedObjects.map((object) => {
        if (!below.has(object.id)) return object;
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

    // A member changed shape or place: its group boxes follow.
    if (existingObj.parentId && (updates.position || updates.rotation || updates.dimensions)) {
      updatedObjects = refitGroups(updatedObjects, [existingObj.parentId]);
    }

    const roomEdit = existingObj.generator === 'room-scan';
    set(state => ({
      projects: state.projects.map(p =>
        p.id === activeProjectId ? (roomEdit ? withRoomSync(p, updatedObjects) : { ...p, objects: updatedObjects }) : p
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
    // Deleting a group deletes everything inside it.
    const updatedObjects = deleteCascade(proj.objects, [id]);

    const remaining = get().selectedObjectIds.filter(
      (item) => item !== id && updatedObjects.some((object) => object.id === item)
    );
    // Never fall back onto a locked scanned wall (it couldn't be acted on).
    const nextSelected = remaining[remaining.length - 1]
      ?? updatedObjects.find((o) => !(o.generator === 'room-scan' && proj.roomLocked !== false))?.id
      ?? null;

    set(state => ({
      projects: state.projects.map(p =>
        p.id === activeProjectId ? (target?.generator === 'room-scan' ? withRoomSync(p, updatedObjects) : { ...p, objects: updatedObjects }) : p
      ),
      selectedObjectId: nextSelected,
      selectedObjectIds: nextSelected ? (remaining.length ? remaining : [nextSelected]) : [],
      editingGroupId: state.editingGroupId && updatedObjects.some((o) => o.id === state.editingGroupId) ? state.editingGroupId : null,
    }));

    pushHistoryState();
    saveCurrentProject();
  },

  duplicateObject: (id: string) => {
    const { projects, activeProjectId, pushHistoryState, saveCurrentProject } = get();
    const proj = projects.find(p => p.id === activeProjectId);
    if (!proj || !proj.objects.some((o) => o.id === id)) return;
    const result = deepDuplicate(proj.objects, [id]);
    const dupId = result.topIds[0];
    set(state => ({
      projects: state.projects.map(p => (p.id === activeProjectId ? { ...p, objects: result.objects } : p)),
      selectedObjectId: dupId,
      selectedObjectIds: [dupId],
    }));
    pushHistoryState();
    saveCurrentProject();
  },

  setGizmoMode: (mode) => set({ activeGizmoMode: mode }),

  toggleDimensions: () => set((state) => ({ showDimensions: !state.showDimensions })),

  pushHistoryState: () => {
    const { projects, activeProjectId, historyStack, historyIndex, saveCurrentProject } = get();
    const proj = projects.find(p => p.id === activeProjectId);
    if (!proj) return;
    const snapshot = JSON.stringify(proj.objects);
    const jointsNow = JSON.stringify(proj.joints ?? []);
    const top = historyStack[historyIndex];
    // A gesture that changed nothing (tap on a handle, no-op edit) is not an undo step.
    if (top && JSON.stringify(top) === snapshot && JSON.stringify(jointSnaps.get(top) ?? []) === jointsNow) return;

    const newHistory = historyStack.slice(0, historyIndex + 1);
    const entry: FurnitureObject[] = JSON.parse(snapshot);
    jointSnaps.set(entry, JSON.parse(jointsNow));
    newHistory.push(entry);
    while (newHistory.length > HISTORY_LIMIT) newHistory.shift();

    set({
      historyStack: newHistory,
      historyIndex: newHistory.length - 1
    });
    saveCurrentProject();
  },

  undo: () => {
    const { historyIndex } = get();
    if (historyIndex > 0) restoreHistory(historyIndex - 1);
  },

  redo: () => {
    const { historyIndex, historyStack } = get();
    if (historyIndex < historyStack.length - 1) restoreHistory(historyIndex + 1);
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

  setViewStyle: (style) => {
    const { activeProjectId, saveCurrentProject } = get();
    if (!isViewStyle(style)) return;
    set((state) => ({ projects: state.projects.map((p) => (p.id === activeProjectId ? { ...p, viewStyle: style } : p)) }));
    // saveCurrentProject bumps updatedAt, so the change syncs like other project fields.
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
};
});
