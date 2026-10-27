import { hashPassword, normalizeUsername, passwordProblem, verifyPassword } from './password.ts';
import type { Account, AuthConfig, IdentityResolver, SyncDatabase, SyncRecord } from './types.ts';
import { API_PREFIX } from './types.ts';
import { handleAiDescribe, type AiConfig } from '../ai/aiHandler.ts';
import type { AiSpec } from '../ai/spec.ts';
import type { AppleRevokeResult } from './appleRevoke.ts';

export interface SyncHandlerOptions {
  db: SyncDatabase;
  identity: IdentityResolver;
  config: AuthConfig;
  /** "Describe it" (POST /ai/describe). Absent: the route answers "not set up". */
  ai?: { config: AiConfig; requireSignIn: boolean; mockSpec?: (prompt: string, current: AiSpec | null) => AiSpec };
  /**
   * Sign in with Apple token revocation on account deletion (see appleRevoke.ts).
   * Called for Apple accounts with the authorization code the app sends in the
   * DELETE /me body. Absent (dev server): deletion skips revocation.
   */
  appleRevoke?: (account: Account, authorizationCode: string | undefined) => Promise<AppleRevokeResult>;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'access-control-allow-origin': '*',
      'access-control-allow-headers': 'authorization, content-type',
      'access-control-allow-methods': 'GET, POST, PUT, DELETE, OPTIONS',
    },
  });
}

function bearer(request: Request): string | null {
  const header = request.headers.get('authorization') || '';
  const match = /^Bearer\s+(.+)$/i.exec(header);
  return match?.[1] ?? null;
}

function isRecord(value: unknown): value is SyncRecord {
  if (!value || typeof value !== 'object') return false;
  const record = value as SyncRecord;
  if (typeof record.id !== 'string' || typeof record.updatedAt !== 'number') return false;
  if (record.deletedAt !== undefined && typeof record.deletedAt !== 'number') return false;
  if (record.project) {
    if (record.project.id !== record.id) return false;
    if (typeof record.project.name !== 'string' || !Array.isArray(record.project.objects)) return false;
  }
  return Boolean(record.project) || typeof record.deletedAt === 'number';
}

async function requireAccount(request: Request, db: SyncDatabase): Promise<Account | Response> {
  const token = bearer(request);
  if (!token) return json({ error: 'Sign in required.' }, 401);
  const account = await db.accountForSession(token);
  if (!account) return json({ error: 'Session expired.' }, 401);
  return account;
}

export async function handleSyncRequest(request: Request, options: SyncHandlerOptions): Promise<Response> {
  if (request.method === 'OPTIONS') return json({ ok: true });
  const url = new URL(request.url);
  if (!url.pathname.startsWith(API_PREFIX)) return json({ error: 'Not found.' }, 404);
  const path = url.pathname.slice(API_PREFIX.length) || '/';
  const { db, identity, config } = options;

  if (request.method === 'GET' && path === '/auth/config') return json(config);

  if (request.method === 'POST' && path === '/ai/describe') {
    const ai = options.ai;
    if (!ai) return json({ error: 'Describe it isn\'t set up on the server yet.', code: 'not_configured' }, 503);
    const token = bearer(request);
    const account = token ? await db.accountForSession(token) : null;
    return handleAiDescribe(request, ai.config, {
      accountId: account?.id ?? null,
      requireSignIn: ai.requireSignIn,
      ip: request.headers.get('cf-connecting-ip'),
    }, json, ai.mockSpec);
  }

  if (request.method === 'POST' && (path === '/auth/signup' || path === '/auth/login')) {
    let body: { username?: string; password?: string };
    try {
      body = await request.json() as { username?: string; password?: string };
    } catch {
      return json({ error: 'Expected JSON.' }, 400);
    }
    const username = normalizeUsername(body.username || '');
    if (typeof username !== 'string') return json({ error: username.error }, 400);
    const password = body.password || '';
    const passwordError = passwordProblem(password);
    if (passwordError) return json({ error: passwordError }, 400);

    if (path === '/auth/signup') {
      const taken = await db.findAccountByUsername(username);
      if (taken) return json({ error: 'That username is taken.' }, 409);
      const account: Account = {
        id: crypto.randomUUID(),
        appleSub: `name:${username}`,
        email: '',
        username,
        displayName: username,
        provider: 'password',
        createdAt: Date.now(),
      };
      await db.createAccount(account, await hashPassword(password));
      const token = crypto.randomUUID();
      await db.createSession(token, account.id, Date.now());
      return json({ token, account });
    }

    const account = await db.findAccountByUsername(username);
    const storedHash = account ? await db.passwordHashFor(account.id) : null;
    const matches = storedHash ? await verifyPassword(password, storedHash) : false;
    if (!account || !matches) return json({ error: 'Username or password is wrong.' }, 401);
    const token = crypto.randomUUID();
    await db.createSession(token, account.id, Date.now());
    return json({ token, account });
  }

  if (request.method === 'POST' && path === '/auth/apple') {
    let body: { identityToken?: string; email?: string; displayName?: string };
    try {
      body = await request.json() as { identityToken?: string; email?: string; displayName?: string };
    } catch {
      return json({ error: 'Expected JSON.' }, 400);
    }
    const resolved = await identity.resolve({
      identityToken: body.identityToken || '',
      email: body.email,
      displayName: body.displayName,
    });
    if ('error' in resolved) return json({ error: resolved.error }, resolved.status);
    let account = await db.findAccountBySub(resolved.appleSub);
    if (!account) {
      if (!resolved.email) {
        return json({ error: 'Apple did not share an email. Sign in again and allow email.', status: 400 });
      }
      account = {
        id: crypto.randomUUID(),
        appleSub: resolved.appleSub,
        email: resolved.email,
        username: '',
        displayName: resolved.displayName,
        provider: resolved.provider,
        createdAt: Date.now(),
      };
      await db.createAccount(account);
    }
    const token = crypto.randomUUID();
    await db.createSession(token, account.id, Date.now());
    return json({ token, account });
  }

  if (request.method === 'POST' && path === '/auth/signout') {
    const token = bearer(request);
    if (token) await db.deleteSession(token);
    return json({ ok: true });
  }

  if (request.method === 'GET' && path === '/me') {
    const account = await requireAccount(request, db);
    if (account instanceof Response) return account;
    return json({ account });
  }

  if (request.method === 'DELETE' && path === '/me') {
    const account = await requireAccount(request, db);
    if (account instanceof Response) return account;
    let authorizationCode: string | undefined;
    try {
      const raw = await request.text();
      if (raw) {
        const body = JSON.parse(raw) as { authorizationCode?: unknown };
        if (typeof body.authorizationCode === 'string') authorizationCode = body.authorizationCode;
      }
    } catch {
      // No body or not JSON: delete without revoking.
    }
    // Revoke first (it needs nothing from the database), but never let it block deletion.
    let appleRevoked = false;
    if (account.provider === 'apple' && options.appleRevoke) {
      const result = await options.appleRevoke(account, authorizationCode).catch(() => null);
      appleRevoked = Boolean(result?.revoked);
      if (result && !result.revoked) console.warn(`apple revoke skipped: ${result.reason}`);
    }
    await db.deleteSessionsForAccount(account.id);
    await db.deleteAccount(account.id);
    let message = 'Workbench projects and this session were deleted.';
    if (account.provider === 'apple') {
      message = appleRevoked
        ? 'Workbench projects and this session were deleted, and The Workbench was removed from Sign in with Apple.'
        : 'Workbench projects and this session were deleted. To stop using Sign in with Apple here, open Settings → your name → Sign in with Apple.';
    }
    return json({ deleted: true, appleRevoked, message });
  }

  if (request.method === 'GET' && path === '/projects') {
    const account = await requireAccount(request, db);
    if (account instanceof Response) return account;
    return json({ records: await db.listRecords(account.id) });
  }

  if (request.method === 'PUT' && path === '/projects') {
    const account = await requireAccount(request, db);
    if (account instanceof Response) return account;
    const raw = await request.text();
    if (raw.length > 2_000_000) return json({ error: 'Sync payload is too large.' }, 413);
    let body: { records?: unknown };
    try {
      body = JSON.parse(raw) as { records?: unknown };
    } catch {
      return json({ error: 'Expected JSON.' }, 400);
    }
    if (!Array.isArray(body.records) || !body.records.every(isRecord)) {
      return json({ error: 'Each record needs an id, updatedAt, and a project or deletedAt.' }, 400);
    }
    for (const record of body.records) await db.upsertRecord(account.id, record);
    return json({ records: await db.listRecords(account.id) });
  }

  return json({ error: 'Not found.' }, 404);
}
