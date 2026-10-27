import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_WORKERS_AI_MODEL, classifyWorkersAiError, handleAiDescribe, memoryLimiter } from './aiHandler';

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const req = (body: unknown) => new Request('http://x/api/v1/ai/describe', { method: 'POST', body: JSON.stringify(body) });
const who = { accountId: 'acct1', requireSignIn: true };
const good = { kind: 'template', name: 'Bookshelf', template: 'bookshelf', params: { width: 36 } };
const read = async (r: Response) => ({ status: r.status, body: await r.json() as { code?: string; spec?: unknown; error?: string; provider?: string; model?: string } });
const ai = (impl: (model: string, input: Record<string, unknown>) => Promise<unknown>) => ({ run: vi.fn(impl) });

describe('Workers AI provider', () => {
  it('needs no key: calls the AI binding with JSON mode and the default free model', async () => {
    const binding = ai(async () => ({ response: good }));
    const r = await read(await handleAiDescribe(req({ prompt: 'a bookshelf' }), { workersAi: binding, limiter: memoryLimiter() }, who, json));
    expect(r).toMatchObject({ status: 200, body: { provider: 'workers-ai', model: DEFAULT_WORKERS_AI_MODEL, spec: { template: 'bookshelf' } } });
    const [model, input] = binding.run.mock.calls[0];
    expect(model).toBe('@cf/meta/llama-3.3-70b-instruct-fp8-fast');
    expect((input.response_format as { type: string }).type).toBe('json_schema');
    expect((input.messages as { content: string }[])[1].content).toBe('Design: a bookshelf');
  });

  it('accepts a text reply, and retries once in plain mode when JSON mode fails', async () => {
    const text = ai(async () => ({ response: '```json\n' + JSON.stringify(good) + '\n```' }));
    expect((await handleAiDescribe(req({ prompt: 'x' }), { workersAi: text, limiter: memoryLimiter() }, who, json)).status).toBe(200);
    const binding = { run: vi.fn().mockRejectedValueOnce(new Error("AiError: JSON Mode couldn't be met")).mockResolvedValueOnce({ response: JSON.stringify(good) }) };
    expect((await handleAiDescribe(req({ prompt: 'x' }), { workersAi: binding, limiter: memoryLimiter() }, who, json)).status).toBe(200);
    expect(binding.run.mock.calls[1][1].response_format).toBeUndefined();
    const junk = ai(async () => ({ response: { kind: 'chair' } }));
    expect((await read(await handleAiDescribe(req({ prompt: 'x' }), { workersAi: junk, limiter: memoryLimiter() }, who, json))).body.code).toBe('bad_json');
    expect(junk.run).toHaveBeenCalledTimes(2);
  });

  it('reports the used-up daily allowance clearly', async () => {
    const out = ai(async () => { throw new Error('3036: You have used up your daily free allocation of 10,000 neurons.'); });
    const r = await read(await handleAiDescribe(req({ prompt: 'x' }), { workersAi: out, limiter: memoryLimiter() }, who, json));
    expect(r).toMatchObject({ status: 429, body: { code: 'quota' } });
    expect(r.body.error).toMatch(/free cloud AI allowance is used up.*midnight UTC/);
  });

  it('classifies busy, paid-only and timeout errors, and times out a hung call', async () => {
    expect(classifyWorkersAiError(new Error('3040: Capacity temporarily exceeded'))).toMatchObject({ code: 'busy' });
    expect(classifyWorkersAiError(new Error('5035: requires Workers Paid'))).toMatchObject({ code: 'plan_required' });
    expect(classifyWorkersAiError(new Error('3007: Request timeout'))).toMatchObject({ code: 'timeout' });
    expect(classifyWorkersAiError(new Error('boom'))).toMatchObject({ code: 'provider' });
    const hang = ai(() => new Promise(() => {}));
    expect((await read(await handleAiDescribe(req({ prompt: 'x' }), { workersAi: hang, timeoutMs: 10, limiter: memoryLimiter() }, who, json))).body.code).toBe('timeout');
  });

  it('uses the optional paid key only as a fallback when Workers AI is out', async () => {
    const out = ai(async () => { throw new Error('3036: daily free allocation'); });
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(good) } }] })));
    const r = await read(await handleAiDescribe(req({ prompt: 'x' }), { workersAi: out, apiKey: 'k', fetchImpl, limiter: memoryLimiter() }, who, json));
    expect(r).toMatchObject({ status: 200, body: { provider: 'openai-compatible' } });
    const ok = ai(async () => ({ response: good }));
    await handleAiDescribe(req({ prompt: 'x' }), { workersAi: ok, apiKey: 'k', fetchImpl, limiter: memoryLimiter() }, who, json);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('still requires sign-in and the rate limit before spending the allowance', async () => {
    const binding = ai(async () => ({ response: good }));
    expect((await handleAiDescribe(req({ prompt: 'x' }), { workersAi: binding, limiter: memoryLimiter() }, { accountId: null, requireSignIn: true }, json)).status).toBe(401);
    const cfg = { workersAi: binding, limiter: memoryLimiter(1) };
    await handleAiDescribe(req({ prompt: 'x' }), cfg, who, json);
    expect((await read(await handleAiDescribe(req({ prompt: 'x' }), cfg, who, json))).body.code).toBe('rate_limited');
    expect(binding.run).toHaveBeenCalledTimes(1);
  });
});
