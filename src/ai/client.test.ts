import { describe, expect, it, vi } from 'vitest';
import { AI_ERROR_TEXT, requestSpec } from './client';

const res = (body: unknown, status = 200) => new Response(typeof body === 'string' ? body : JSON.stringify(body), { status });
const call = (fetchImpl: () => Promise<Response>) => requestSpec('a shelf', null, { fetchImpl: vi.fn(fetchImpl), mock: false }).catch((e: { code: string; message: string }) => e);

describe('requestSpec', () => {
  it('returns the parsed spec', async () => {
    const spec = await requestSpec('a shelf', null, { mock: false, fetchImpl: vi.fn(async () => res({ spec: { kind: 'template', name: 'B', template: 'bookshelf', params: {} } })) });
    expect(spec).toMatchObject({ kind: 'template', template: 'bookshelf' });
  });

  it('an older Worker without the route (404) or an HTML page reads as "not set up yet"', async () => {
    expect(await call(async () => res({ error: 'Not found.' }, 404))).toMatchObject({ code: 'not_configured', message: AI_ERROR_TEXT.not_configured });
    expect(await call(async () => res('<html>nope</html>', 502))).toMatchObject({ code: 'not_configured' });
    expect(await call(async () => res({ error: 'x', code: 'not_configured' }, 503))).toMatchObject({ code: 'not_configured' });
  });

  it('maps server errors to plain messages', async () => {
    expect(await call(async () => res({ code: 'bad_json' }, 422))).toMatchObject({ code: 'bad_json' });
    expect(await call(async () => res({ code: 'timeout' }, 504))).toMatchObject({ code: 'timeout' });
    expect(await call(async () => res({ error: 'x' }, 401))).toMatchObject({ code: 'sign_in' });
    expect(await call(async () => res({ error: 'x' }, 429))).toMatchObject({ code: 'rate_limited' });
    expect(await call(async () => res({ error: 'The AI key was rejected.', code: 'provider_auth' }, 502))).toMatchObject({ code: 'server', message: 'The AI key was rejected.' });
    expect(await call(async () => res({ spec: { kind: 'chair' } }))).toMatchObject({ code: 'bad_json' });
    expect(await call(async () => { throw new TypeError('offline'); })).toMatchObject({ code: 'network' });
  });

  it('times out on the app side too', async () => {
    const hang = (_u: string, init: RequestInit) => new Promise<Response>((_, rej) => init.signal!.addEventListener('abort', () => rej(Object.assign(new Error('a'), { name: 'AbortError' }))));
    const e = await requestSpec('x', null, { mock: false, timeoutMs: 5, fetchImpl: hang as unknown as typeof fetch }).catch((x) => x);
    expect(e.code).toBe('timeout');
  });

  it('rejects over-long prompts without calling out; mock mode needs no server', async () => {
    const f = vi.fn();
    expect(await requestSpec('a'.repeat(601), null, { fetchImpl: f, mock: false }).catch((e) => e.code)).toBe('too_long');
    expect(f).not.toHaveBeenCalled();
    expect(await requestSpec('shelf', null, { mock: true, mockDelayMs: 0 })).toMatchObject({ kind: 'boards', name: 'Bookshelf' });
  });
});
