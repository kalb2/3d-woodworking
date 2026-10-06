import { D1SyncDb, type D1Like } from './d1Db.ts';
import { handleSyncRequest } from './handler.ts';
import { createIdentityResolver } from './identity.ts';
import { APPLE_AUDIENCE } from './types.ts';

export interface WorkerEnv {
  DB?: D1Like;
  ALLOW_DEV_AUTH?: string;
  APPLE_AUDIENCE?: string;
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
    });
  },
};
