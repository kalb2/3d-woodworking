import { shapeLabel } from '../catalog/shapeCatalog';
import type { FurnitureObject, FurnitureProject, WoodSpecies } from '../types/furniture';
import { buildSharePayload } from './share';
import { formatSmallLen } from './lengthFormat';
import {
  LUMBER_WASTE, formatBoardFeet, lumberBoardFeet, lumberStock, nestSheets, sheetHasGrain, stockKind,
  type SheetNest, type StockKind,
} from './stock';
import { jointHardware, jointNotes, type HardwareItem } from '../joinery/joints';
import { builtInHardware } from '../builtins/builtIns';
import { saveFile, type SaveResult } from '../native/fileExport';
export type { HardwareItem } from '../joinery/joints';

export interface CutListItem {
  id: string;
  name: string;
  shape: string;
  /** Along the grain (the part's longest side, the way grain is drawn). */
  length: string;
  width: string;
  height: string;
  material: string;
  quantity: number;
  /** Joinery and shaping on this part, e.g. 'dado 3/4 x 1/4 @ 12"; 2 holes'. */
  notes?: string;
  /** Finished size in inches (length along the grain, width, thickness). */
  lengthIn: number;
  widthIn: number;
  thicknessIn: number;
  /** How it's bought: sheet goods, lumber, or other (metal). */
  kind: StockKind;
  species?: WoodSpecies;
  /** Top-level assemblies the parts sit in, e.g. 'Base cabinet ×2, Bookshelf'. */
  usedIn?: string;
}

const BOX_SHAPES = new Set(['board', 'cube', 'cushion', 'bevel_top', 'wedge']);

/** A cut size as the shop reads it: inches to 1/16 (23 5/8", also for feet projects), else mm / cm. */
export function formatCutSize(inches: number, unit: FurnitureProject['unit']): string {
  return formatSmallLen(inches, unit);
}

/** Shaping the shop needs to know about: rounded corners, routed edges, holes. */
function shapingNotes(obj: FurnitureObject, unit: FurnitureProject['unit']): string[] {
  const out: string[] = [];
  const b = obj.board;
  if (b?.cornerRadius && b.cornerRadius > 0) out.push(`${formatSmallLen(b.cornerRadius, unit)} radius corners`);
  if (b?.edge && b.edge !== 'none') out.push(`${b.edge} edges${b.edgeSize ? ` ${formatSmallLen(b.edgeSize, unit)}` : ''}`);
  const holes = (b?.holes ?? obj.holes ?? []).length;
  if (holes) out.push(holes === 1 ? '1 hole' : `${holes} holes`);
  return out;
}

/** The outermost group a part sits in (its assembly), if any. */
function assemblyName(obj: FurnitureObject, byId: Map<string, FurnitureObject>): string | undefined {
  let top: FurnitureObject | undefined;
  let cur = obj.parentId ? byId.get(obj.parentId) : undefined;
  for (let guard = 0; cur && guard < 64; guard++) {
    top = cur;
    cur = cur.parentId ? byId.get(cur.parentId) : undefined;
  }
  return top?.name;
}

/**
 * Stock to cut: every visible part (boards, sheets, blocks; parts inside
 * nested groups included, groups themselves skipped), excluding scanned room
 * and reference parts. Sizes are the parts' true finished sizes, so joinery
 * is already in them (a shelf set in a dado is drawn, and listed, long enough
 * to reach the bottom of the groove). Box parts are listed as length (with
 * the grain, the longest side) × width × thickness, so a board lying flat or
 * standing on edge merges. Identical parts merge with a quantity; sorted by
 * material, then thickness, then size.
 */
export function generateCutList(project: FurnitureProject): CutListItem[] {
  const map = new Map<string, CutListItem & { sortKey: number[]; uses: Map<string, number> }>();
  const unit = project.unit;
  const notesById = jointNotes(project);
  const byId = new Map(project.objects.map((o) => [o.id, o]));

  for (const obj of project.objects) {
    if (obj.visible === false) continue;
    if (obj.shape === 'group') continue; // a group is a container, not stock
    if (obj.reference || obj.generator === 'room-scan') continue; // scanned room / reference walls

    const d = obj.dimensions;
    const r4 = (n: number) => Math.round(n * 10000) / 10000;
    const [a, b, c] = BOX_SHAPES.has(obj.shape)
      ? [d.length, d.width, d.height].map(r4).sort((x, y) => y - x)
      : [d.length, d.width, d.height].map(r4);
    const materialName = obj.material?.name ?? 'Unknown';
    const notes = [...(notesById.get(obj.id) ?? []), ...shapingNotes(obj, unit)].join('; ');
    const key = `${obj.shape}_${a}_${b}_${c}_${materialName}_${notes}`;
    const assembly = assemblyName(obj, byId);

    let row = map.get(key);
    if (row) {
      row.quantity += 1;
    } else {
      const [ls, ws, ts] = BOX_SHAPES.has(obj.shape) ? [a, b, c] : [a, b, c].sort((x, y) => y - x);
      row = {
        id: obj.id,
        name: obj.name,
        shape: shapeLabel(obj.shape),
        length: formatCutSize(a, unit),
        width: formatCutSize(b, unit),
        height: formatCutSize(c, unit),
        material: materialName,
        quantity: 1,
        ...(notes ? { notes } : {}),
        lengthIn: ls,
        widthIn: ws,
        thicknessIn: ts,
        kind: stockKind(obj.material, ts),
        ...(obj.material?.species ? { species: obj.material.species } : {}),
        sortKey: [a, b, c],
        uses: new Map(),
      };
      map.set(key, row);
    }
    if (assembly) row.uses.set(assembly, (row.uses.get(assembly) ?? 0) + 1);
  }

  return Array.from(map.values())
    .sort((x, y) => x.material.localeCompare(y.material) || y.thicknessIn - x.thicknessIn || y.sortKey[0] - x.sortKey[0] || y.sortKey[1] - x.sortKey[1] || y.sortKey[2] - x.sortKey[2])
    .map(({ sortKey: _s, uses, ...item }) => {
      const usedIn = [...uses].map(([n, q]) => (q > 1 ? `${n} ×${q}` : n)).join(', ');
      return usedIn ? { ...item, usedIn } : item;
    });
}

/** Cut list rows grouped by material, in list order. */
export function cutListByMaterial(items: CutListItem[]): { material: string; items: CutListItem[] }[] {
  const out: { material: string; items: CutListItem[] }[] = [];
  for (const it of items) {
    const last = out[out.length - 1];
    if (last && last.material === it.material) last.items.push(it);
    else out.push({ material: it.material, items: [it] });
  }
  return out;
}

export interface CutListSection {
  /** 'Plywood · 3/4"' for sheet goods (one sheet thickness each), else the material. */
  title: string;
  kind: StockKind;
  items: CutListItem[];
  pieces: number;
  /** Sheet goods: 4×8 sheets nested. */
  sheets?: SheetNest;
  /** Lumber: rough board feet before waste. */
  boardFeet?: number;
  /** What to buy, e.g. '2 sheets (4×8) · 71% used' or '6.2 bd ft · buy 7.1 with 15% waste'. */
  summary: string;
}

/** One lumber row's board feet (one piece): nominal for dimensional lumber, else rough thickness. */
const itemBoardFeet = (it: CutListItem) => lumberBoardFeet({ species: it.species }, it.lengthIn, it.widthIn, it.thicknessIn);

/** Cut list rows as buying sections: each sheet material + thickness, each lumber species, then other. */
export function cutListSections(items: CutListItem[], unit: FurnitureProject['unit']): CutListSection[] {
  const sections: CutListSection[] = [];
  for (const it of items) {
    const title = it.kind === 'sheet' ? `${it.material} · ${formatCutSize(it.thicknessIn, unit)}` : it.material;
    const last = sections[sections.length - 1];
    if (last && last.title === title && last.kind === it.kind) last.items.push(it);
    else sections.push({ title, kind: it.kind, items: [it], pieces: 0, summary: '' });
  }
  for (const s of sections) {
    s.pieces = s.items.reduce((n, it) => n + it.quantity, 0);
    if (s.kind === 'sheet') {
      const nest = nestSheets(
        s.items.map((it) => ({ length: it.lengthIn, width: it.widthIn, quantity: it.quantity })),
        sheetHasGrain({ species: s.items[0].species ?? 'plywood' }),
      );
      s.sheets = nest;
      const parts = [`${nest.sheets} ${nest.sheets === 1 ? 'sheet' : 'sheets'} (4×8)`];
      if (nest.sheets) parts.push(`${Math.round(nest.yield * 100)}% used`);
      if (nest.oversize) parts.push(`${nest.oversize} ${nest.oversize === 1 ? 'part is' : 'parts are'} bigger than a sheet`);
      s.summary = parts.join(' · ');
    } else if (s.kind === 'lumber') {
      const bf = s.items.reduce((n, it) => n + it.quantity * itemBoardFeet(it), 0);
      s.boardFeet = bf;
      const stock = new Map(s.items.map((it) => { const st = lumberStock({ species: it.species }, it.widthIn, it.thicknessIn); return [st.label, st.order] as const; }));
      const labels = [...stock].sort((x, y) => x[1] - y[1]).map(([label]) => label);
      s.summary = `${formatBoardFeet(bf)} bd ft of ${labels.join(', ')} · buy ${formatBoardFeet(bf * (1 + LUMBER_WASTE))} with ${Math.round(LUMBER_WASTE * 100)}% waste`;
    }
  }
  return sections;
}

/** Everything to buy besides stock: joint screws/dowels plus template hinges, slides, shelf pins and pulls. */
export function projectHardware(project: Pick<FurnitureProject, 'objects' | 'joints'>): HardwareItem[] {
  const tally = new Map<string, number>();
  for (const h of [...jointHardware(project), ...builtInHardware(project.objects)]) tally.set(h.name, (tally.get(h.name) ?? 0) + h.quantity);
  return [...tally].map(([name, quantity]) => ({ name, quantity })).sort((a, b) => a.name.localeCompare(b.name));
}

export function downloadFile(filename: string, content: string, contentType: string) {
  // Share sheet + Files on iOS (a WebView can't download), a download on the web.
  return saveFile(filename, content, contentType);
}

/** The cut list as CSV: parts (with board feet for lumber), a buying summary per section, then hardware. */
export function cutListCSV(project: FurnitureProject): string {
  const items = generateCutList(project);
  const q = (t: string) => `"${t.replace(/"/g, '""')}"`;
  let csv = 'Name,Shape,Length (grain),Width,Thickness,Material,Stock,Quantity,Board feet,Notes,Used in\n';
  for (const item of items) {
    const bf = item.kind === 'lumber' ? formatBoardFeet(item.quantity * itemBoardFeet(item)) : '';
    const stock = item.kind === 'sheet' ? 'Sheet' : item.kind === 'lumber' ? 'Lumber' : 'Other';
    csv += `${q(item.name)},${q(item.shape)},${q(item.length)},${q(item.width)},${q(item.height)},${q(item.material)},${stock},${item.quantity},${bf},${q(item.notes ?? '')},${q(item.usedIn ?? '')}\n`;
  }
  const buy = cutListSections(items, project.unit).filter((s) => s.summary);
  if (buy.length) {
    csv += '\nBuy,What\n';
    for (const s of buy) csv += `${q(s.title)},${q(s.summary)}\n`;
  }
  const hardware = projectHardware(project);
  if (hardware.length) {
    csv += '\nHardware,Quantity\n';
    for (const h of hardware) csv += `${q(h.name)},${h.quantity}\n`;
  }
  return csv;
}

export function exportCutListCSV(project: FurnitureProject) {
  downloadFile(`${project.name.toLowerCase().replace(/\s+/g, '_')}_cut_list.csv`, cutListCSV(project), 'text/csv');
}

/** The project as a .json file (share sheet + Files on iOS, a download on the web). */
export function exportProjectJSON(project: FurnitureProject): Promise<SaveResult> {
  const json = JSON.stringify(buildSharePayload(project), null, 2);
  return saveFile(`${project.name.trim() || 'Project'}.json`, json, 'application/json', { title: project.name });
}

export async function copyProjectToClipboard(project: FurnitureProject): Promise<boolean> {
  const json = JSON.stringify(buildSharePayload(project), null, 2);

  try {
    await navigator.clipboard.writeText(json);
    return true;
  } catch {
    // Fallback for environments where clipboard API is unavailable
    const textarea = document.createElement('textarea');
    textarea.value = json;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    try {
      document.execCommand('copy');
      document.body.removeChild(textarea);
      return true;
    } catch {
      document.body.removeChild(textarea);
      return false;
    }
  }
}

let importSeq = 0;
const freshId = (prefix: string) => `${prefix}_${Date.now()}_${(importSeq++).toString(36)}${Math.random().toString(36).substring(2, 5)}`;

/**
 * A project from a file as a new project here: fresh project and part ids
 * (so it never collides with what's on this device), with groups, joints,
 * measurements and the scanned room kept and re-linked to the new ids.
 * `keepIds` (restoring a backup onto a device that doesn't have it) keeps
 * the original ids and dates instead.
 * Returns null when it isn't a Workbench project.
 */
export function importProjectData(projectData: any, options: { suffix?: string; keepIds?: boolean } = {}): FurnitureProject | null {
  if (!projectData || !projectData.name || !Array.isArray(projectData.objects) || !projectData.snapSettings) return null;

  const idMap = new Map<string, string>();
  const fresh = (projectData.objects as any[]).map((obj) => {
    const id = options.keepIds && typeof obj.id === 'string' ? obj.id : freshId('obj');
    if (typeof obj.id === 'string') idMap.set(obj.id, id);
    return { ...obj, id };
  });
  const objects = fresh.map((obj) => {
    if (!obj.parentId) return obj;
    const parentId = idMap.get(obj.parentId);
    if (parentId) return { ...obj, parentId };
    const { parentId: _gone, ...rest } = obj;
    return rest;
  });
  const joints = Array.isArray(projectData.joints)
    ? (projectData.joints as any[])
      .filter((j) => idMap.has(j.receiverId) && idMap.has(j.materId))
      .map((j) => ({ ...j, receiverId: idMap.get(j.receiverId)!, materId: idMap.get(j.materId)! }))
    : [];

  const keep = !!options.keepIds && typeof projectData.id === 'string';
  const suffix = options.suffix ?? (keep ? '' : ' (Imported)');
  return {
    id: keep ? projectData.id : freshId('proj'),
    name: `${projectData.name}${suffix}`,
    createdAt: keep && typeof projectData.createdAt === 'number' ? projectData.createdAt : Date.now(),
    updatedAt: keep && typeof projectData.updatedAt === 'number' ? projectData.updatedAt : Date.now(),
    unit: projectData.unit || 'in',
    objects,
    snapSettings: projectData.snapSettings || {
      enabled: true,
      faceSnap: true,
      gridSnap: true,
      gridSize: 0.5,
      floorCollision: true
    },
    showFloor: projectData.showFloor ?? true,
    floorOpacity: projectData.floorOpacity ?? 0.4,
    backgroundColor: projectData.backgroundColor,
    ...(joints.length ? { joints } : {}),
    ...(Array.isArray(projectData.measurements) && projectData.measurements.length ? { measurements: projectData.measurements } : {}),
    ...(projectData.scannedRoom ? { scannedRoom: projectData.scannedRoom } : {}),
    ...(typeof projectData.roomLocked === 'boolean' ? { roomLocked: projectData.roomLocked } : {}),
    // Keeps the exported style; older files without one get the style for new projects on import.
    ...(projectData.viewStyle === 'clean' || projectData.viewStyle === 'realistic' ? { viewStyle: projectData.viewStyle } : {}),
  };
}

export function importProjectFromJSON(jsonString: string): FurnitureProject | null {
  try {
    const parsed = JSON.parse(jsonString);
    // Support both wrapped format { project: ... } and raw project
    const imported = importProjectData(parsed?.project || parsed);
    if (!imported) console.warn('Invalid project JSON: missing required fields');
    return imported;
  } catch (err) {
    console.warn('Failed to parse project JSON:', err);
    return null;
  }
}
