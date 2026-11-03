import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EQUIPS, createFans, effectiveStats } from '@idollife/core';
import type { RunState, ScheduleItem } from '@idollife/core';
import {
  LEGACY_SAVE_KEY,
  SAVE_BAK_KEY,
  SAVE_KEY,
  loadSave,
  normalizeRun,
  writeSave,
  type SaveV1,
  type SaveV2,
} from '../src/state/save';

const MIN = 60_000;
const T0 = Date.UTC(2026, 0, 1, 9, 0, 0);

class MemoryStorage {
  private data = new Map<string, string>();

  get length() {
    return this.data.size;
  }

  clear() {
    this.data.clear();
  }

  getItem(key: string) {
    return this.data.get(key) ?? null;
  }

  key(index: number) {
    return [...this.data.keys()][index] ?? null;
  }

  removeItem(key: string) {
    this.data.delete(key);
  }

  setItem(key: string, value: string) {
    this.data.set(key, String(value));
  }
}

function sampleRun(): RunState {
  return {
    at: T0 + 30 * MIN,
    startedAt: T0,
    stamina: 78,
    money: 4321,
    stats: { vocal: 31, dance: 22, acting: 13, talk: 9 },
    axes: { self: 51, others: 48, fit: 52 },
    mood: 55,
    satiety: 66,
    fans: createFans(120),
    debuted: true,
    parties: [],
    activePartyId: null,
    friends: [],
    inventory: [],
    equipped: {},
    flags: { 'ev:debut': true, 'task:task-dance-30:count': 1 },
    pendingEvent: null,
    eventQueue: [],
    log: [
      {
        at: T0 + 10 * MIN,
        actionId: 'vocal-karaoke',
        text: '练歌。',
        staminaDelta: -10,
        statDelta: { vocal: 2 },
        kind: 'action',
      },
    ],
  };
}

const schedule: ScheduleItem[] = [
  {
    id: 'v1-s1',
    actionId: 'vocal-karaoke',
    startAt: T0,
    endAt: T0 + 10 * MIN,
    done: true,
  },
];

beforeEach(() => {
  vi.stubGlobal('localStorage', new MemoryStorage());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('测试 C：存档 v1→v2 迁移与写档备份', () => {
  it('v1 样本迁移后可正常读入且数据不丢；写档后 .bak 为上一版', () => {
    const v1: SaveV1 = {
      version: 1,
      runId: 'run-v1-sample',
      revision: 7,
      updatedAt: 111,
      seed: 'seed-v1',
      run: sampleRun(),
      schedule,
    };
    localStorage.setItem(LEGACY_SAVE_KEY, JSON.stringify(v1));

    const loaded = loadSave();
    expect(loaded).not.toBeNull();
    expect(loaded?.version).toBe(2);
    expect(loaded?.runId).toBe(v1.runId);
    expect(loaded?.revision).toBe(v1.revision);
    expect(loaded?.seed).toBe(v1.seed);
    expect(loaded?.run.stats).toEqual(v1.run.stats);
    expect(loaded?.run.money).toBe(v1.run.money);
    expect(loaded?.run.mood).toBe(v1.run.mood);
    expect(loaded?.run.satiety).toBe(v1.run.satiety);
    // T-018：读档迁移会按推导补写 stage:reached（样本已出道 → seq4），其余 flags 原样保留
    expect(loaded?.run.flags).toEqual({ ...v1.run.flags, 'stage:reached': 4 });
    expect(loaded?.run.log).toEqual(v1.run.log);
    expect(loaded?.schedule).toEqual(v1.schedule);

    // 第一次写档：上一版是 v1，原样备份
    expect(writeSave(loaded!)).toBe(true);
    expect(localStorage.getItem(SAVE_BAK_KEY)).toBe(JSON.stringify(v1));
    expect(JSON.parse(localStorage.getItem(SAVE_KEY)!).version).toBe(2);

    // 第二次写档：.bak 被覆盖为上一版 v2，始终只保留最近一份
    const second: SaveV2 = {
      ...loaded!,
      revision: 8,
      updatedAt: 222,
      run: { ...loaded!.run, money: 9999 },
    };
    expect(writeSave(second)).toBe(true);
    expect(localStorage.getItem(SAVE_BAK_KEY)).toBe(JSON.stringify(loaded));
    expect(loadSave()).toEqual(second);
  });

  it('T-016：偶像名写档后可读回；空名读档归一为 undefined', () => {
    const base = sampleRun();
    const named: SaveV2 = {
      version: 2,
      runId: 'run-name',
      revision: 1,
      updatedAt: 1,
      seed: 'seed-name',
      run: { ...base, name: ' 小春 ' },
      schedule: [],
    };
    expect(writeSave(named)).toBe(true);
    expect(loadSave()?.run.name).toBe('小春');

    const blank: SaveV2 = { ...named, run: { ...base, name: '   ' } };
    expect(writeSave(blank)).toBe(true);
    expect(loadSave()?.run.name).toBeUndefined();
  });

  it('T-019：旧 shop 装备读档迁移（按名称映射新表；映射不到保留 legacy，不丢装备）', () => {
    const known = EQUIPS.find((e) => e.name === '素色练习服');
    expect(known).toBeTruthy();
    const oldInventory: unknown[] = [
      // 旧 shop 的 EquipItem（T-019 之前的结构）
      { id: 'w0-c0', name: '素色练习服', slot: 'outfit', rarity: 'common', price: 800, affix: { stat: 'dance', value: 2 } },
      { id: 'w0-c9', name: '一件不存在的旧衣服', slot: 'outfit', rarity: 'rare', price: 900, affix: { stat: 'vocal', value: 4 } },
    ];
    const oldRun = {
      ...sampleRun(),
      inventory: oldInventory,
      equipped: { outfit: 'w0-c9' },
    } as unknown as RunState;

    const norm = normalizeRun(oldRun);
    expect(norm.inventory).toHaveLength(2);
    expect(norm.inventory[0]).toMatchObject({ id: 'w0-c0', itemId: known!.id, count: 1 });
    expect(norm.inventory[0]!.legacy).toBeUndefined();
    expect(norm.inventory[1]!.legacy?.name).toBe('一件不存在的旧衣服');
    expect(norm.equipped.outfit).toBe('w0-c9');
    // 旧装备不丢：映射不到的那件仍能装备，legacy.affix 由 effectiveStats 兜底
    expect(effectiveStats(norm).vocal).toBe(sampleRun().stats.vocal + 4);
  });

  it('T-022：旧档鞋子加成按映射还原、accessory→accessory1，迁移幂等', () => {
    const oldRun = {
      ...sampleRun(),
      stats: { ...sampleRun().stats, dance: 22 }, // 20 基础 + 帆布鞋 dance+2（旧档直写）
      axes: { self: 50, others: 50, fit: 50 },
      equipped: { outfit: 'w0-c0', shoes: 'eq-canvas-shoes', accessory: 'inv-acc' },
    } as unknown as RunState;

    const migrated = normalizeRun(oldRun);
    expect((migrated.equipped as Record<string, unknown>).shoes).toBeUndefined();
    expect((migrated.equipped as Record<string, unknown>).accessory).toBeUndefined();
    expect(migrated.equipped.accessory1).toBe('inv-acc');
    expect(migrated.stats.dance).toBe(20); // shoes 加成已减回

    // 幂等：再跑一次结果一致
    const twice = normalizeRun(migrated);
    expect(twice.equipped).toEqual(migrated.equipped);
    expect(twice.stats).toEqual(migrated.stats);

    // 未知旧鞋子 id 静默丢弃（不改数值）
    const unknown = { ...sampleRun(), equipped: { shoes: 'eq-not-exist' } } as unknown as RunState;
    const kept = normalizeRun(unknown);
    expect((kept.equipped as Record<string, unknown>).shoes).toBeUndefined();
    expect(kept.stats).toEqual(sampleRun().stats);
  });
});
