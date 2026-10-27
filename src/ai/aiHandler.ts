import { MAX_PROMPT, SPEC_SCHEMA, SYSTEM_PROMPT, parseSpec, userMessage, type AiSpec } from './spec.ts';

/**
 * POST /api/v1/ai/describe on the sync Worker. The Worker holds the key and
 * the system prompt; the app sends only the request (and the current design
 * when changing one). OpenAI-compatible chat completions, so any provider works.
 */

export const DEFAULT_AI_BASE_URL = 'https://api.x.ai/v1';
export const DEFAULT_AI_MODEL = 'grok-4.7';
/** Request body cap (prompt plus the current design). */
export const MAX_BODY_BYTES = 16_000;
/** Per-account requests per minute (Cloudflare rate-limit binding, else per isolate). */
export const RATE_LIMIT_PER_MIN = 10;
/** Per provider call; two calls max (one retry on bad JSON) stay under the app's 60 s wait. */
export const PROVIDER_TIMEOUT_MS = 25_000;
const MAX_TOKENS = 4000;

export interface RateLimiter { limit(options: { key: string }): Promise<{ success: boolean }> }

export interface AiConfig {
  apiKey?: string;
  baseUrl?: string;
  model?: string;
  /** Sent as reasoning_effort when set ("low" by default on xAI; "none" to omit). */
  reasoningEffort?: string;
  /** Return the canned bookshelf without calling a provider. */
  mock?: boolean;
  limiter?: RateLimiter;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

export type AiErrorCode = 'not_configured' | 'too_long' | 'bad_request' | 'sign_in' | 'rate_limited' | 'timeout' | 'provider' | 'provider_auth' | 'bad_json';

type Json = (body: unknown, status?: number) => Response;
const fail = (json: Json, status: number, code: AiErrorCode, error: string) => json({ error, code }, status);

/** Fallback limiter: fixed one-minute windows in this isolate's memory. */
export function memoryLimiter(perMinute = RATE_LIMIT_PER_MIN, now = () => Date.now()): RateLimiter {
  const hits = new Map<string, { start: number; n: number }>();
  return {
    async limit({ key }) {
      const t = now();
      const h = hits.get(key);
      if (!h || t - h.start >= 60_000) {
        if (hits.size > 5000) hits.clear();
        hits.set(key, { start: t, n: 1 });
        return { success: true };
      }
      h.n++;
      return { success: h.n <= perMinute };
    },
  };
}
const sharedMemoryLimiter = memoryLimiter();

interface ChatResult { ok: true; text: string } 
type ChatFail = { ok: false; status: number; code: AiErrorCode; error: string };

async function chat(cfg: AiConfig, messages: { role: string; content: string }[], structured: boolean): Promise<ChatResult | ChatFail> {
  const base = (cfg.baseUrl || DEFAULT_AI_BASE_URL).replace(/\/$/, '');
  const effort = cfg.reasoningEffort ?? (base.includes('api.x.ai') ? 'low' : undefined);
  const body: Record<string, unknown> = {
    model: cfg.model || DEFAULT_AI_MODEL,
    messages,
    temperature: 0.2,
    max_tokens: MAX_TOKENS,
    response_format: structured
      ? { type: 'json_schema', json_schema: { name: 'workbench_design', schema: SPEC_SCHEMA, strict: false } }
      : { type: 'json_object' },
  };
  if (structured && effort && effort !== 'none') body.reasoning_effort = effort;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), cfg.timeoutMs ?? PROVIDER_TIMEOUT_MS);
  try {
    const res = await (cfg.fetchImpl ?? fetch)(`${base}/chat/completions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${cfg.apiKey}` },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (res.status === 401 || res.status === 403) return { ok: false, status: 502, code: 'provider_auth', error: 'The AI key was rejected. Check AI_API_KEY on the server.' };
    if (res.status === 429) return { ok: false, status: 429, code: 'rate_limited', error: 'The AI service is busy. Try again in a minute.' };
    if (res.status === 400 && structured) return chat(cfg, messages, false); // provider without json_schema / reasoning_effort
    if (!res.ok) return { ok: false, status: 502, code: 'provider', error: `The AI service failed (${res.status}).` };
    const data = await res.json().catch(() => null) as { choices?: { message?: { content?: string } }[] } | null;
    const text = data?.choices?.[0]?.message?.content;
    return typeof text === 'string' ? { ok: true, text } : { ok: true, text: '' };
  } catch (e) {
    if ((e as Error)?.name === 'AbortError') return { ok: false, status: 504, code: 'timeout', error: 'The AI took too long. Try again or keep the request shorter.' };
    return { ok: false, status: 502, code: 'provider', error: 'Could not reach the AI service.' };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * accountId is the signed-in account (null when signed out); requireSignIn turns
 * signed-out calls away (cloud). Order: setup, size, sign-in, rate limit, provider.
 */
export async function handleAiDescribe(
  request: Request,
  cfg: AiConfig,
  who: { accountId: string | null; requireSignIn: boolean; ip?: string | null },
  json: Json,
  mockSpec?: (prompt: string, current: AiSpec | null) => AiSpec,
): Promise<Response> {
  if (!cfg.mock && !cfg.apiKey) return fail(json, 503, 'not_configured', 'Describe it isn\'t set up on the server yet (no AI key).');
  const length = Number(request.headers.get('content-length') || 0);
  if (length > MAX_BODY_BYTES) return fail(json, 413, 'too_long', 'That request is too long.');
  const raw = await request.text();
  if (raw.length > MAX_BODY_BYTES) return fail(json, 413, 'too_long', 'That request is too long.');
  let body: { prompt?: unknown; current?: unknown };
  try { body = JSON.parse(raw); } catch { return fail(json, 400, 'bad_request', 'Expected JSON.'); }
  const prompt = typeof body.prompt === 'string' ? body.prompt.trim() : '';
  if (!prompt) return fail(json, 400, 'bad_request', 'Describe the piece first.');
  if (prompt.length > MAX_PROMPT) return fail(json, 413, 'too_long', `Keep it under ${MAX_PROMPT} characters.`);
  let current: AiSpec | null = null;
  if (body.current !== undefined && body.current !== null) {
    const p = parseSpec(body.current);
    if (!p.ok) return fail(json, 400, 'bad_request', 'The current design could not be read.');
    current = p.spec;
  }
  if (who.requireSignIn && !who.accountId) return fail(json, 401, 'sign_in', 'Sign in to use Describe it.');
  const key = who.accountId ? `acct:${who.accountId}` : `ip:${who.ip || 'local'}`;
  const { success } = await (cfg.limiter ?? sharedMemoryLimiter).limit({ key });
  if (!success) return fail(json, 429, 'rate_limited', `That's a lot of requests. Wait a minute (limit ${RATE_LIMIT_PER_MIN} a minute).`);

  if (cfg.mock && mockSpec) return json({ spec: mockSpec(prompt, current), model: 'mock' });

  const messages = [{ role: 'system', content: SYSTEM_PROMPT }, { role: 'user', content: userMessage(prompt, current) }];
  let last = '';
  for (let attempt = 0; attempt < 2; attempt++) {
    const r = await chat(cfg, messages, true);
    if (!r.ok) return fail(json, r.status, r.code, r.error);
    const parsed = parseSpec(r.text);
    if (parsed.ok) return json({ spec: parsed.spec, model: cfg.model || DEFAULT_AI_MODEL });
    last = parsed.error;
    // One retry: show the model its reply and what was wrong.
    messages.push({ role: 'assistant', content: r.text.slice(0, 6000) }, { role: 'user', content: `That was not valid: ${parsed.error} Reply with only the corrected JSON object.` });
  }
  return fail(json, 422, 'bad_json', `The AI's answer couldn't be read (${last}). Try rewording it.`);
}
