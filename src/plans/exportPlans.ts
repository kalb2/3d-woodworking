import type { FurnitureProject } from '../types/furniture';
import { saveFile, type SaveResult } from '../native/fileExport';
import { bytesToBase64 } from '../utils/modelExport';
import { buildPlansPdf, plansFileName } from './pdf';
import type { PaperSize } from './layout';
import { renderCover } from './render';

/**
 * Build plans PDF for a project, saved the way other exports are: Files and
 * the share sheet on iOS, a download on the web. Loaded on demand (jsPDF
 * stays out of the main bundle).
 */
export async function exportBuildPlans(project: FurnitureProject, paper: PaperSize = 'letter'): Promise<SaveResult> {
  let cover = null;
  try { cover = renderCover(project); } catch { cover = null; }
  const { doc } = buildPlansPdf(project, { paper, coverImage: cover ?? undefined });
  const bytes = new Uint8Array(doc.output('arraybuffer'));
  return saveFile(plansFileName(project), bytesToBase64(bytes), 'application/pdf', {
    base64: true,
    title: `${project.name.trim() || 'Workbench'} build plans`,
  });
}
