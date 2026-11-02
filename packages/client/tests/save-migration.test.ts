import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createFans } from '@idollife/core';
import type { RunState, ScheduleItem } from '@idollife/core';
import {
  LEGACY_SAVE_KEY,
  SAVE_BAK_KEY,
  SAVE_KEY,
  loadSave,
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
    expect(loaded?.run.flags).toEqual(v1.run.flags);
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
});
