import { START_MONEY, STAGE_REACHED_KEY, derivedStageSeq, migrateEquipItem } from '@idollife/core';
import type { EquipItem, EquipSlot, InventoryEntry, RunState, ScheduleItem } from '@idollife/core';

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

/**
 * 固有属性迁移（T-016d）：T-016c 之前的旧档，身高/样貌存的是 40–80 内部分值，
 * 直接显示会出「42cm」这种错乱。旧区间与新区间不重叠，可无歧义换算：
 * - 身高 < 145 → 旧分值，线性映射到 145–180cm（40→145，80→180）
 * - 样貌 < 50 → 旧分值，线性映射到 50–100（40→50，80→100）
 * - 体重两版口径同为 40–80kg，不动
 */
function normalizeInnate(v: RunState['innate'] | undefined) {
  const base = v ?? { height: 160, weight: 60, appearance: 60 };
  const height = isNum(base.height)
    ? base.height < 145
      ? 145 + Math.round(((base.height - 40) * 35) / 40)
      : base.height
    : 160;
  const appearance = isNum(base.appearance)
    ? base.appearance < 50
      ? Math.round(50 + (base.appearance - 40) * 1.25)
      : base.appearance
    : 60;
  const weight = isNum(base.weight) ? base.weight : 60;
  return { height, weight, appearance };
}

/** T-019：旧 shop 的 EquipItem 列表 → 新背包条目（按名称映射新装备表；找不到保留 legacy） */
function normalizeInventory(v: unknown): InventoryEntry[] {
  if (!Array.isArray(v)) return [];
  return v.map((raw, idx) => {
    const it = (raw ?? {}) as Partial<InventoryEntry> & Partial<EquipItem>;
    if (typeof it.itemId === 'string' && isNum(it.count)) {
      return {
        id: typeof it.id === 'string' && it.id ? it.id : `inv-${idx}`,
        itemId: it.itemId,
        count: it.count,
        ...(it.legacy ? { legacy: it.legacy } : {}),
      };
    }
    if (it.name && it.affix && it.rarity) return migrateEquipItem(it as EquipItem, idx);
    return { id: `inv-${idx}`, itemId: '', count: 1 };
  });
}

/** T-019：装备槽只保留四槽的合法 id（旧档其它键丢弃，避免脏数据） */
function normalizeEquipped(v: unknown): RunState['equipped'] {
  const slots: EquipSlot[] = ['hair', 'outfit', 'shoes', 'accessory'];
  const src = (v ?? {}) as Record<string, unknown>;
  const out: RunState['equipped'] = {};
  for (const slot of slots) {
    const id = src[slot];
    if (typeof id === 'string' && id) out[slot] = id;
  }
  return out;
}

/** 把任意来源（本地存档 / 服务端回包 / 旧版本）的 run 补齐成完整结构 */
export function normalizeRun(run: RunState): RunState {
  const rawName = typeof run.name === 'string' ? run.name.trim() : '';
  const normalized: RunState = {
    ...run,
    // T-016：起名的档要把名字留住（否则读档就丢名字）；没名字就保持 undefined
    name: rawName ? rawName : undefined,
    at: isNum(run.at) ? run.at : 0,
    startedAt: isNum(run.startedAt) ? run.startedAt : isNum(run.at) ? run.at : 0,
    stamina: isNum(run.stamina) ? run.stamina : 100,
    money: isNum(run.money) ? run.money : START_MONEY,
    stats: run.stats ?? { vocal: 0, dance: 0, acting: 0, talk: 0 },    axes: run.axes ?? { self: 50, others: 50, fit: 50 },
    mood: isNum(run.mood) ? run.mood : 70,
    satiety: isNum(run.satiety) ? run.satiety : 70,
    innate: normalizeInnate(run.innate),
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
    // T-019：旧档 inventory 是旧 shop 的 EquipItem，读档时按名称映射到新装备表（映射不到保留 legacy）
    inventory: normalizeInventory(run.inventory),
    equipped: normalizeEquipped(run.equipped),
    flags: run.flags ?? {},
    pendingEvent: run.pendingEvent ?? null,
    eventQueue: run.eventQueue ?? [],
    log: Array.isArray(run.log) ? run.log : [],
  };

  // T-018：旧档没有 stage:reached 时，按「满足进入条件的最高阶段」推导写回（不改任何数值）
  if (typeof normalized.flags[STAGE_REACHED_KEY] === 'number') return normalized;
  return {
    ...normalized,
    flags: { ...normalized.flags, [STAGE_REACHED_KEY]: derivedStageSeq(normalized) },
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
