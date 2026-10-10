export type ShapeType =
  | 'cube'
  | 'cylinder'
  | 'sphere'
  | 'wedge'
  | 'bevel_top'
  | 'pole'
  | 'cushion'
  | 'board'
  | 'group';

export type LengthUnit = 'in' | 'cm' | 'mm' | 'ft';

export type RoutedEdge = 'none' | 'roundover' | 'chamfer';

export type HoleFace = 'top' | 'front' | 'side';

export interface BoardHole {
  id: string;
  /**
   * Horizontal offset from the face center (inches). Top face: along length (X).
   * Front face: along length (X). Side face: along width (Z).
   */
  x: number;
  /**
   * Second offset from the face center (inches). Top face: along width (Z).
   * Front/side faces: up (Y).
   */
  z: number;
  /** Round: diameter. Rectangular: width (along x). */
  diameter: number;
  /** Default 'top' (the board's broad face). */
  face?: HoleFace;
  /** Depth into the part; absent = through. */
  depth?: number;
  /** Default 'round'. */
  kind?: 'round' | 'rect';
  /** Rectangular holes: size along z. */
  height?: number;
}

export interface BoardOptions {
  cornerRadius: number;
  holes: BoardHole[];
  edge: RoutedEdge;
}

export type WoodSpecies =
  | 'oak'
  | 'walnut'
  | 'mahogany'
  | 'pine'
  | 'teak'
  | 'cherry'
  | 'ebony'
  | 'birch'
  | 'plywood'
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
  parentId?: string;
  board?: BoardOptions;
  /** Holes on non-board box parts (boards keep theirs in board.holes). */
  holes?: BoardHole[];
  /** Set on parts made by a generator (e.g. "media-wall") so re-runs can replace them. */
  generator?: string;
  /** Reference geometry (scanned room, reference wall): not stock, skipped by the cut list. */
  reference?: boolean;
  /** On a built-in's group: what made it and where it sits, so it can be edited/regenerated. */
  builtIn?: BuiltInInfo;
  /** On a built-in's parts: the instance they belong to. */
  builtInId?: string;
  /** On room-scan parts: the scanned wall id (walls and their openings). */
  wallId?: string;
  /** On room-scan opening parts: the scanned opening id. */
  openingId?: string;
}

export type BuiltInTemplateId = 'media-wall';

export interface BuiltInInfo {
  id: string;
  template: BuiltInTemplateId;
  /** Scanned wall it is fitted to; absent for free-standing/manual built-ins. */
  wallId?: string;
  /** Wall-local x of the built-in's center (inches from wall center). */
  center?: number;
  /** Template form values (template-specific). */
  input: Record<string, number | string>;
}

export interface SnapSettings {
  enabled: boolean;
  faceSnap: boolean;
  gridSnap: boolean;
  gridSize: number; // Inches, e.g. 0.5, 1.0
  floorCollision: boolean; // Enables floor barrier at y >= 0
}

export interface ScannedOpening {
  id: string;
  kind: 'window' | 'door' | 'opening';
  width: number;
  height: number;
  /** Inches from the wall's left edge to the opening's left edge. */
  offsetX: number;
  /** Inches from the floor to the opening's bottom. */
  bottom: number;
}

/** One wall from a LiDAR scan, in inches. Kept small so it syncs with the project. */
export interface ScannedWall {
  id: string;
  label: string;
  width: number;
  height: number;
  openings: ScannedOpening[];
}

/** A scanned wall placed in the room: (x, z) is the center of its interior face, yaw (deg) turns local +z into the room. */
export interface RoomWall extends ScannedWall {
  x: number;
  z: number;
  yaw: number;
}

export interface ScannedRoom {
  walls: RoomWall[];
}

export interface FurnitureProject {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  unit: LengthUnit;
  objects: FurnitureObject[];
  snapSettings: SnapSettings;
  showFloor: boolean;
  floorOpacity: number;
  backgroundColor?: string;
  /** Compact LiDAR room scan (walls + openings, inches). */
  scannedRoom?: ScannedRoom;
  /** Scanned walls are locked (not selectable) unless this is explicitly false. */
  roomLocked?: boolean;
}

export type TemplateCategory = 'Blocks' | 'Boards' | 'Rounds' | 'Layouts';

export interface PresetTemplate {
  id: string;
  name: string;
  description: string;
  category: TemplateCategory;
  /** Included in the on-device Community featured list. */
  featured?: boolean;
  author?: string;
  objects: Omit<FurnitureObject, 'id'>[];
}
