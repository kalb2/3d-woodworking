import { MAX_PROMPT, SPEC_SCHEMA, SYSTEM_PROMPT, parseSpec, userMessage, type AiSpec } from './spec.ts';

/**
 * POST /api/v1/ai/describe on the sync Worker: the cloud fallback when Apple's
 * on-device model isn't available. The Worker holds the system prompt; the app
 * sends only the request (and the current design when changing one).
 *
 * Providers, in order:
 * 1. Cloudflare Workers AI through the AI binding (free daily allowance, no key).
 * 2. Optional, off by default: any OpenAI-compatible API, only when AI_API_KEY is set.
 *    Used alone without the binding, or as a fallback when Workers AI is out of
 *    allowance, busy or failing.
 */

/** Free-plan Workers AI model with JSON mode. */
export const DEFAULT_WORKERS_AI_MODEL = '@cf/meta/llama-3.3-70b-instruct-fp8-fast';
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

/** The Workers AI binding (env.AI), narrowed to what this uses. */
export interface WorkersAiBinding { run(model: string, input: Record<string, unknown>): Promise<unknown> }

export interface AiConfig {
  /** Workers AI binding ([ai] in wrangler.toml). The default, free provider. */
  workersAi?: WorkersAiBinding;
  /** Default @cf/meta/llama-3.3-70b-instruct-fp8-fast. */
  workersAiModel?: string;
  /** Optional OpenAI-compatible provider (off unless set). */
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

export type AiErrorCode = 'not_configured' | 'too_long' | 'bad_request' | 'sign_in' | 'rate_limited' | 'timeout' | 'provider' | 'provider_auth' | 'bad_json' | 'quota' | 'busy' | 'plan_required';

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

export const WORKERS_AI_MAX_TOKENS = 2500;

/** Workers AI errors arrive as thrown errors whose message carries the code (3036, 3040, 5035...). */
export function classifyWorkersAiError(e: unknown): ChatFail | 'json_mode' {
  const msg = String((e as Error)?.message ?? e);
  if (/JSON Mode couldn.t be met/i.test(msg)) return 'json_mode';
  if (/\b3036\b|daily free allocation|neurons/i.test(msg)) {
    return { ok: false, status: 429, code: 'quota', error: 'Today\'s free cloud AI allowance is used up. It resets at midnight UTC.' };
  }
  if (/\b5035\b|Workers Paid/i.test(msg)) {
    return { ok: false, status: 503, code: 'plan_required', error: 'That cloud AI model needs a paid Cloudflare plan. Pick a free model in WORKERS_AI_MODEL.' };
  }
  if (/\b3040\b|capacity/i.test(msg)) return { ok: false, status: 503, code: 'busy', error: 'The cloud AI is busy. Try again in a minute.' };
  if (/\b300[78]\b|timeout|timed out/i.test(msg)) return { ok: false, status: 504, code: 'timeout', error: 'The AI took too long. Try again or keep the request shorter.' };
  return { ok: false, status: 502, code: 'provider', error: 'The cloud AI failed. Try again.' };
}

async function workersAiChat(cfg: AiConfig, messages: { role: string; content: string }[], structured: boolean): Promise<ChatResult | ChatFail> {
  const input: Record<string, unknown> = { messages, max_tokens: WORKERS_AI_MAX_TOKENS, temperature: 0.2 };
  if (structured) input.response_format = { type: 'json_schema', json_schema: SPEC_SCHEMA };
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<'timeout'>((r) => { timer = setTimeout(() => r('timeout'), cfg.timeoutMs ?? PROVIDER_TIMEOUT_MS); });
  try {
    const out = await Promise.race([cfg.workersAi!.run(cfg.workersAiModel || DEFAULT_WORKERS_AI_MODEL, input), timeout]);
    if (out === 'timeout') return { ok: false, status: 504, code: 'timeout', error: 'The AI took too long. Try again or keep the request shorter.' };
    const r = (out as { response?: unknown } | null)?.response;
    // JSON mode returns the object itself; plain mode returns text.
    return { ok: true, text: typeof r === 'string' ? r : r && typeof r === 'object' ? JSON.stringify(r) : '' };
  } catch (e) {
    const c = classifyWorkersAiError(e);
    return c === 'json_mode' ? { ok: true, text: '' } : c;
  } finally {
    clearTimeout(timer);
  }
}

interface Provider { id: 'workers-ai' | 'openai-compatible'; model: string; call: (m: { role: string; content: string }[], attempt: number) => Promise<ChatResult | ChatFail> }

/** Fast failures where the next provider (if any) is worth trying. */
const FALL_THROUGH = new Set<AiErrorCode>(['quota', 'busy', 'plan_required', 'provider', 'provider_auth']);

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
  if (!cfg.mock && !cfg.workersAi && !cfg.apiKey) return fail(json, 503, 'not_configured', 'Describe it isn\'t set up on the server yet (no Workers AI binding).');
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

  if (cfg.mock && mockSpec) return json({ spec: mockSpec(prompt, current), model: 'mock', provider: 'mock' });

  const providers: Provider[] = [];
  if (cfg.workersAi) {
    // Schema-guided first; the retry goes plain (some replies can't meet JSON mode).
    providers.push({ id: 'workers-ai', model: cfg.workersAiModel || DEFAULT_WORKERS_AI_MODEL, call: (m, attempt) => workersAiChat(cfg, m, attempt === 0) });
  }
  if (cfg.apiKey) providers.push({ id: 'openai-compatible', model: cfg.model || DEFAULT_AI_MODEL, call: (m) => chat(cfg, m, true) });

  let last = '';
  for (let p = 0; p < providers.length; p++) {
    const prov = providers[p];
    const messages = [{ role: 'system', content: SYSTEM_PROMPT }, { role: 'user', content: userMessage(prompt, current) }];
    let failed: ChatFail | null = null;
    for (let attempt = 0; attempt < 2; attempt++) {
      const r = await prov.call(messages, attempt);
      if (!r.ok) { failed = r; break; }
      const parsed = parseSpec(r.text);
      if (parsed.ok) return json({ spec: parsed.spec, model: prov.model, provider: prov.id });
      last = parsed.error;
      // One retry: show the model its reply and what was wrong.
      messages.push({ role: 'assistant', content: r.text.slice(0, 6000) || '(no reply)' }, { role: 'user', content: `That was not valid: ${parsed.error} Reply with only the corrected JSON object.` });
    }
    if (failed) {
      if (p + 1 < providers.length && FALL_THROUGH.has(failed.code)) continue;
      return fail(json, failed.status, failed.code, failed.error);
    }
  }
  return fail(json, 422, 'bad_json', `The AI's answer couldn't be read (${last}). Try rewording it.`);
}
