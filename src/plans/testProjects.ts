import type { BuiltInTemplateId, FurnitureProject } from '../types/furniture';
import { findBuiltInTemplate, placeBuiltIn } from '../builtins/builtIns';
import { PRESET_WOOD_MATERIALS } from '../utils/woodTextureGenerator';

/** A free-standing built-in template as a whole project (tests and the sample PDF). */
export function templateProject(template: BuiltInTemplateId, name: string, input: Record<string, number | string> = {}): FurnitureProject {
  const t = findBuiltInTemplate(template)!;
  const placed = placeBuiltIn([], undefined, { template, input: { ...t.defaults, ...input } }, PRESET_WOOD_MATERIALS.birch, 1)!;
  return {
    id: `proj_${template}`, name, createdAt: 0, updatedAt: 0, unit: 'in',
    objects: placed.objects, joints: placed.joints,
  } as unknown as FurnitureProject;
}
