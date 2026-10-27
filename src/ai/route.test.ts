import { describe, expect, it, vi } from 'vitest';
import { AiRequestError } from './client';
import type { OnDeviceBridge } from './onDevice';
import { AI_SOURCE_LABEL, generateSpec } from './route';
import type { AiSpec } from './spec';

const cloudSpec: AiSpec = { kind: 'template', name: 'Cloud shelf', template: 'bookshelf', params: {} };
const deviceJson = { json: JSON.stringify({ kind: 'template', name: 'Device shelf', template: 'bookshelf', params: { width: 30, height: 0, depth: 0, shelves: -1, doors: -1, drawers: -1, sections: -1, material: 'default' } }) };
const device = (over: Partial<OnDeviceBridge> = {}): OnDeviceBridge => ({
  status: vi.fn(async () => ({ available: true })), plan: vi.fn(async () => deviceJson), boards: vi.fn(async () => ({ json: '{}' })), ...over,
});
const cloudOk = () => vi.fn(async () => cloudSpec);
const cloudFails = (code: ConstructorParameters<typeof AiRequestError>[0]) => vi.fn(async () => { throw new AiRequestError(code); });

describe('generateSpec routing', () => {
  it('uses Apple Intelligence first when it is available', async () => {
    const cloud = cloudOk();
    const r = await generateSpec('a shelf', null, { onDevice: device(), cloud, mock: false });
    expect(r).toMatchObject({ source: 'on-device', spec: { name: 'Device shelf' } });
    expect(cloud).not.toHaveBeenCalled();
    expect(AI_SOURCE_LABEL[r.source]).toMatch(/Apple Intelligence/);
  });

  it('goes to the cloud when on-device is unavailable or fails', async () => {
    const off = device({ status: vi.fn(async () => ({ available: false, reason: 'apple_intelligence_off' as const })) });
    expect(await generateSpec('a shelf', null, { onDevice: off, cloud: cloudOk(), mock: false })).toMatchObject({ source: 'cloud' });
    expect(off.plan).not.toHaveBeenCalled();
    const broken = device({ plan: vi.fn(async () => { throw Object.assign(new Error('ctx'), { code: 'context' }); }) });
    expect(await generateSpec('a shelf', null, { onDevice: broken, cloud: cloudOk(), mock: false })).toMatchObject({ source: 'cloud' });
    expect(await generateSpec('a shelf', null, { onDevice: null, cloud: cloudOk(), mock: false })).toMatchObject({ source: 'cloud' });
    const throwsStatus = device({ status: vi.fn(async () => { throw new Error('no plugin'); }) });
    expect(await generateSpec('a shelf', null, { onDevice: throwsStatus, cloud: cloudOk(), mock: false })).toMatchObject({ source: 'cloud' });
  });

  it('says clearly when neither is available, with the on-device reason', async () => {
    const off = device({ status: vi.fn(async () => ({ available: false, reason: 'device_not_eligible' as const })) });
    const e = await generateSpec('a shelf', null, { onDevice: off, cloud: cloudFails('not_configured'), mock: false }).catch((x) => x);
    expect(e).toMatchObject({ code: 'unavailable' });
    expect(e.message).toMatch(/can't run Apple Intelligence/);
    expect(e.message).toMatch(/cloud AI isn't set up/);
    const web = await generateSpec('a shelf', null, { onDevice: null, cloud: cloudFails('network'), mock: false }).catch((x) => x);
    expect(web.message).toMatch(/iPhone and iPad app/);
    const failed = device({ plan: vi.fn(async () => { throw Object.assign(new Error('The on-device model declined that request.'), { code: 'guardrail' }); }) });
    const g = await generateSpec('a shelf', null, { onDevice: failed, cloud: cloudFails('sign_in'), mock: false }).catch((x) => x);
    expect(g.message).toMatch(/declined that request.*Sign in/);
  });

  it('passes real cloud errors through (e.g. the daily allowance)', async () => {
    const e = await generateSpec('a shelf', null, { onDevice: null, cloud: cloudFails('quota'), mock: false }).catch((x) => x);
    expect(e).toMatchObject({ code: 'quota' });
    expect(e.message).toMatch(/free cloud AI allowance/);
  });

  it('mock mode skips both and is labeled', async () => {
    const d = device();
    const r = await generateSpec('a shelf', null, { onDevice: d, cloud: cloudOk(), mock: true });
    expect(r.source).toBe('mock');
    expect(d.status).not.toHaveBeenCalled();
    await expect(generateSpec('a'.repeat(601), null, { onDevice: d, cloud: cloudOk(), mock: false })).rejects.toMatchObject({ code: 'too_long' });
  });
});
