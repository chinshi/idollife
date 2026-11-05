import { describe, expect, it } from 'vitest';
import {
  HUNGRY_SATIETY,
  START_AT,
  clampStamina,
  settleStamina,
} from '../src/content';
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
    satiety: 70,
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
 *
 * 线上真实现象（用户 2026-11-05）：饱腹 0~35 时爆睡只加 20 点，
 * 但行程卡预览与日志文案都按配置写「体力 +40」→ 玩家看到"睡完没涨"。
 */
describe('settleStamina', () => {
  it('饱腹正常时恢复按配置值', () => {
    const r = settleStamina(40, 62, 0);
    expect(r.applied).toBe(40);
    expect(r.halvedByHunger).toBe(false);
  });

  it('行动后饱腹低于 20 → 恢复减半', () => {
    const r = settleStamina(40, 10, 0);
    expect(r.applied).toBe(20);
    expect(r.halvedByHunger).toBe(true);
  });

  it('饱腹正好 20 不减半（边界是小于）', () => {
    expect(settleStamina(40, HUNGRY_SATIETY, 0).applied).toBe(40);
  });

  it('消耗不受饱腹影响', () => {
    const r = settleStamina(-10, 0, 0);
    expect(r.applied).toBe(-10);
    expect(r.halvedByHunger).toBe(false);
  });

  it('积劳 > 50 时消耗放大 1.2 倍', () => {
    const r = settleStamina(-10, 70, 60);
    expect(r.applied).toBe(-12);
    expect(r.scaledByFatigue).toBe(true);
  });

  it('又饿又积劳：恢复只减半、消耗只放大，互不串', () => {
    expect(settleStamina(40, 5, 80).applied).toBe(20);
    expect(settleStamina(-10, 5, 80).applied).toBe(-12);
  });
});

describe('预览与实际结算一致', () => {
  it('饱腹充足：预览 = 实际（爆睡 +40）', () => {
    const run = baseRun({ stamina: 10, satiety: 70 });
    const pv = previewAction(run, 'rest-sleep')!;
    const res = settle(run, [item('s1', 'rest-sleep', 0)], T0, T0 + 10 * MIN, 'seed', PURE);
    const played = res.state.log.find((l) => l.actionId === 'rest-sleep')!;
    expect(pv.stamina).toBe(40);
    expect(played.staminaDelta).toBe(pv.stamina);
    expect(res.state.stamina).toBe(50);
  });

  it('太饿：预览必须显示减半后的 20，日志也要如实记 20', () => {
    const run = baseRun({ stamina: 0, satiety: 10 });
    const pv = previewAction(run, 'rest-sleep')!;
    expect(pv.stamina).toBe(20);
    expect(pv.hungerHalved).toBe(true);

    const res = settle(run, [item('s1', 'rest-sleep', 0)], T0, T0 + 10 * MIN, 'seed', PURE);
    const played = res.state.log.find((l) => l.actionId === 'rest-sleep')!;
    expect(played.staminaDelta).toBe(pv.stamina);
    expect(res.state.stamina).toBe(20);
  });

  it('太饿时日志文案补一句说明（配置文案写的是 +40）', () => {
    const run = baseRun({ stamina: 0, satiety: 10 });
    const res = settle(run, [item('s1', 'rest-sleep', 0)], T0, T0 + 10 * MIN, 'seed', PURE);
    const played = res.state.log.find((l) => l.actionId === 'rest-sleep')!;
    expect(played.text).toContain('只恢复了一半');
  });

  it('体力在上限附近时，预览按原始值显示但实际被 clamp（不会说没加）', () => {
    const run = baseRun({ stamina: 95, satiety: 70 });
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
      baseRun({ stamina: 0, satiety: 70 }),
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
