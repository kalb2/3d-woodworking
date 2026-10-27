import { D1SyncDb, type D1Like } from './d1Db.ts';
import { handleSyncRequest } from './handler.ts';
import { createIdentityResolver } from './identity.ts';
import { APPLE_AUDIENCE } from './types.ts';
import type { RateLimiter } from '../ai/aiHandler.ts';
import { mockDescribe } from '../ai/mock.ts';

export interface WorkerEnv {
  DB?: D1Like;
  ALLOW_DEV_AUTH?: string;
  APPLE_AUDIENCE?: string;
  /** Describe it: secret. Without it the route answers "not set up". */
  AI_API_KEY?: string;
  /** OpenAI-compatible base URL (default https://api.x.ai/v1). */
  AI_BASE_URL?: string;
  /** Default grok-4.7. */
  AI_MODEL?: string;
  /** reasoning_effort sent with structured output (default "low" on xAI; "none" to omit). */
  AI_REASONING_EFFORT?: string;
  /** "1": canned bookshelf, no provider call (testing). */
  AI_MOCK?: string;
  /** Cloudflare rate-limit binding ([[ratelimits]] in wrangler.toml); per-isolate fallback without it. */
  AI_LIMITER?: RateLimiter;
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
      ai: {
        config: {
          apiKey: env.AI_API_KEY,
          baseUrl: env.AI_BASE_URL,
          model: env.AI_MODEL,
          reasoningEffort: env.AI_REASONING_EFFORT,
          mock: env.AI_MOCK === '1',
          limiter: env.AI_LIMITER,
        },
        requireSignIn: true,
        mockSpec: mockDescribe,
      },
    });
  },
};
