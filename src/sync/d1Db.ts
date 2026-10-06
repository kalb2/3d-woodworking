import type { Account, SyncDatabase, SyncRecord } from './types.ts';

interface D1Statement {
  bind(...values: unknown[]): D1Statement;
  first<T>(): Promise<T | null>;
  all<T>(): Promise<{ results: T[] }>;
  run(): Promise<unknown>;
}

export interface D1Like {
  prepare(query: string): D1Statement;
}

interface AccountRow {
  id: string;
  apple_sub: string;
  email: string;
  display_name: string;
  provider: Account['provider'];
  created_at: number;
}

interface RecordRow {
  project_id: string;
  updated_at: number;
  deleted_at: number | null;
  payload: string | null;
}

function accountFromRow(row: AccountRow): Account {
  return {
    id: row.id,
    appleSub: row.apple_sub,
    email: row.email,
    displayName: row.display_name,
    provider: row.provider,
    createdAt: row.created_at,
  };
}

export class D1SyncDb implements SyncDatabase {
  private readonly db: D1Like;

  constructor(db: D1Like) {
    this.db = db;
  }

  async findAccountBySub(appleSub: string): Promise<Account | null> {
    const row = await this.db.prepare(
      'SELECT id, apple_sub, email, display_name, provider, created_at FROM accounts WHERE apple_sub = ?',
    ).bind(appleSub).first<AccountRow>();
    return row ? accountFromRow(row) : null;
  }

  async createAccount(account: Account): Promise<void> {
    await this.db.prepare(
      'INSERT INTO accounts (id, apple_sub, email, display_name, provider, created_at) VALUES (?, ?, ?, ?, ?, ?)',
    ).bind(account.id, account.appleSub, account.email, account.displayName, account.provider, account.createdAt).run();
  }

  async deleteAccount(accountId: string): Promise<void> {
    await this.db.prepare('DELETE FROM project_records WHERE account_id = ?').bind(accountId).run();
    await this.db.prepare('DELETE FROM accounts WHERE id = ?').bind(accountId).run();
  }

  async createSession(token: string, accountId: string, createdAt: number): Promise<void> {
    await this.db.prepare(
      'INSERT INTO sessions (token, account_id, created_at) VALUES (?, ?, ?)',
    ).bind(token, accountId, createdAt).run();
  }

  async accountForSession(token: string): Promise<Account | null> {
    const row = await this.db.prepare(
      `SELECT a.id, a.apple_sub, a.email, a.display_name, a.provider, a.created_at
       FROM sessions s JOIN accounts a ON a.id = s.account_id WHERE s.token = ?`,
    ).bind(token).first<AccountRow>();
    return row ? accountFromRow(row) : null;
  }

  async deleteSession(token: string): Promise<void> {
    await this.db.prepare('DELETE FROM sessions WHERE token = ?').bind(token).run();
  }

  async deleteSessionsForAccount(accountId: string): Promise<void> {
    await this.db.prepare('DELETE FROM sessions WHERE account_id = ?').bind(accountId).run();
  }

  async listRecords(accountId: string): Promise<SyncRecord[]> {
    const result = await this.db.prepare(
      'SELECT project_id, updated_at, deleted_at, payload FROM project_records WHERE account_id = ?',
    ).bind(accountId).all<RecordRow>();
    return result.results.map((row) => ({
      id: row.project_id,
      updatedAt: row.updated_at,
      deletedAt: row.deleted_at ?? undefined,
      project: row.payload ? JSON.parse(row.payload) as SyncRecord['project'] : undefined,
    }));
  }

  async upsertRecord(accountId: string, record: SyncRecord): Promise<SyncRecord> {
    const existing = await this.db.prepare(
      'SELECT updated_at FROM project_records WHERE account_id = ? AND project_id = ?',
    ).bind(accountId, record.id).first<{ updated_at: number }>();
    if (existing && existing.updated_at > record.updatedAt) {
      const kept = await this.listRecords(accountId);
      return kept.find((item) => item.id === record.id) ?? record;
    }
    const payload = record.project ? JSON.stringify(record.project) : null;
    await this.db.prepare(
      `INSERT INTO project_records (account_id, project_id, updated_at, deleted_at, payload)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(account_id, project_id) DO UPDATE SET
         updated_at = excluded.updated_at,
         deleted_at = excluded.deleted_at,
         payload = excluded.payload`,
    ).bind(accountId, record.id, record.updatedAt, record.deletedAt ?? null, payload).run();
    return record;
  }
}
