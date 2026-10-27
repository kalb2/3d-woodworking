import { describe, expect, it, vi } from 'vitest';
import { handleAiDescribe, memoryLimiter, DEFAULT_AI_MODEL } from './aiHandler';
import { mockDescribe } from './mock';

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const req = (body: unknown) => new Request('http://x/api/v1/ai/describe', { method: 'POST', body: typeof body === 'string' ? body : JSON.stringify(body) });
const who = { accountId: 'acct1', requireSignIn: true };
const reply = (content: string) => new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status: 200 });
const good = JSON.stringify({ kind: 'template', name: 'Bookshelf', template: 'bookshelf', params: { width: 36 } });
const read = async (r: Response) => ({ status: r.status, body: await r.json() as { code?: string; spec?: unknown; error?: string } });

describe('handleAiDescribe', () => {
  it('says "not set up" without a key, before anything else', async () => {
    const r = await read(await handleAiDescribe(req({ prompt: 'x' }), {}, { accountId: null, requireSignIn: true }, json));
    expect(r).toMatchObject({ status: 503, body: { code: 'not_configured' } });
  });

  it('enforces size limits and sign-in', async () => {
    const cfg = { apiKey: 'k', limiter: memoryLimiter() };
    expect((await read(await handleAiDescribe(req({ prompt: 'a'.repeat(601) }), cfg, who, json))).body.code).toBe('too_long');
    expect((await read(await handleAiDescribe(req('x'.repeat(20000)), cfg, who, json))).status).toBe(413);
    expect((await read(await handleAiDescribe(req({ prompt: 'shelf' }), cfg, { accountId: null, requireSignIn: true }, json))).body.code).toBe('sign_in');
    expect((await read(await handleAiDescribe(req({ prompt: '  ' }), cfg, who, json))).status).toBe(400);
  });

  it('rate limits per account', async () => {
    const fetchImpl = vi.fn(async () => reply(good));
    const cfg = { apiKey: 'k', limiter: memoryLimiter(2), fetchImpl };
    for (let i = 0; i < 2; i++) expect((await handleAiDescribe(req({ prompt: 'shelf' }), cfg, who, json)).status).toBe(200);
    expect((await read(await handleAiDescribe(req({ prompt: 'shelf' }), cfg, who, json))).body.code).toBe('rate_limited');
    expect((await handleAiDescribe(req({ prompt: 'shelf' }), cfg, { ...who, accountId: 'other' }, json)).status).toBe(200);
  });

  it('calls OpenAI-compatible chat completions with structured output and the key', async () => {
    const fetchImpl = vi.fn(async (..._a: unknown[]) => reply(good));
    const r = await read(await handleAiDescribe(req({ prompt: 'a bookshelf' }), { apiKey: 'sk', fetchImpl, limiter: memoryLimiter() }, who, json));
    expect(r.status).toBe(200);
    expect(r.body.spec).toMatchObject({ kind: 'template', template: 'bookshelf' });
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.x.ai/v1/chat/completions');
    expect((init.headers as Record<string, string>).authorization).toBe('Bearer sk');
    const body = JSON.parse(init.body as string);
    expect(body.model).toBe(DEFAULT_AI_MODEL);
    expect(body.response_format.type).toBe('json_schema');
    expect(body.reasoning_effort).toBe('low');
    expect(body.messages[1].content).toBe('Design: a bookshelf');
  });

  it('retries once on bad JSON, then gives up with bad_json', async () => {
    const once = vi.fn().mockResolvedValueOnce(reply('nope')).mockResolvedValueOnce(reply(good));
    expect((await handleAiDescribe(req({ prompt: 'x' }), { apiKey: 'k', fetchImpl: once, limiter: memoryLimiter() }, who, json)).status).toBe(200);
    expect(once).toHaveBeenCalledTimes(2);
    expect(JSON.parse((once.mock.calls[1][1] as RequestInit).body as string).messages.at(-1).content).toMatch(/^That was not valid/);
    const never = vi.fn(async () => reply('{"kind":"chair"}'));
    const r = await read(await handleAiDescribe(req({ prompt: 'x' }), { apiKey: 'k', fetchImpl: never, limiter: memoryLimiter() }, who, json));
    expect(r).toMatchObject({ status: 422, body: { code: 'bad_json' } });
    expect(never).toHaveBeenCalledTimes(2);
  });

  it('times out, reports a rejected key, and falls back to plain JSON mode on a 400', async () => {
    const hang = vi.fn((_u: string, init: RequestInit) => new Promise<Response>((_, rej) => init.signal!.addEventListener('abort', () => rej(Object.assign(new Error('aborted'), { name: 'AbortError' })))));
    expect((await read(await handleAiDescribe(req({ prompt: 'x' }), { apiKey: 'k', fetchImpl: hang as unknown as typeof fetch, timeoutMs: 10, limiter: memoryLimiter() }, who, json))).body.code).toBe('timeout');
    const denied = vi.fn(async () => new Response('{}', { status: 401 }));
    expect((await read(await handleAiDescribe(req({ prompt: 'x' }), { apiKey: 'k', fetchImpl: denied, limiter: memoryLimiter() }, who, json))).body.code).toBe('provider_auth');
    const old = vi.fn().mockResolvedValueOnce(new Response('{}', { status: 400 })).mockResolvedValueOnce(reply(good));
    expect((await handleAiDescribe(req({ prompt: 'x' }), { apiKey: 'k', fetchImpl: old, baseUrl: 'https://other.example/v1/', limiter: memoryLimiter() }, who, json)).status).toBe(200);
    expect(old.mock.calls[0][0]).toBe('https://other.example/v1/chat/completions');
    expect(JSON.parse((old.mock.calls[1][1] as RequestInit).body as string).response_format).toEqual({ type: 'json_object' });
  });

  it('sends the current design for a change; mock mode needs no key', async () => {
    const r = await read(await handleAiDescribe(req({ prompt: 'a shelf' }), { mock: true, limiter: memoryLimiter() }, who, json, mockDescribe));
    expect(r.body.spec).toMatchObject({ kind: 'boards', name: 'Bookshelf' });
    const fetchImpl = vi.fn(async (..._a: unknown[]) => reply(good));
    await handleAiDescribe(req({ prompt: 'taller', current: JSON.parse(good) }), { apiKey: 'k', fetchImpl, limiter: memoryLimiter() }, who, json);
    expect(JSON.parse((fetchImpl.mock.calls[0][1] as RequestInit).body as string).messages[1].content).toContain('Change: taller');
  });
});

describe('sync handler route', () => {
  it('POST /api/v1/ai/describe is wired in and answers "not set up" without a key; sign-in uses the session', async () => {
    const { handleSyncRequest } = await import('../sync/handler');
    const db = { accountForSession: async (t: string) => (t === 'good' ? { id: 'a1' } : null) } as never;
    const base = { db, identity: {} as never, config: { devSignIn: false, mode: 'cloud' as const, appleAudience: 'x' } };
    const post = (token?: string) => new Request('http://w/api/v1/ai/describe', { method: 'POST', body: JSON.stringify({ prompt: 'shelf' }), headers: token ? { authorization: `Bearer ${token}` } : {} });
    expect((await (await handleSyncRequest(post(), base)).json()).code).toBe('not_configured');
    expect((await (await handleSyncRequest(post(), { ...base, ai: { config: {}, requireSignIn: true } })).json()).code).toBe('not_configured');
    const ai = { config: { mock: true, limiter: memoryLimiter() }, requireSignIn: true, mockSpec: mockDescribe };
    expect((await handleSyncRequest(post(), { ...base, ai })).status).toBe(401);
    expect((await handleSyncRequest(post('good'), { ...base, ai })).status).toBe(200);
  });
});
