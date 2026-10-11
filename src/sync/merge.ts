import type { FurnitureProject } from '../types/furniture.ts';
import type { SyncRecord } from './types.ts';

/** Last write wins per project id. Equal timestamps keep the incoming record. */
export function mergeRecords(current: SyncRecord[], incoming: SyncRecord[]): SyncRecord[] {
  const map = new Map<string, SyncRecord>();
  for (const record of current) map.set(record.id, record);
  for (const record of incoming) {
    const previous = map.get(record.id);
    if (!previous || record.updatedAt >= previous.updatedAt) map.set(record.id, record);
  }
  return [...map.values()];
}

export function recordsFromProjects(
  projects: FurnitureProject[],
  tombstones: Record<string, number>,
): SyncRecord[] {
  const map = new Map<string, SyncRecord>();
  for (const project of projects) {
    map.set(project.id, { id: project.id, updatedAt: project.updatedAt, project });
  }
  for (const [id, deletedAt] of Object.entries(tombstones)) {
    const existing = map.get(id);
    if (existing && existing.updatedAt > deletedAt) continue;
    map.set(id, { id, updatedAt: deletedAt, deletedAt });
  }
  return [...map.values()];
}

export function projectsFromRecords(records: SyncRecord[]): FurnitureProject[] {
  return records
    .filter((record) => record.project && !(record.deletedAt && record.deletedAt >= record.project.updatedAt))
    .map((record) => record.project as FurnitureProject)
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

export function tombstonesFromRecords(records: SyncRecord[]): Record<string, number> {
  const tombstones: Record<string, number> = {};
  for (const record of records) {
    if (record.deletedAt && (!record.project || record.deletedAt >= record.project.updatedAt)) {
      tombstones[record.id] = record.deletedAt;
    }
  }
  return tombstones;
}

/** The seeded starter shares one id on every device. Give it a new id before the first upload. */
export function claimStarterProjectId(projects: FurnitureProject[]): FurnitureProject[] {
  return projects.map((project) => {
    if (project.id !== 'proj_default') return project;
    return { ...project, id: `proj_${crypto.randomUUID()}`, updatedAt: Date.now() };
  });
}
