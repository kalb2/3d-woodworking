import { readStoredSession, syncBaseUrl, syncServerConfigured } from '../sync/client';
import { API_PREFIX } from '../sync/types';
import { mockDescribe } from './mock';
import { MAX_PROMPT, parseSpec, type AiSpec } from './spec';

/** App side of "Describe it": one POST to the sync Worker, plain errors. */

export type AiClientError = 'not_configured' | 'timeout' | 'bad_json' | 'rate_limited' | 'sign_in' | 'too_long' | 'network' | 'server';

export const AI_ERROR_TEXT: Record<AiClientError, string> = {
  not_configured: 'Describe it isn\'t set up yet. It needs the AI key on the Workbench server.',
  timeout: 'That took too long. Try again, or keep the description shorter.',
  bad_json: 'The AI\'s answer couldn\'t be turned into a piece. Try rewording it.',
  rate_limited: 'That\'s a lot of requests. Wait a minute and try again.',
  sign_in: 'Sign in (Settings → Account) to use Describe it.',
  too_long: `Keep the description under ${MAX_PROMPT} characters.`,
  network: 'Couldn\'t reach the Workbench server. Check your connection.',
  server: 'Something went wrong on the server. Try again.',
};

export class AiRequestError extends Error {
  readonly code: AiClientError;
  constructor(code: AiClientError, message = AI_ERROR_TEXT[code]) {
    super(message);
    this.code = code;
  }
}

/** Mock mode: VITE_AI_MOCK=1 at build time, or localStorage workbench_ai_mock = "1". */
export function aiMockEnabled(): boolean {
  const env = import.meta.env as Record<string, string | undefined>;
  if (env.VITE_AI_MOCK === '1') return true;
  try { return localStorage.getItem('workbench_ai_mock') === '1'; } catch { return false; }
}

const CLIENT_TIMEOUT_MS = 60_000;

const SERVER_CODES: Record<string, AiClientError> = {
  not_configured: 'not_configured', timeout: 'timeout', bad_json: 'bad_json', rate_limited: 'rate_limited',
  sign_in: 'sign_in', too_long: 'too_long',
};

/** Ask for a design (or a change to `current`). Throws AiRequestError. */
export async function requestSpec(
  prompt: string,
  current: AiSpec | null,
  opts: { fetchImpl?: typeof fetch; mock?: boolean; timeoutMs?: number; mockDelayMs?: number } = {},
): Promise<AiSpec> {
  const text = prompt.trim();
  if (text.length > MAX_PROMPT) throw new AiRequestError('too_long');
  if (opts.mock ?? aiMockEnabled()) {
    await new Promise((r) => setTimeout(r, opts.mockDelayMs ?? 700));
    return mockDescribe(text, current);
  }
  if (!opts.fetchImpl && !syncServerConfigured()) throw new AiRequestError('not_configured');
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  const session = readStoredSession();
  if (session) headers.authorization = `Bearer ${session.token}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? CLIENT_TIMEOUT_MS);
  let res: Response;
  try {
    res = await (opts.fetchImpl ?? fetch)(`${syncBaseUrl()}${API_PREFIX}/ai/describe`, {
      method: 'POST', headers, body: JSON.stringify({ prompt: text, current }), signal: controller.signal,
    });
  } catch (e) {
    throw new AiRequestError((e as Error)?.name === 'AbortError' ? 'timeout' : 'network');
  } finally {
    clearTimeout(timer);
  }
  let body: { spec?: unknown; error?: string; code?: string } | null = null;
  try { body = JSON.parse(await res.text()); } catch { body = null; }
  // An older Worker (no route yet) or a static host answers 404 / HTML.
  if (res.status === 404 || res.status === 405 || !body || typeof body !== 'object') {
    if (res.ok) throw new AiRequestError('bad_json');
    throw new AiRequestError('not_configured');
  }
  if (!res.ok) {
    const code: AiClientError = (body.code ? SERVER_CODES[body.code] : undefined)
      ?? (res.status === 401 ? 'sign_in' : res.status === 429 ? 'rate_limited' : res.status === 413 ? 'too_long' : res.status === 504 ? 'timeout' : 'server');
    throw new AiRequestError(code, code === 'server' && body.error ? body.error : AI_ERROR_TEXT[code]);
  }
  const parsed = parseSpec(body.spec);
  if (!parsed.ok) throw new AiRequestError('bad_json');
  return parsed.spec;
}
