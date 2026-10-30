import type { RunState, ScheduleItem } from '@idollife/core';

const KEY = 'idollife:save:v1';

export interface SaveV1 {
  version: 1;
  runId: string;
  updatedAt: number;
  seed: string;
  run: RunState;
  schedule: ScheduleItem[];
}

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

function newRunId(): string {
  return `run-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/** 读档：任何异常都当没存档，绝不崩 */
export function loadSave(): SaveV1 | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as Partial<SaveV1>;

    if (data.version !== 1) return null;
    if (!data.run || !isNum(data.run.at) || !isNum(data.run.stamina)) return null;
    if (!data.run.stats || !Array.isArray(data.run.log)) return null;
    if (!Array.isArray(data.schedule)) return null;

    return {
      version: 1,
      runId: typeof data.runId === 'string' && data.runId ? data.runId : newRunId(),
      updatedAt: isNum(data.updatedAt) ? data.updatedAt : 0,
      seed: typeof data.seed === 'string' ? data.seed : 'run-demo',
      run: data.run as RunState,
      schedule: data.schedule as ScheduleItem[],
    };
  } catch {
    return null;
  }
}

export function writeSave(save: SaveV1): boolean {
  try {
    localStorage.setItem(KEY, JSON.stringify(save));
    return true;
  } catch {
    return false;
  }
}

export function clearSave(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* 忽略 */
  }
}

export function createSave(run: RunState, seed: string): SaveV1 {
  return {
    version: 1,
    runId: newRunId(),
    updatedAt: 0,
    seed,
    run,
    schedule: [],
  };
}

export const SAVE_KEY = KEY;
