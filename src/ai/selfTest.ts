import { PRESET_WOOD_MATERIALS } from '../utils/woodTextureGenerator';
import { placeAiPiece } from './build';
import { onDeviceGenerate, type OnDeviceBridge } from './onDevice';

/**
 * Debug-only on-device check, run when the app is launched with WB_AI_SELFTEST=1:
 * two generations (a template piece and a board piece) through the real native
 * model and the app's repair pass, logged as "[AI-SELFTEST] {...}". Nothing is
 * added to the project.
 */
const CASES = [
  'a bookshelf 36 inches wide and 6 feet tall with 4 shelves',
  'a small side table with four 2x2 legs and a plywood top, 20 inches tall',
];

export async function runAiSelfTest(bridge: OnDeviceBridge, log: (line: string) => void = (l) => console.log(l)): Promise<void> {
  const status = await bridge.status();
  log(`[AI-SELFTEST] ${JSON.stringify({ step: 'status', ...status })}`);
  if (!status.available) return;
  for (const prompt of CASES) {
    const t0 = Date.now();
    try {
      const spec = await onDeviceGenerate(prompt, null, bridge);
      const placed = placeAiPiece([], [], undefined, spec, prompt, { groupMaterial: PRESET_WOOD_MATERIALS.birch });
      log(`[AI-SELFTEST] ${JSON.stringify({
        step: 'generate', prompt, ms: Date.now() - t0, kind: spec.kind, name: spec.name,
        template: spec.kind === 'template' ? spec.template : undefined,
        params: spec.kind === 'template' ? spec.params : undefined,
        boards: spec.kind === 'boards' ? spec.boards.length : undefined,
        joints: spec.kind === 'boards' ? spec.joints.length : undefined,
        parts: placed ? placed.objects.length : 0, notes: placed?.notes ?? [],
      })}`);
    } catch (e) {
      log(`[AI-SELFTEST] ${JSON.stringify({ step: 'generate', prompt, ms: Date.now() - t0, error: (e as { code?: string }).code ?? 'failed', message: (e as Error).message })}`);
    }
  }
  log('[AI-SELFTEST] done');
}
