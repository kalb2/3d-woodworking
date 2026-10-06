import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { MemorySyncDb } from '../src/sync/memoryDb.ts';
import type { Account, SyncRecord } from '../src/sync/types.ts';

export class FileSyncDb extends MemorySyncDb {
  private readonly filePath: string;
  private chain: Promise<void> = Promise.resolve();

  constructor(filePath: string) {
    super();
    this.filePath = filePath;
  }

  static async open(filePath: string): Promise<FileSyncDb> {
    const db = new FileSyncDb(filePath);
    await db.load();
    return db;
  }

  private async load() {
    try {
      const raw = await readFile(this.filePath, 'utf8');
      this.restore(JSON.parse(raw) as Parameters<MemorySyncDb['restore']>[0]);
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code !== 'ENOENT') throw error;
    }
  }

  private persist() {
    this.chain = this.chain.then(async () => {
      await mkdir(path.dirname(this.filePath), { recursive: true });
      await writeFile(this.filePath, JSON.stringify(this.snapshot()));
    });
    return this.chain;
  }

  override async createAccount(account: Account) {
    await super.createAccount(account);
    await this.persist();
  }

  override async deleteAccount(accountId: string) {
    await super.deleteAccount(accountId);
    await this.persist();
  }

  override async createSession(token: string, accountId: string, createdAt: number) {
    await super.createSession(token, accountId, createdAt);
    await this.persist();
  }

  override async deleteSession(token: string) {
    await super.deleteSession(token);
    await this.persist();
  }

  override async deleteSessionsForAccount(accountId: string) {
    await super.deleteSessionsForAccount(accountId);
    await this.persist();
  }

  override async upsertRecord(accountId: string, record: SyncRecord) {
    const saved = await super.upsertRecord(accountId, record);
    await this.persist();
    return saved;
  }
}
