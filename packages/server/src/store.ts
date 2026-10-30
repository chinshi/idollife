import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { RunState, ScheduleItem } from '@idollife/core';

export interface RunRecord {
  runId: string;
  revision: number;
  lastSyncAt: number;
  updatedAt: number;
  seed: string;
  run: RunState;
  schedule: ScheduleItem[];
}

type Db = Record<string, RunRecord>;

const DATA_DIR = process.env.DATA_DIR ?? join(process.cwd(), '.data');
const FILE = join(DATA_DIR, 'runs.json');

let cache: Db | null = null;

async function load(): Promise<Db> {
  if (cache) return cache;
  try {
    const raw = await readFile(FILE, 'utf8');
    cache = JSON.parse(raw) as Db;
  } catch {
    cache = {};
  }
  return cache;
}

async function flush(db: Db): Promise<void> {
  await mkdir(DATA_DIR, { recursive: true });
  await writeFile(FILE, JSON.stringify(db, null, 2), 'utf8');
}

export async function getRun(id: string): Promise<RunRecord | undefined> {
  const db = await load();
  return db[id];
}

export async function putRun(rec: RunRecord): Promise<void> {
  const db = await load();
  db[rec.runId] = rec;
  await flush(db);
}

export async function listRuns(): Promise<RunRecord[]> {
  const db = await load();
  return Object.values(db);
}

export function dataFile(): string {
  return FILE;
}
