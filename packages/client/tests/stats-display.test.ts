import { describe, expect, it } from 'vitest';
import { START_AT, attrValue, createFans } from '@idollife/core';
import type { RunState } from '@idollife/core';
import { normalizeRun } from '../src/state/save';

const T0 = START_AT;

/** 线上真实脏档：stats 里被写进 stamina:null（JSON 里 NaN → null） */
function dirtyRun(): RunState {
  return {
    at: T0,
    startedAt: T0,
    stamina: 100,
    money: 11600,
    stats: { vocal: 43, dance: 45, acting: 34, talk: 57, stamina: null } as unknown as RunState['stats'],
    axes: { self: 50, others: 50, fit: 50 },
    mood: 100,
    health: 100,
    fans: createFans(0),
    debuted: false,
    parties: [],
    activePartyId: null,
    friends: [],
    inventory: [],
    equipped: {},
    flags: {},
    pendingEvent: null,
    eventQueue: [],
    log: [],
  };
}

describe('T-043 读档清洗 stats 脏键', () => {
  it('normalizeRun 清掉 stats.stamina，体力显示回真实值', () => {
    const before = dirtyRun();
    // 修之前：面板读 stats.stamina（null → 0），真实体力 100 被完全遮住
    expect(attrValue(before, 'stamina')).toBe(100);

    const after = normalizeRun(before);
    expect('stamina' in after.stats).toBe(false);
    expect(after.stats).toEqual({ vocal: 43, dance: 45, acting: 34, talk: 57 });
    expect(attrValue(after, 'stamina')).toBe(100);
    expect(after.stamina).toBe(100);
  });

  it('四项能力缺失 / 非法值补 0，不把 NaN 带进界面', () => {
    const run = {
      ...dirtyRun(),
      stats: { vocal: Number.NaN, talk: null } as unknown as RunState['stats'],
    };
    const after = normalizeRun(run);
    expect(after.stats).toEqual({ vocal: 0, dance: 0, acting: 0, talk: 0 });
  });

  it('干净档不受影响', () => {
    const clean = { ...dirtyRun(), stats: { vocal: 43, dance: 45, acting: 34, talk: 57 } };
    expect(normalizeRun(clean).stats).toEqual({ vocal: 43, dance: 45, acting: 34, talk: 57 });
  });
});
