import { describe, expect, it } from 'vitest';
import { START_AT, clampStamina, settleStamina } from '../src/content';
import { createFans } from '../src/fans';
import { preflightAction } from '../src/preflight';
import { previewAction } from '../src/results';
import { settle } from '../src/settle';
import type { RunState, ScheduleItem } from '../src/types';

const MIN = 60_000;
const T0 = START_AT;
const PURE = { routineChance: 0, storyEvents: false };

function baseRun(over: Partial<RunState> = {}): RunState {
  return {
    at: T0,
    startedAt: T0,
    stamina: 0,
    money: 50000,
    mood: 70,
    health: 100,
    parties: [],
    friends: [],
    activePartyId: null,
    debuted: false,
    inventory: [],
    equipped: {},
    stats: { vocal: 10, dance: 10, acting: 10, talk: 10 },
    axes: { self: 50, others: 50, fit: 50 },
    fans: createFans(100),
    flags: {},
    negatives: { stress: 0, restless: 0, fatigue: 0, desire: 0, scandal: 0 },
    pendingEvent: null,
    eventQueue: [],
    log: [],
    ...over,
  } as RunState;
}

function item(id: string, actionId: string, offsetMin: number, durationMin = 10): ScheduleItem {
  const startAt = T0 + offsetMin * MIN;
  return { id, actionId, startAt, endAt: startAt + durationMin * MIN };
}

/**
 * T-042 守卫：体力结算规则必须在「预览 / 预检 / 实际结算」三处完全一致。
 * T-044：饱腹退役，「太饿恢复减半」随之删除，这里只留积劳放大。
 */
describe('settleStamina', () => {
  it('恢复类按配置值给满', () => {
    expect(settleStamina(40, 0).applied).toBe(40);
  });

  it('消耗不受影响', () => {
    expect(settleStamina(-10, 0).applied).toBe(-10);
  });

  it('积劳 > 50 时消耗放大 1.2 倍', () => {
    const r = settleStamina(-10, 60);
    expect(r.applied).toBe(-12);
    expect(r.scaledByFatigue).toBe(true);
  });

  it('积劳只放大消耗，不放大恢复', () => {
    expect(settleStamina(40, 80).applied).toBe(40);
  });

  it('T-044：不再有饥饿减半，恢复类永远给满', () => {
    // 旧规则下 40 会被砍成 20；饱腹退役后不管什么状态都是 40
    expect(settleStamina(40, 0).applied).toBe(40);
  });
});

describe('预览与实际结算一致', () => {
  it('爆睡 +40：预览 = 实际', () => {
    const run = baseRun({ stamina: 10 });
    const pv = previewAction(run, 'rest-sleep')!;
    const res = settle(run, [item('s1', 'rest-sleep', 0)], T0, T0 + 10 * MIN, 'seed', PURE);
    const played = res.state.log.find((l) => l.actionId === 'rest-sleep')!;
    expect(pv.stamina).toBe(40);
    expect(played.staminaDelta).toBe(pv.stamina);
    expect(res.state.stamina).toBe(50);
  });

  it('体力在上限附近时，预览按原始值显示但实际被 clamp（不会说没加）', () => {
    const run = baseRun({ stamina: 95 });
    const pv = previewAction(run, 'rest-sleep')!;
    expect(pv.stamina).toBe(40);
    const res = settle(run, [item('s1', 'rest-sleep', 0)], T0, T0 + 10 * MIN, 'seed', PURE);
    expect(res.state.stamina).toBe(clampStamina(95 + 40));
  });
});

describe('0 体力不该能跑消耗行动', () => {
  it('preflight 直接拦下唱 K', () => {
    const pf = preflightAction(baseRun({ stamina: 0 }), 'vocal-karaoke');
    expect(pf.ok).toBe(false);
    expect(pf.reason).toBe('stamina');
  });

  it('settle 一条都不执行，stopped=stamina', () => {
    const res = settle(
      baseRun({ stamina: 0 }),
      [item('s1', 'vocal-karaoke', 0)],
      T0,
      T0 + 10 * MIN,
      'seed',
      PURE,
    );
    expect(res.executed).toHaveLength(0);
    expect(res.stoppedReason).toBe('stamina');
    expect(res.state.stamina).toBe(0);
  });

  it('先爆睡把体力睡回来，后面的唱 K 才执行（同一批排程）', () => {
    const res = settle(
      baseRun({ stamina: 0 }),
      [item('s1', 'rest-sleep', 0), item('s2', 'vocal-karaoke', 10)],
      T0,
      T0 + 20 * MIN,
      'seed',
      PURE,
    );
    expect(res.executed).toHaveLength(2);
    expect(res.state.stamina).toBe(30);
  });
});

describe('脏数据不能变成「体力无限」', () => {
  it('stamina 缺失时 settle 不会写出 NaN，也不会白跑消耗行动', () => {
    const run = { ...baseRun(), stamina: undefined as unknown as number };
    const res = settle(run, [item('s1', 'rest-sleep', 0)], T0, T0 + 10 * MIN, 'seed', PURE);
    expect(Number.isFinite(res.state.stamina)).toBe(true);
  });

  it('stamina 是 NaN 时 preflight 按满体力兜底，但仍拦住超上限的消耗', () => {
    const nan = { ...baseRun(), stamina: Number.NaN };
    // 满体力 100 跑 -10 的唱 K 应该放行
    expect(preflightAction(nan, 'vocal-karaoke').ok).toBe(true);
    // 体力真不够时仍然拦：vocal-street 要 -22，手里只有 10
    const short = { ...baseRun(), stamina: 10 };
    expect(preflightAction(short, 'vocal-street').ok).toBe(false);
  });

  it('money 缺失时不会因为 NaN 放行昂贵的行动', () => {
    const run = { ...baseRun({ stamina: 100, money: 0 }), money: undefined as unknown as number };
    const pf = preflightAction(run, 'vocal-karaoke');
    expect(pf.ok).toBe(false);
    expect(pf.reason).toBe('money');
    // 兜底成 0 而不是把 undefined 一路传下去（提示里会变成 "你现在 ¥undefined"）
    expect(Number.isFinite(pf.have)).toBe(true);
  });
});
