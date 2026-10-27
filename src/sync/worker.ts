import { D1SyncDb, type D1Like } from './d1Db.ts';
import { handleSyncRequest } from './handler.ts';
import { createIdentityResolver } from './identity.ts';
import { APPLE_AUDIENCE } from './types.ts';
import type { RateLimiter, WorkersAiBinding } from '../ai/aiHandler.ts';
import { mockDescribe } from '../ai/mock.ts';
import { DESCRIBE_CLOUD_ENABLED } from '../config/features.ts';
import { appleRevokeConfig, revokeAppleAuthorization, type AppleRevokeEnv } from './appleRevoke.ts';
import type { SyncHandlerOptions } from './handler.ts';

export interface WorkerEnv extends AppleRevokeEnv {
  DB?: D1Like;
  ALLOW_DEV_AUTH?: string;
  APPLE_AUDIENCE?: string;
  /** Describe it: Workers AI binding ([ai] in wrangler.toml). Free daily allowance, no key. */
  AI?: WorkersAiBinding;
  /** Workers AI model (default @cf/meta/llama-3.3-70b-instruct-fp8-fast). */
  WORKERS_AI_MODEL?: string;
  /** Optional, off by default: an OpenAI-compatible provider key (secret), used alone or as a fallback. */
  AI_API_KEY?: string;
  /** OpenAI-compatible base URL (default https://api.x.ai/v1). Only with AI_API_KEY. */
  AI_BASE_URL?: string;
  /** OpenAI-compatible model (default grok-4.7). Only with AI_API_KEY. */
  AI_MODEL?: string;
  /** reasoning_effort sent with structured output (default "low" on xAI; "none" to omit). */
  AI_REASONING_EFFORT?: string;
  /** "1": canned bookshelf, no provider call (testing). */
  AI_MOCK?: string;
  /** Cloudflare rate-limit binding ([[ratelimits]] in wrangler.toml); per-isolate fallback without it. */
  AI_LIMITER?: RateLimiter;
}

/**
 * Describe it cloud route. Off for 1.0 (DESCRIBE_CLOUD_ENABLED): the route answers
 * "not set up" and nothing reaches Workers AI or the AI_API_KEY provider.
 */
export function aiOptions(env: WorkerEnv, enabled = DESCRIBE_CLOUD_ENABLED): SyncHandlerOptions['ai'] {
  if (!enabled) return undefined;
  return {
    config: {
      workersAi: env.AI,
      workersAiModel: env.WORKERS_AI_MODEL,
      apiKey: env.AI_API_KEY,
      baseUrl: env.AI_BASE_URL,
      model: env.AI_MODEL,
      reasoningEffort: env.AI_REASONING_EFFORT,
      mock: env.AI_MOCK === '1',
      limiter: env.AI_LIMITER,
    },
    requireSignIn: true,
    mockSpec: mockDescribe,
  };
}

/** Sign in with Apple revocation on DELETE /me, using the APPLE_* Worker secrets. */
export function appleRevokeOption(env: WorkerEnv, audience: string, fetchImpl: typeof fetch = fetch): SyncHandlerOptions['appleRevoke'] {
  const config = appleRevokeConfig(env, audience);
  return (account, code) => revokeAppleAuthorization(code, account.appleSub, config, fetchImpl);
}

export default {
  async fetch(request: Request, env: WorkerEnv): Promise<Response> {
    if (!env.DB) {
      return Response.json(
        { error: 'D1 binding DB is not configured. Create the database and set it in wrangler.toml.' },
        { status: 503 },
      );
    }
    const audience = env.APPLE_AUDIENCE || APPLE_AUDIENCE;
    const allowDev = env.ALLOW_DEV_AUTH === '1';
    return handleSyncRequest(request, {
      db: new D1SyncDb(env.DB),
      identity: createIdentityResolver({ allowDev, appleAudience: audience }),
      config: { devSignIn: allowDev, mode: 'cloud', appleAudience: audience },
      ai: aiOptions(env),
      appleRevoke: appleRevokeOption(env, audience),
    });
  },
};
