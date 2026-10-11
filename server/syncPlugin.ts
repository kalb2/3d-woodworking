import type { IncomingMessage, ServerResponse } from 'node:http';
import path from 'node:path';
import type { Plugin } from 'vite';
import { FileSyncDb } from './fileSyncDb.ts';
import { handleSyncRequest } from '../src/sync/handler.ts';
import { createIdentityResolver } from '../src/sync/identity.ts';
import { APPLE_AUDIENCE } from '../src/sync/types.ts';

function headersFrom(req: IncomingMessage): Headers {
  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (typeof value === 'string') headers.set(key, value);
    else if (Array.isArray(value)) headers.set(key, value.join(', '));
  }
  return headers;
}

function toWebRequest(req: IncomingMessage): Promise<Request> {
  const host = req.headers.host || '127.0.0.1';
  const url = `http://${host}${req.url || '/api/v1'}`;
  const method = req.method || 'GET';
  if (method === 'GET' || method === 'HEAD') {
    return Promise.resolve(new Request(url, { method, headers: headersFrom(req) }));
  }
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => {
      resolve(new Request(url, {
        method,
        headers: headersFrom(req),
        body: Buffer.concat(chunks),
      }));
    });
    req.on('error', reject);
  });
}

/**
 * Dev sync API on the Vite server. Accounts and projects live in .data/sync-dev.json
 * so two devices pointed at this machine share one account. No Apple secret is required
 * for dev sign-in. Real Apple tokens are still verified when they are presented.
 */
export function syncDevPlugin(): Plugin {
  const filePath = path.resolve('.data/sync-dev.json');
  let opening: Promise<FileSyncDb> | null = null;
  const database = () => {
    opening ??= FileSyncDb.open(filePath);
    return opening;
  };
  const identity = createIdentityResolver({ allowDev: true, appleAudience: APPLE_AUDIENCE });

  return {
    name: 'workbench-sync-dev',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = req.url || '';
        if (!url.startsWith('/api/v1')) {
          next();
          return;
        }
        void handle(req, res);
      });
    },
  };

  async function handle(req: IncomingMessage, res: ServerResponse) {
    try {
      const db = await database();
      const response = await handleSyncRequest(await toWebRequest(req), {
        db,
        identity,
        config: { devSignIn: true, mode: 'dev', appleAudience: APPLE_AUDIENCE },
      });
      res.statusCode = response.status;
      response.headers.forEach((value, key) => res.setHeader(key, value));
      res.end(Buffer.from(await response.arrayBuffer()));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Sync dev server failed.';
      res.statusCode = 500;
      res.setHeader('content-type', 'application/json; charset=utf-8');
      res.end(JSON.stringify({ error: message }));
    }
  }
}
