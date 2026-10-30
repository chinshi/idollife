import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { RunRecord, Store } from './types.js';

type Db = Record<string, RunRecord>;

const DATA_DIR = process.env.DATA_DIR ?? join(process.cwd(), '.data');
const FILE = join(DATA_DIR, 'runs.json');

/** 本地 JSON 文件存储：零依赖，用于开发与无库环境 */
export class FileStore implements Store {
  kind = 'file';
  private cache: Db | null = null;

  private async load(): Promise<Db> {
    if (this.cache) return this.cache;
    try {
      const raw = await readFile(FILE, 'utf8');
      this.cache = JSON.parse(raw) as Db;
    } catch {
      this.cache = {};
    }
    return this.cache;
  }

  private async flush(db: Db): Promise<void> {
    await mkdir(DATA_DIR, { recursive: true });
    await writeFile(FILE, JSON.stringify(db, null, 2), 'utf8');
  }

  async getRun(id: string): Promise<RunRecord | undefined> {
    return (await this.load())[id];
  }

  async putRun(rec: RunRecord): Promise<void> {
    const db = await this.load();
    db[rec.runId] = rec;
    await this.flush(db);
  }

  async listRuns(): Promise<RunRecord[]> {
    return Object.values(await this.load());
  }

  async countRuns(): Promise<number> {
    return Object.keys(await this.load()).length;
  }
}
