import type { FurnitureProject } from '../types/furniture';
import { importProjectData } from './exportUtils';
import { saveFile, type SaveResult } from '../native/fileExport';

/** Every project in one file, for backups and moving to another device. */
export interface BackupFile {
  formatVersion: 1;
  kind: 'workbench-backup';
  exportedAt: string;
  projects: FurnitureProject[];
}

export function buildBackup(projects: FurnitureProject[], now = new Date()): BackupFile {
  return { formatVersion: 1, kind: 'workbench-backup', exportedAt: now.toISOString(), projects };
}

/** 'Workbench backup 2026-10-26.json' (local date). */
export function backupFileName(now = new Date()): string {
  const d = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  return `Workbench backup ${d}.json`;
}

export function backupFileText(projects: FurnitureProject[], now = new Date()): string {
  return JSON.stringify(buildBackup(projects, now), null, 2);
}

export interface OpenedFile {
  kind: 'project' | 'backup';
  /** Ready to add (ids never clash with `existing`; groups and joints linked). */
  projects: FurnitureProject[];
  /** Backup entries skipped because the same version is already on this device. */
  skipped: number;
}

/**
 * Read a .json the app exported: one project (share payload or a bare
 * project, always added as a new copy) or a backup of many. A backup restores
 * missing projects as they were, skips ones already here unchanged (same id
 * and last-edited time) so restoring twice adds nothing, and adds a
 * "(from backup)" copy of ones edited since. Null when it's not a Workbench file.
 */
export function openProjectFile(text: string, existing: Pick<FurnitureProject, 'id' | 'updatedAt'>[] = []): OpenedFile | null {
  let parsed: any;
  try { parsed = JSON.parse(text); } catch { return null; }
  if (parsed?.kind === 'workbench-backup' && Array.isArray(parsed.projects)) {
    const same = new Set(existing.map((p) => `${p.id}@${p.updatedAt}`));
    const ids = new Set(existing.map((p) => p.id));
    let skipped = 0;
    const projects: FurnitureProject[] = [];
    for (const raw of parsed.projects) {
      if (!raw) continue;
      if (same.has(`${raw.id}@${raw.updatedAt}`)) { skipped++; continue; }
      // Not on this device: restore as it was. Here but edited since: add the backup's version alongside.
      const p = ids.has(raw.id)
        ? importProjectData(raw, { suffix: ' (from backup)' })
        : importProjectData(raw, { keepIds: true });
      if (p) { projects.push(p); ids.add(p.id); }
    }
    return projects.length || skipped ? { kind: 'backup', projects, skipped } : null;
  }
  const p = importProjectData(parsed?.project || parsed);
  return p ? { kind: 'project', projects: [p], skipped: 0 } : null;
}

/** Toast after opening a file. */
export function openedMessage(opened: OpenedFile): string {
  if (opened.kind === 'project') return `Imported “${opened.projects[0].name}”.`;
  const n = opened.projects.length;
  const added = n === 1 ? 'Restored 1 project' : `Restored ${n} projects`;
  return opened.skipped ? `${added} (${opened.skipped} already here).` : `${added}.`;
}

/** Back up every project to one file (Documents/Backups + share sheet on iOS, a download on the web). */
export function backUpProjects(projects: FurnitureProject[], now = new Date()): Promise<SaveResult> {
  return saveFile(backupFileName(now), backupFileText(projects, now), 'application/json', { folder: 'Backups', title: 'Workbench backup' });
}
