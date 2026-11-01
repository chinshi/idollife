import { START_MONEY } from '@idollife/core';
import type { RunState, ScheduleItem } from '@idollife/core';

const KEY = 'idollife:save:v1';

export interface SaveV1 {
  version: 1;
  runId: string;
  /** 与服务端对齐的版本号；本地新建为 0 */
  revision: number;
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
const EMPTY_FANS = {
  byType: { stage: 0, gachi: 0, music: 0, live: 0, growth: 0, power: 0 },
  loyalty: { casual: 0, dd: 0, group: 0, solo: 0 },
  affection: { stage: 0, gachi: 0, music: 0, live: 0, growth: 0, power: 0 },
};

/** 把任意来源（本地存档 / 服务端回包 / 旧版本）的 run 补齐成完整结构 */
export function normalizeRun(run: RunState): RunState {
  return {
    ...run,
    at: isNum(run.at) ? run.at : 0,
    startedAt: isNum(run.startedAt) ? run.startedAt : isNum(run.at) ? run.at : 0,
    stamina: isNum(run.stamina) ? run.stamina : 100,
    money: isNum(run.money) ? run.money : START_MONEY,
    stats: run.stats ?? { vocal: 0, dance: 0, acting: 0, talk: 0 },
    axes: run.axes ?? { self: 50, others: 50, fit: 50 },
    fans: run.fans ?? EMPTY_FANS,
    debuted: run.debuted ?? false,
    parties: run.parties ?? [],
    activePartyId: run.activePartyId ?? null,
    inventory: run.inventory ?? [],
    equipped: run.equipped ?? {},
    flags: run.flags ?? {},
    pendingEvent: run.pendingEvent ?? null,
    eventQueue: run.eventQueue ?? [],
    log: Array.isArray(run.log) ? run.log : [],
  };
}

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
      revision: isNum(data.revision) ? data.revision : 0,
      updatedAt: isNum(data.updatedAt) ? data.updatedAt : 0,
      seed: typeof data.seed === 'string' ? data.seed : 'run-demo',
      run: normalizeRun(data.run as RunState),
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
    revision: 0,
    updatedAt: 0,
    seed,
    run,
    schedule: [],
  };
}

export const SAVE_KEY = KEY;
