import { START_MONEY } from '@idollife/core';
import type { RunState, ScheduleItem } from '@idollife/core';

/** 当前存档版本；v1 只读兼容，读入时迁移为 v2 */
const KEY = 'idollife:save:v2';
const LEGACY_KEY = 'idollife:save:v1';
const BAK_KEY = 'idollife:save:v2.bak';

interface SavePayload {
  runId: string;
  /** 与服务端对齐的版本号；本地新建为 0 */
  revision: number;
  updatedAt: number;
  seed: string;
  run: RunState;
  schedule: ScheduleItem[];
}

/** 旧版存档（只读迁移路径） */
export interface SaveV1 extends SavePayload {
  version: 1;
}

/** 当前存档结构 */
export interface SaveV2 extends SavePayload {
  version: 2;
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
    mood: isNum(run.mood) ? run.mood : 70,
    satiety: isNum(run.satiety) ? run.satiety : 70,
    innate: run.innate ?? { height: 60, weight: 60, appearance: 60, proportion: 60 },
    traits: run.traits ?? {
      kind: 0,
      lead: 0,
      coop: 0,
      independent: 0,
      ambitious: 0,
      passion: 0,
    },
    negatives: run.negatives ?? {
      stress: 0,
      restless: 0,
      fatigue: 0,
      desire: 0,
      scandal: 0,
    },
    proficiency: run.proficiency ?? { stage_prof: 0, song_prof: 0, choreo_prof: 0 },
    fans: run.fans ?? EMPTY_FANS,
    debuted: run.debuted ?? false,
    parties: run.parties ?? [],
    friends: (run.friends ?? []).map((f) => ({
      ...f,
      partyId: f.partyId ?? null,
      cooldownUntil: f.cooldownUntil ?? 0,
    })),
    activePartyId: run.activePartyId ?? null,
    inventory: run.inventory ?? [],
    equipped: run.equipped ?? {},
    flags: run.flags ?? {},
    pendingEvent: run.pendingEvent ?? null,
    eventQueue: run.eventQueue ?? [],
    log: Array.isArray(run.log) ? run.log : [],
  };
}

/**
 * D-012：把 v1 / v2 存档统一迁移成 v2。
 * 纯函数，不碰存储；数据不合法时返回 null。
 */
export function migrateSave(data: unknown): SaveV2 | null {
  if (!data || typeof data !== 'object') return null;
  const raw = data as Partial<SaveV1 | SaveV2>;
  if (raw.version !== 1 && raw.version !== 2) return null;
  if (!raw.run || !isNum(raw.run.at) || !isNum(raw.run.stamina)) return null;
  if (!raw.run.stats || !Array.isArray(raw.run.log)) return null;
  if (!Array.isArray(raw.schedule)) return null;

  return {
    version: 2,
    runId: typeof raw.runId === 'string' && raw.runId ? raw.runId : newRunId(),
    revision: isNum(raw.revision) ? raw.revision : 0,
    updatedAt: isNum(raw.updatedAt) ? raw.updatedAt : 0,
    seed: typeof raw.seed === 'string' ? raw.seed : 'run-demo',
    run: normalizeRun(raw.run as RunState),
    schedule: raw.schedule as ScheduleItem[],
  };
}

function readRaw(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function loadSave(): SaveV2 | null {
  // 优先读 v2；v2 损坏时回退到 v1 迁移
  const current = readRaw(KEY);
  if (current) {
    try {
      const migrated = migrateSave(JSON.parse(current));
      if (migrated) return migrated;
    } catch {
      /* 继续尝试旧档 */
    }
  }

  const legacy = readRaw(LEGACY_KEY);
  if (!legacy) return null;
  try {
    return migrateSave(JSON.parse(legacy));
  } catch {
    return null;
  }
}

export function writeSave(save: SaveV2): boolean {
  try {
    // 写档前把上一版原样留一份 .bak；始终只保留最近一份
    const previous = readRaw(KEY) ?? readRaw(LEGACY_KEY);
    if (previous) localStorage.setItem(BAK_KEY, previous);
    localStorage.setItem(KEY, JSON.stringify(save));
    return true;
  } catch {
    return false;
  }
}

export function clearSave(): void {
  try {
    localStorage.removeItem(KEY);
    localStorage.removeItem(LEGACY_KEY);
    localStorage.removeItem(BAK_KEY);
  } catch {
    /* 忽略 */
  }
}

export function createSave(run: RunState, seed: string): SaveV2 {
  return {
    version: 2,
    runId: newRunId(),
    revision: 0,
    updatedAt: 0,
    seed,
    run,
    schedule: [],
  };
}

export const SAVE_KEY = KEY;
export const LEGACY_SAVE_KEY = LEGACY_KEY;
export const SAVE_BAK_KEY = BAK_KEY;
