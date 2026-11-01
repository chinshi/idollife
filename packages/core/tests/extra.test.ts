import { describe, expect, it } from 'vitest';
import { settle } from '../src/settle';
import { divine, divinationCost, divinationReading, tierText } from '../src/divination';
import { createFans } from '../src/fans';
import { DAY_MS, SHOW_ACTION_ID, SHOW_DURATION_MS } from '../src/content';
import type { RunState, ScheduleItem } from '../src/types';

const MIN = 60_000;
const T0 = Date.UTC(2026, 0, 1, 9, 0, 0);

function base(overrides: Partial<RunState> = {}): RunState {
  return {
    at: T0,
    startedAt: T0,
    stamina: 100,
    money: 5000,
    stats: { vocal: 10, dance: 10, acting: 10, talk: 10 },
    axes: { self: 30, others: 70, fit: 60 },
    fans: createFans(0),
    debuted: false,
    parties: [],
    activePartyId: null,
    inventory: [],
    equipped: {},
    flags: {},
    pendingEvent: null,
    eventQueue: [],
    log: [],
    ...overrides,
  };
}

function item(id: string, offsetMin: number, stopAfter = false): ScheduleItem {
  const startAt = T0 + offsetMin * MIN;
  return { id, actionId: 'vocal-karaoke', startAt, endAt: startAt + 10 * MIN, stopAfter };
}

describe('行程停止标记', () => {
  it('打勾的那一条执行完就停', () => {
    const schedule = [item('s1', 0), item('s2', 10, true), item('s3', 20)];
    const r = settle(base(), schedule, T0, T0 + 60 * MIN, 'x', {
      routineChance: 0,
      storyEvents: false,
    });

    expect(r.executed).toEqual(['s1', 's2']);
    expect(r.stoppedReason).toBe('stopped');
  });
});

describe('占卜', () => {
  it('同一天第二次翻倍', () => {
    const first = base();
    expect(divinationCost(first)).toBe(100);

    const after = divine(first);
    expect(after.result).toBe('ok');
    expect(divinationCost(after.state)).toBe(200);
  });

  it('跨天价格重置', () => {
    const after = divine(divine(base()).state).state;
    expect(divinationCost(after)).toBe(400);

    const nextDay = { ...after, at: after.at + DAY_MS };
    expect(divinationCost(nextDay)).toBe(100);
  });

  it('钱不够占不了', () => {
    const poor = base({ money: 50 });
    expect(divine(poor).result).toBe('poor');
  });

  it('只返回档位', () => {
    const r = divinationReading(base());
    expect(r.self).toBe(tierText('low') === '低' ? 'low' : r.self);
    expect(r.others).toBe('high');
    expect(r.fit).toBe('mid');
  });
});

describe('演出占位', () => {
  it('周末演出按行动位结算：扣体力、给钱、涨粉', () => {
    const run = base({ stamina: 100, money: 0 });
    const startAt = T0 + 600000;
    const show = {
      id: 'show1',
      actionId: SHOW_ACTION_ID,
      startAt,
      endAt: startAt + SHOW_DURATION_MS,
    };

    const r = settle(run, [show], T0, startAt + SHOW_DURATION_MS, 's', {
      routineChance: 0,
      storyEvents: false,
    });

    expect(r.executed).toEqual(['show1']);
    expect(r.state.stamina).toBe(70);
    expect(r.state.money).toBeGreaterThan(0);
    expect(r.state.log.some((l) => l.actionId === 'show')).toBe(true);
    const totalFans = Object.values(r.state.fans.byType).reduce((sum, v) => sum + v, 0);
    expect(totalFans).toBeGreaterThan(0);
  });
});