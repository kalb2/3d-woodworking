import type { Account, SyncDatabase, SyncRecord } from './types.ts';
import { mergeRecords } from './merge.ts';

export class MemorySyncDb implements SyncDatabase {
  protected accounts = new Map<string, Account>();
  protected subs = new Map<string, string>();
  protected usernames = new Map<string, string>();
  protected passwordHashes = new Map<string, string>();
  protected sessions = new Map<string, string>();
  protected records = new Map<string, SyncRecord[]>();

  findAccountBySub(appleSub: string): Promise<Account | null> {
    const id = this.subs.get(appleSub);
    return Promise.resolve(id ? this.accounts.get(id) ?? null : null);
  }

  findAccountByUsername(username: string): Promise<Account | null> {
    const id = this.usernames.get(username);
    return Promise.resolve(id ? this.accounts.get(id) ?? null : null);
  }

  passwordHashFor(accountId: string): Promise<string | null> {
    return Promise.resolve(this.passwordHashes.get(accountId) ?? null);
  }

  createAccount(account: Account, passwordHash?: string | null): Promise<void> {
    this.accounts.set(account.id, account);
    if (account.appleSub) this.subs.set(account.appleSub, account.id);
    if (account.username) this.usernames.set(account.username, account.id);
    if (passwordHash) this.passwordHashes.set(account.id, passwordHash);
    return Promise.resolve();
  }

  deleteAccount(accountId: string): Promise<void> {
    const account = this.accounts.get(accountId);
    if (account) {
      this.subs.delete(account.appleSub);
      if (account.username) this.usernames.delete(account.username);
    }
    this.passwordHashes.delete(accountId);
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
      passwordHashes: [...this.passwordHashes.entries()],
    };
  }

  protected restore(data: {
    accounts?: Account[];
    sessions?: [string, string][];
    records?: [string, SyncRecord[]][];
    passwordHashes?: [string, string][];
  }) {
    this.accounts.clear();
    this.subs.clear();
    this.usernames.clear();
    this.passwordHashes.clear();
    this.sessions.clear();
    this.records.clear();
    for (const account of data.accounts ?? []) {
      const stored = { ...account, username: account.username || '' };
      this.accounts.set(stored.id, stored);
      if (stored.appleSub) this.subs.set(stored.appleSub, stored.id);
      if (stored.username) this.usernames.set(stored.username, stored.id);
    }
    for (const [token, accountId] of data.sessions ?? []) this.sessions.set(token, accountId);
    for (const [accountId, records] of data.records ?? []) this.records.set(accountId, records);
    for (const [accountId, hash] of data.passwordHashes ?? []) this.passwordHashes.set(accountId, hash);
  }
}
