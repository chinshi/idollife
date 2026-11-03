import { describe, expect, it } from 'vitest';
import { ACTION_RESULTS } from '../src/results';
import { settle } from '../src/settle';
import { createFans } from '../src/fans';
import type { RunState, ScheduleItem } from '../src/types';

/**
 * T-021：settle 消费 effects.health / effects.axes 的固定输入单测。
 * 全用固定 seed 与固定状态；只断言 health / axes（其余字段随机区间不参与断言）。
 */
const MIN = 60_000;
const T0 = Date.UTC(2026, 0, 1, 9, 0, 0);

function base(over: Partial<RunState> = {}): RunState {
  return {
    at: T0,
    startedAt: T0,
    stamina: 100,
    money: 5000,
    stats: { vocal: 40, dance: 40, acting: 40, talk: 40 },
    axes: { self: 50, others: 50, fit: 50 },
    mood: 70,
    satiety: 70,
    health: 100,
    fans: createFans(0),
    parties: [],
    activePartyId: null,
    friends: [],
    inventory: [],
    equipped: {},
    flags: {},
    pendingEvent: null,
    eventQueue: [],
    log: [],
    ...over,
  } as RunState;
}

function runOne(state: RunState, actionId: string, seed = 'seed-health') {
  const sched: ScheduleItem[] = [
    { id: 's1', actionId, startAt: T0, endAt: T0 + 10 * MIN, done: false },
  ];
  return settle(state, sched, T0, T0 + 10 * MIN, seed, { routineChance: 0, storyEvents: false });
}

/** 找一条带指定 health 值的默认结果（priority 99 / 空条件） */
const resultWithHealth = (health: number) =>
  ACTION_RESULTS.find(
    (r) => r.effects.health === health && r.priority === 99 && r.condition && Object.keys(r.condition).length === 0,
  )!;
const resultWithAxes = (axis: string) =>
  ACTION_RESULTS.find(
    (r) =>
      r.effects.axes &&
      r.effects.axes[axis] !== undefined &&
      r.priority === 99 &&
      r.condition &&
      Object.keys(r.condition).length === 0,
  )!;

describe('T-021 健康与隐藏轴结算', () => {
  it('健康正向：不足上限时相加，超过上限 clamp 100', () => {
    const res = resultWithHealth(6);
    expect(res).toBeTruthy();

    const low = runOne(base({ health: 50 }), res.actionId);
    expect(low.state.health).toBe(56);

    const edge = runOne(base({ health: 98 }), res.actionId);
    expect(edge.state.health).toBe(100);
  });

  it('健康负向：减到负值 clamp 0', () => {
    const res = resultWithHealth(-3);
    expect(res).toBeTruthy();
    const out = runOne(base({ health: 2 }), res.actionId);
    expect(out.state.health).toBe(0);
  });

  it('健康缺省（旧档无 health 字段）按 100 兜底', () => {
    const res = resultWithHealth(-3);
    const noHealth = { ...base(), health: undefined } as RunState;
    expect(runOne(noHealth, res.actionId).state.health).toBe(97);
  });

  it('隐藏轴：生效并 clamp 0–100（+1 到 100 封顶）', () => {
    const res = resultWithAxes('self');
    expect(res).toBeTruthy();
    const delta = Number(res.effects.axes!.self);

    const mid = runOne(base({ axes: { self: 50, others: 50, fit: 50 } }), res.actionId);
    expect(mid.state.axes.self).toBe(50 + delta);
    expect(mid.state.axes.others).toBe(50);

    const edge = runOne(base({ axes: { self: 100, others: 50, fit: 50 } }), res.actionId);
    expect(edge.state.axes.self).toBe(100);
  });

  it('没有轴数据的行动不改变 axes；健康也不误动', () => {
    const res = resultWithAxes('self');
    const other = ACTION_RESULTS.find(
      (r) =>
        (!r.effects.axes || Object.keys(r.effects.axes).length === 0) &&
        r.effects.health === undefined &&
        r.priority === 99 &&
        r.condition &&
        Object.keys(r.condition).length === 0,
    )!;
    const out = runOne(base({ health: 88 }), other.actionId);
    expect(out.state.health).toBe(88);
    expect(out.state.axes).toEqual({ self: 50, others: 50, fit: 50 });
    expect(res).toBeTruthy();
  });
});
