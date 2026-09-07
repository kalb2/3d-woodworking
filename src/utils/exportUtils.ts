import type { FurnitureProject } from '../types/furniture';

export interface CutListItem {
  id: string;
  name: string;
  shape: string;
  length: string;
  width: string;
  height: string;
  material: string;
  quantity: number;
}

export function generateCutList(project: FurnitureProject): CutListItem[] {
  const map = new Map<string, CutListItem>();

  for (const obj of project.objects) {
    if (!obj.visible) continue;

    const unit = project.unit;
    const key = `${obj.shape}_${obj.dimensions.length}_${obj.dimensions.width}_${obj.dimensions.height}_${obj.material.name}`;

    if (map.has(key)) {
      const item = map.get(key)!;
      item.quantity += 1;
    } else {
      map.set(key, {
        id: obj.id,
        name: obj.name,
        shape: obj.shape.replace('_', ' ').toUpperCase(),
        length: `${obj.dimensions.length.toFixed(1)} ${unit}`,
        width: `${obj.dimensions.width.toFixed(1)} ${unit}`,
        height: `${obj.dimensions.height.toFixed(1)} ${unit}`,
        material: obj.material.name,
        quantity: 1
      });
    }
  }

  return Array.from(map.values());
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
  let csv = 'Name,Shape,Length,Width,Height,Material,Quantity\n';
  
  for (const item of items) {
    csv += `"${item.name}","${item.shape}","${item.length}","${item.width}","${item.height}","${item.material}",${item.quantity}\n`;
  }

  downloadFile(`${project.name.toLowerCase().replace(/\s+/g, '_')}_cut_list.csv`, csv, 'text/csv');
}

export function exportProjectJSON(project: FurnitureProject) {
  const projectData = {
    formatVersion: 1,
    exportedAt: new Date().toISOString(),
    project
  };
  const json = JSON.stringify(projectData, null, 2);
  downloadFile(
    `${project.name.toLowerCase().replace(/\s+/g, '_')}.json`,
    json,
    'application/json'
  );
}

export async function copyProjectToClipboard(project: FurnitureProject): Promise<boolean> {
  const projectData = {
    formatVersion: 1,
    exportedAt: new Date().toISOString(),
    project
  };
  const json = JSON.stringify(projectData, null, 2);

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
      backgroundColor: projectData.backgroundColor
    };

    return imported;
  } catch (err) {
    console.warn('Failed to parse project JSON:', err);
    return null;
  }
}

