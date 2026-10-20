import { shapeLabel } from '../catalog/shapeCatalog';
import type { FurnitureProject } from '../types/furniture';
import { buildSharePayload } from './share';
import { unitScale } from './units';
import { jointHardware, jointNotes } from '../joinery/joints';
export type { HardwareItem } from '../joinery/joints';

export interface CutListItem {
  id: string;
  name: string;
  shape: string;
  length: string;
  width: string;
  height: string;
  material: string;
  quantity: number;
  /** Joinery on this part, e.g. 'dado 3/4 x 1/4 @ 12"'. */
  notes?: string;
}

const BOX_SHAPES = new Set(['board', 'cube', 'cushion', 'bevel_top', 'wedge']);

/** Stored inches shown in the project unit: clean decimals (0.75, 23.25, 19.05 cm). */
export function formatCutSize(inches: number, unit: FurnitureProject['unit']): string {
  const v = inches * unitScale(unit);
  const digits = unit === 'mm' ? 0 : unit === 'ft' ? 3 : unit === 'cm' ? 1 : 3;
  const n = Number(v.toFixed(digits));
  return `${n} ${unit}`;
}

/**
 * Stock to cut: every visible part (boards, sheets, blocks; parts inside
 * nested groups included, groups themselves skipped), excluding scanned room
 * and reference parts. Box parts are listed as length × width × thickness
 * (largest to smallest, so a board lying flat or standing on edge merges).
 * Identical parts merge with a quantity; sorted by material, then size.
 */
export function generateCutList(project: FurnitureProject): CutListItem[] {
  const map = new Map<string, CutListItem & { sortKey: number[] }>();
  const unit = project.unit;
  const notesById = jointNotes(project);

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
    const notes = (notesById.get(obj.id) ?? []).join('; ');
    const key = `${obj.shape}_${a}_${b}_${c}_${materialName}_${notes}`;

    const existing = map.get(key);
    if (existing) {
      existing.quantity += 1;
    } else {
      map.set(key, {
        id: obj.id,
        name: obj.name,
        shape: shapeLabel(obj.shape),
        length: formatCutSize(a, unit),
        width: formatCutSize(b, unit),
        height: formatCutSize(c, unit),
        material: materialName,
        quantity: 1,
        ...(notes ? { notes } : {}),
        sortKey: [a, b, c],
      });
    }
  }

  return Array.from(map.values())
    .sort((x, y) => x.material.localeCompare(y.material) || y.sortKey[2] - x.sortKey[2] || y.sortKey[0] - x.sortKey[0] || y.sortKey[1] - x.sortKey[1])
    .map(({ sortKey: _s, ...item }) => item);
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

export function downloadFile(filename: string, content: string, contentType: string) {
  const blob = new Blob([content], { type: contentType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function exportCutListCSV(project: FurnitureProject) {
  const items = generateCutList(project);
  const q = (t: string) => `"${t.replace(/"/g, '""')}"`;
  let csv = 'Name,Shape,Length,Width,Thickness,Material,Quantity,Joinery\n';
  for (const item of items) {
    csv += `${q(item.name)},${q(item.shape)},${q(item.length)},${q(item.width)},${q(item.height)},${q(item.material)},${item.quantity},${q(item.notes ?? '')}\n`;
  }
  const hardware = jointHardware(project);
  if (hardware.length) {
    csv += '\nHardware,,,,,,Quantity\n';
    for (const h of hardware) csv += `${q(h.name)},,,,,,${h.quantity}\n`;
  }

  downloadFile(`${project.name.toLowerCase().replace(/\s+/g, '_')}_cut_list.csv`, csv, 'text/csv');
}

export function exportProjectJSON(project: FurnitureProject) {
  const json = JSON.stringify(buildSharePayload(project), null, 2);
  downloadFile(
    `${project.name.toLowerCase().replace(/\s+/g, '_')}.json`,
    json,
    'application/json'
  );
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

export function importProjectFromJSON(jsonString: string): FurnitureProject | null {
  try {
    const parsed = JSON.parse(jsonString);

    // Support both wrapped format { project: ... } and raw project
    const projectData = parsed.project || parsed;

    // Validate required fields
    if (
      !projectData.name ||
      !Array.isArray(projectData.objects) ||
      !projectData.snapSettings
    ) {
      console.warn('Invalid project JSON: missing required fields');
      return null;
    }

    // Re-generate ID to avoid conflicts
    const imported: FurnitureProject = {
      id: `proj_${Date.now()}`,
      name: `${projectData.name} (Imported)`,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      unit: projectData.unit || 'in',
      objects: (projectData.objects || []).map((obj: any) => ({
        ...obj,
        id: `obj_${Date.now()}_${Math.random().toString(36).substring(2, 5)}`
      })),
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
      // Keeps the exported style; older files without one get the style for new projects on import.
      ...(projectData.viewStyle === 'clean' || projectData.viewStyle === 'realistic' ? { viewStyle: projectData.viewStyle } : {}),
    };

    return imported;
  } catch (err) {
    console.warn('Failed to parse project JSON:', err);
    return null;
  }
}

