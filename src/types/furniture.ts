export type ShapeType =
  | 'cube'
  | 'cylinder'
  | 'sphere'
  | 'wedge'
  | 'bevel_top'
  | 'pole'
  | 'cushion';

export type WoodSpecies =
  | 'oak'
  | 'walnut'
  | 'mahogany'
  | 'pine'
  | 'teak'
  | 'cherry'
  | 'ebony'
  | 'birch'
  | 'custom_paint'
  | 'metal_accent';

export interface WoodMaterial {
  id: WoodSpecies;
  name: string;
  species: WoodSpecies;
  baseColor: string;
  secondaryColor: string;
  grainIntensity: number; // 0 to 1
  grainScale: number; // 1 to 10
  roughness: number; // 0 to 1
  metalness: number; // 0 to 1
  stainColor?: string; // Hex color for stain overlay
  stainOpacity?: number; // 0 to 1
  varnishSheen: 'matte' | 'satin' | 'glossy';
}

export interface Dimensions3D {
  length: number; // Inches along X
  width: number;  // Inches along Z
  height: number; // Inches along Y
}

export interface Position3D {
  x: number;
  y: number;
  z: number;
}

export interface Rotation3D {
  x: number; // Degrees
  y: number;
  z: number;
}

export interface FurnitureObject {
  id: string;
  name: string;
  shape: ShapeType;
  dimensions: Dimensions3D; // in inches (or active unit)
  position: Position3D;
  rotation: Rotation3D;
  material: WoodMaterial;
  locked?: boolean;
  visible?: boolean;
  parentId?: string; // For grouped assemblies
}

export interface SnapSettings {
  enabled: boolean;
  faceSnap: boolean;
  gridSnap: boolean;
  gridSize: number; // Inches, e.g. 0.5, 1.0
  floorCollision: boolean; // Enables floor barrier at y >= 0
}

export interface FurnitureProject {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  unit: 'in' | 'cm' | 'mm';
  objects: FurnitureObject[];
  snapSettings: SnapSettings;
  showFloor: boolean;
  floorOpacity: number;
  backgroundColor?: string;
}

export interface PresetTemplate {
  id: string;
  name: string;
  description: string;
  category: 'Tables' | 'Chairs' | 'Storage' | 'Seating';
  objects: Omit<FurnitureObject, 'id'>[];
}
