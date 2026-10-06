import type { Account, SyncDatabase, SyncRecord } from './types.ts';
import { mergeRecords } from './merge.ts';

export class MemorySyncDb implements SyncDatabase {
  protected accounts = new Map<string, Account>();
  protected subs = new Map<string, string>();
  protected sessions = new Map<string, string>();
  protected records = new Map<string, SyncRecord[]>();

  findAccountBySub(appleSub: string): Promise<Account | null> {
    const id = this.subs.get(appleSub);
    return Promise.resolve(id ? this.accounts.get(id) ?? null : null);
  }

  createAccount(account: Account): Promise<void> {
    this.accounts.set(account.id, account);
    this.subs.set(account.appleSub, account.id);
    return Promise.resolve();
  }

  deleteAccount(accountId: string): Promise<void> {
    const account = this.accounts.get(accountId);
    if (account) this.subs.delete(account.appleSub);
    this.accounts.delete(accountId);
    this.records.delete(accountId);
    return Promise.resolve();
  }

  createSession(token: string, accountId: string, _createdAt: number): Promise<void> {
    this.sessions.set(token, accountId);
    return Promise.resolve();
  }

  accountForSession(token: string): Promise<Account | null> {
    const accountId = this.sessions.get(token);
    return Promise.resolve(accountId ? this.accounts.get(accountId) ?? null : null);
  }

  deleteSession(token: string): Promise<void> {
    this.sessions.delete(token);
    return Promise.resolve();
  }

  deleteSessionsForAccount(accountId: string): Promise<void> {
    for (const [token, id] of this.sessions) {
      if (id === accountId) this.sessions.delete(token);
    }
    return Promise.resolve();
  }

  listRecords(accountId: string): Promise<SyncRecord[]> {
    return Promise.resolve([...(this.records.get(accountId) ?? [])]);
  }

  upsertRecord(accountId: string, record: SyncRecord): Promise<SyncRecord> {
    const current = this.records.get(accountId) ?? [];
    const merged = mergeRecords(current, [record]);
    this.records.set(accountId, merged);
    const saved = merged.find((item) => item.id === record.id) ?? record;
    return Promise.resolve(saved);
  }

  protected snapshot() {
    return {
      accounts: [...this.accounts.values()],
      sessions: [...this.sessions.entries()],
      records: [...this.records.entries()],
    };
  }

  protected restore(data: {
    accounts?: Account[];
    sessions?: [string, string][];
    records?: [string, SyncRecord[]][];
  }) {
    this.accounts.clear();
    this.subs.clear();
    this.sessions.clear();
    this.records.clear();
    for (const account of data.accounts ?? []) {
      this.accounts.set(account.id, account);
      this.subs.set(account.appleSub, account.id);
    }
    for (const [token, accountId] of data.sessions ?? []) this.sessions.set(token, accountId);
    for (const [accountId, records] of data.records ?? []) this.records.set(accountId, records);
  }
}
