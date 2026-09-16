import { create } from 'zustand';
import type { FurnitureObject, FurnitureProject, ShapeType, SnapSettings, WoodMaterial } from '../types/furniture';
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
    description: '96" × 48" × 0.5" — Thinner MDF for panels',
    dimensions: { length: 96, width: 48, height: 0.5 },
    material: PRESET_WOOD_MATERIALS.custom_paint,
    shape: 'cube'
  }
];

const LOCAL_STORAGE_KEY = 'ipad_3d_furniture_projects_v1';
const LIGHT_STARTING_WOOD = PRESET_WOOD_MATERIALS.birch;

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

const createInitialProject = (): FurnitureProject => ({
  id: 'proj_default',
  name: 'Living Room Coffee Table',
  createdAt: Date.now(),
  updatedAt: Date.now(),
  unit: 'in',
  objects: [
    {
      id: 'tabletop_1',
      name: 'Table Top',
      shape: 'bevel_top',
      dimensions: { length: 48, width: 24, height: 1.5 },
      position: { x: 0, y: 18, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
      material: LIGHT_STARTING_WOOD,
      visible: true
    },
    {
      id: 'leg_1',
      name: 'Front Left Leg',
      shape: 'cylinder',
      dimensions: { length: 2, width: 2, height: 17.25 },
      position: { x: -22, y: 8.625, z: -10 },
      rotation: { x: 0, y: 0, z: 0 },
      material: PRESET_WOOD_MATERIALS.metal_accent,
      visible: true
    },
    {
      id: 'leg_2',
      name: 'Front Right Leg',
      shape: 'cylinder',
      dimensions: { length: 2, width: 2, height: 17.25 },
      position: { x: 22, y: 8.625, z: -10 },
      rotation: { x: 0, y: 0, z: 0 },
      material: PRESET_WOOD_MATERIALS.metal_accent,
      visible: true
    },
    {
      id: 'leg_3',
      name: 'Back Left Leg',
      shape: 'cylinder',
      dimensions: { length: 2, width: 2, height: 17.25 },
      position: { x: -22, y: 8.625, z: 10 },
      rotation: { x: 0, y: 0, z: 0 },
      material: PRESET_WOOD_MATERIALS.metal_accent,
      visible: true
    },
    {
      id: 'leg_4',
      name: 'Back Right Leg',
      shape: 'cylinder',
      dimensions: { length: 2, width: 2, height: 17.25 },
      position: { x: 22, y: 8.625, z: 10 },
      rotation: { x: 0, y: 0, z: 0 },
      material: PRESET_WOOD_MATERIALS.metal_accent,
      visible: true
    }
  ],
  snapSettings: {
    enabled: true,
    faceSnap: true,
    gridSnap: true,
    gridSize: 0.5,
    floorCollision: true
  },
  showFloor: true,
  floorOpacity: 0.4
});

interface ProjectState {
  projects: FurnitureProject[];
  activeProjectId: string;
  selectedObjectId: string | null;
  activeGizmoMode: 'move' | 'resize' | 'rotate';
  showDimensions: boolean;

  historyStack: FurnitureObject[][];
  historyIndex: number;

  loadProjects: () => void;
  saveCurrentProject: () => void;
  createProject: (name: string) => void;
  renameProject: (id: string, newName: string) => void;
  duplicateProject: (id: string) => void;
  deleteProject: (id: string) => void;
  switchProject: (id: string) => void;
  importProject: (project: FurnitureProject) => void;

  selectObject: (id: string | null) => void;
  addObject: (shape: ShapeType, name?: string) => void;
  addWoodPreset: (presetId: string) => void;
  addPresetTemplate: (templateType: 'table' | 'chair' | 'bookshelf' | 'desk' | 'sofa') => void;
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
  setUnit: (unit: 'in' | 'cm' | 'mm') => void;
}

export const useProjectStore = create<ProjectState>((set, get) => ({
  projects: [createInitialProject()],
  activeProjectId: 'proj_default',
  selectedObjectId: 'tabletop_1',
  activeGizmoMode: 'move',
  showDimensions: true,
  historyStack: [[...createInitialProject().objects]],
  historyIndex: 0,

  loadProjects: () => {
    try {
      const saved = localStorage.getItem(LOCAL_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          const projects = withLightStartingWood(parsed);
          set({
            projects,
            activeProjectId: projects[0].id,
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
    } catch (err) {
      console.warn('Failed to auto-save project:', err);
    }
  },

  createProject: (name: string) => {
    const defaultCube: FurnitureObject = {
      id: `obj_${Date.now()}_cube`,
      name: 'Starting Cube',
      shape: 'cube',
      dimensions: { length: 12, width: 12, height: 12 },
      position: { x: 0, y: 6, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
      material: LIGHT_STARTING_WOOD,
      visible: true
    };

    const newProj: FurnitureProject = {
      id: `proj_${Date.now()}`,
      name: name || 'Untitled Furniture',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      unit: 'in',
      objects: [defaultCube],
      snapSettings: {
        enabled: true,
        faceSnap: true,
        gridSnap: true,
        gridSize: 0.5,
        floorCollision: true
      },
      showFloor: true,
      floorOpacity: 0.4
    };

    set(state => ({
      projects: [...state.projects, newProj],
      activeProjectId: newProj.id,
      selectedObjectId: defaultCube.id,
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
      historyStack: [[...newActiveProj.objects]],
      historyIndex: 0
    });

    try {
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(remaining));
    } catch (e) {}
  },

  switchProject: (id: string) => {
    const proj = get().projects.find(p => p.id === id);
    if (!proj) return;

    set({
      activeProjectId: id,
      selectedObjectId: proj.objects[0]?.id || null,
      historyStack: [[...proj.objects]],
      historyIndex: 0
    });
  },

  importProject: (project: FurnitureProject) => {
    set(state => ({
      projects: [...state.projects, project],
      activeProjectId: project.id,
      selectedObjectId: project.objects[0]?.id || null,
      historyStack: [[...project.objects]],
      historyIndex: 0
    }));

    get().saveCurrentProject();
  },

  selectObject: (id: string | null) => set({ selectedObjectId: id }),

  addObject: (shape: ShapeType, customName?: string) => {
    const { projects, activeProjectId, pushHistoryState, saveCurrentProject } = get();
    const proj = projects.find(p => p.id === activeProjectId);
    if (!proj) return;

    const defaultMaterial: WoodMaterial = LIGHT_STARTING_WOOD;
    const newObj: FurnitureObject = {
      id: `obj_${Date.now()}_${Math.random().toString(36).substring(2, 5)}`,
      name: customName || `${shape.charAt(0).toUpperCase() + shape.slice(1)} Component`,
      shape,
      dimensions: { length: 12, width: 12, height: 12 },
      position: { x: 0, y: 6, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
      material: defaultMaterial,
      visible: true
    };

    const updatedObjects = [...proj.objects, newObj];

    set(state => ({
      projects: state.projects.map(p =>
        p.id === activeProjectId ? { ...p, objects: updatedObjects } : p
      ),
      selectedObjectId: newObj.id
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
      selectedObjectId: newObj.id
    }));

    pushHistoryState();
    saveCurrentProject();
  },

  addPresetTemplate: (templateType) => {
    const { projects, activeProjectId, pushHistoryState, saveCurrentProject } = get();
    const proj = projects.find(p => p.id === activeProjectId);
    if (!proj) return;

    const oak = PRESET_WOOD_MATERIALS.oak;
    const walnut = PRESET_WOOD_MATERIALS.walnut;
    const metal = PRESET_WOOD_MATERIALS.metal_accent;
    let newObjs: FurnitureObject[] = [];

    if (templateType === 'table') {
      newObjs = [
        { id: `t_${Date.now()}_top`, name: 'Table Top', shape: 'bevel_top', dimensions: { length: 60, width: 36, height: 2 }, position: { x: 0, y: 30, z: 0 }, rotation: { x: 0, y: 0, z: 0 }, material: oak, visible: true },
        { id: `t_${Date.now()}_l1`, name: 'Leg FL', shape: 'cylinder', dimensions: { length: 3, width: 3, height: 29 }, position: { x: -27, y: 14.5, z: -15 }, rotation: { x: 0, y: 0, z: 0 }, material: metal, visible: true },
        { id: `t_${Date.now()}_l2`, name: 'Leg FR', shape: 'cylinder', dimensions: { length: 3, width: 3, height: 29 }, position: { x: 27, y: 14.5, z: -15 }, rotation: { x: 0, y: 0, z: 0 }, material: metal, visible: true },
        { id: `t_${Date.now()}_l3`, name: 'Leg BL', shape: 'cylinder', dimensions: { length: 3, width: 3, height: 29 }, position: { x: -27, y: 14.5, z: 15 }, rotation: { x: 0, y: 0, z: 0 }, material: metal, visible: true },
        { id: `t_${Date.now()}_l4`, name: 'Leg BR', shape: 'cylinder', dimensions: { length: 3, width: 3, height: 29 }, position: { x: 27, y: 14.5, z: 15 }, rotation: { x: 0, y: 0, z: 0 }, material: metal, visible: true }
      ];
    } else if (templateType === 'chair') {
      newObjs = [
        { id: `c_${Date.now()}_seat`, name: 'Chair Seat', shape: 'bevel_top', dimensions: { length: 18, width: 18, height: 1.5 }, position: { x: 0, y: 18, z: 0 }, rotation: { x: 0, y: 0, z: 0 }, material: walnut, visible: true },
        { id: `c_${Date.now()}_back`, name: 'Backrest', shape: 'cube', dimensions: { length: 18, width: 1.5, height: 16 }, position: { x: 0, y: 26, z: 8 }, rotation: { x: 0, y: 0, z: 0 }, material: walnut, visible: true },
        { id: `c_${Date.now()}_l1`, name: 'Leg FL', shape: 'cylinder', dimensions: { length: 1.5, width: 1.5, height: 17.25 }, position: { x: -7.5, y: 8.625, z: -7.5 }, rotation: { x: 0, y: 0, z: 0 }, material: walnut, visible: true },
        { id: `c_${Date.now()}_l2`, name: 'Leg FR', shape: 'cylinder', dimensions: { length: 1.5, width: 1.5, height: 17.25 }, position: { x: 7.5, y: 8.625, z: -7.5 }, rotation: { x: 0, y: 0, z: 0 }, material: walnut, visible: true },
        { id: `c_${Date.now()}_l3`, name: 'Leg BL', shape: 'cylinder', dimensions: { length: 1.5, width: 1.5, height: 17.25 }, position: { x: -7.5, y: 8.625, z: 7.5 }, rotation: { x: 0, y: 0, z: 0 }, material: walnut, visible: true },
        { id: `c_${Date.now()}_l4`, name: 'Leg BR', shape: 'cylinder', dimensions: { length: 1.5, width: 1.5, height: 17.25 }, position: { x: 7.5, y: 8.625, z: 7.5 }, rotation: { x: 0, y: 0, z: 0 }, material: walnut, visible: true }
      ];
    } else if (templateType === 'bookshelf') {
      newObjs = [
        { id: `b_${Date.now()}_side1`, name: 'Left Panel', shape: 'cube', dimensions: { length: 1, width: 14, height: 60 }, position: { x: -16, y: 30, z: 0 }, rotation: { x: 0, y: 0, z: 0 }, material: oak, visible: true },
        { id: `b_${Date.now()}_side2`, name: 'Right Panel', shape: 'cube', dimensions: { length: 1, width: 14, height: 60 }, position: { x: 16, y: 30, z: 0 }, rotation: { x: 0, y: 0, z: 0 }, material: oak, visible: true },
        { id: `b_${Date.now()}_shelf1`, name: 'Bottom Shelf', shape: 'bevel_top', dimensions: { length: 31, width: 14, height: 1 }, position: { x: 0, y: 2, z: 0 }, rotation: { x: 0, y: 0, z: 0 }, material: oak, visible: true },
        { id: `b_${Date.now()}_shelf2`, name: 'Middle Shelf', shape: 'bevel_top', dimensions: { length: 31, width: 14, height: 1 }, position: { x: 0, y: 22, z: 0 }, rotation: { x: 0, y: 0, z: 0 }, material: oak, visible: true },
        { id: `b_${Date.now()}_shelf3`, name: 'Upper Shelf', shape: 'bevel_top', dimensions: { length: 31, width: 14, height: 1 }, position: { x: 0, y: 42, z: 0 }, rotation: { x: 0, y: 0, z: 0 }, material: oak, visible: true },
        { id: `b_${Date.now()}_top`, name: 'Top Panel', shape: 'bevel_top', dimensions: { length: 33, width: 15, height: 1.5 }, position: { x: 0, y: 59.25, z: 0 }, rotation: { x: 0, y: 0, z: 0 }, material: oak, visible: true }
      ];
    } else {
      newObjs = [
        { id: `m_${Date.now()}`, name: 'Base Component', shape: 'cube', dimensions: { length: 24, width: 24, height: 24 }, position: { x: 0, y: 12, z: 0 }, rotation: { x: 0, y: 0, z: 0 }, material: oak, visible: true }
      ];
    }

    const updatedObjects = [...proj.objects, ...newObjs];

    set(state => ({
      projects: state.projects.map(p =>
        p.id === activeProjectId ? { ...p, objects: updatedObjects } : p
      ),
      selectedObjectId: newObjs[0].id
    }));

    pushHistoryState();
    saveCurrentProject();
  },

  updateObject: (id: string, updates: Partial<FurnitureObject>, skipHistory = false) => {
    const { projects, activeProjectId, pushHistoryState, saveCurrentProject } = get();
    const proj = projects.find(p => p.id === activeProjectId);
    if (!proj) return;

    // Enforce floor collision if position is being updated
    if (updates.position && proj.snapSettings.floorCollision) {
      const existingObj = proj.objects.find(o => o.id === id);
      if (existingObj) {
        const objHeight = updates.dimensions?.height ?? existingObj.dimensions.height;
        const minY = objHeight / 2;
        if (updates.position.y < minY) {
          updates = { ...updates, position: { ...updates.position, y: minY } };
        }
      }
    }

    const updatedObjects = proj.objects.map(o => (o.id === id ? { ...o, ...updates } : o));

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
    const { projects, activeProjectId, selectedObjectId, pushHistoryState, saveCurrentProject } = get();
    const proj = projects.find(p => p.id === activeProjectId);
    if (!proj) return;

    const updatedObjects = proj.objects.filter(o => o.id !== id);

    set(state => ({
      projects: state.projects.map(p =>
        p.id === activeProjectId ? { ...p, objects: updatedObjects } : p
      ),
      selectedObjectId: selectedObjectId === id ? (updatedObjects[0]?.id || null) : selectedObjectId
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

    const dup: FurnitureObject = {
      ...source,
      id: `obj_${Date.now()}_${Math.random().toString(36).substring(2, 5)}`,
      name: `${source.name} Copy`,
      position: {
        x: source.position.x + 4,
        y: source.position.y,
        z: source.position.z + 4
      }
    };

    const updatedObjects = [...proj.objects, dup];

    set(state => ({
      projects: state.projects.map(p =>
        p.id === activeProjectId ? { ...p, objects: updatedObjects } : p
      ),
      selectedObjectId: dup.id
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
