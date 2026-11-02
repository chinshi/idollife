import { describe, expect, it } from 'vitest';
import { ACTION_MS, DAY_MS } from '../src/content';
import { createFans } from '../src/fans';
import {
  expiredDay,
  expiredTimes,
  expireTasks,
  taskStatus,
  type TaskDef,
} from '../src/tasks';
import type { RunState } from '../src/types';

/**
 * T-011 · 失败可见化：过期不再凭空消失。
 *
 * 两个核心语义：
 * - 当日冷却 = 仍可见（`expired`）但不可操作，不再 `hidden`
 * - `expireTasks()` 幂等：同一游戏日重复调用只记 1 次日志、`expiredTimes` 只 +1
 * 数字都追 `DAY_MS` / `ACTION_MS`。
 */
const T0 = 3 * DAY_MS;

function base(over: Partial<RunState> = {}): RunState {
  return {
    at: T0,
    startedAt: T0,
    stamina: 100,
    money: 6000,
    stats: { vocal: 10, dance: 10, acting: 10, talk: 10 },
    axes: { self: 50, others: 50, fit: 50 },
    mood: 70,
    satiety: 70,
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
    ...over,
  } as RunState;
}

/** 造一条任务；completeCondition 给个永远不成立的，保证「已领取未完成」 */
function mkTask(over: Partial<TaskDef> & { id: string }): TaskDef {
  return {
    type: 'once',
    name: '演示任务',
    completeCondition: 'dance >= 999',
    rewards: {},
    times: 1,
    content: '',
    brief: '',
    priority: 1,
    ...over,
  };
}

const acceptedFlags = (id: string, at = T0) => ({ [`task:${id}:acceptedAt`]: at });

describe('T-011 过期可见化', () => {
  it('1. 过期当刻（还没结算）→ expired，不再是 hidden', () => {
    const task = mkTask({ id: 't-visible', deadlineDays: 1 });
    const state = base({ at: T0 + DAY_MS + 1, flags: acceptedFlags(task.id) });
    expect(taskStatus(state, task)).toBe('expired');
  });

  it('2. 过期当天连推 3 次行动（每次 expireTasks）：状态始终 expired、日志只 +1、expiredTimes=1', () => {
    const task = mkTask({ id: 't-day-loop', deadlineDays: 1 });
    let state = base({ at: T0 + DAY_MS + 1, flags: acceptedFlags(task.id) });
    const logBefore = state.log.length;

    for (let i = 0; i < 3; i += 1) {
      state = expireTasks(state, [task]);
      expect(taskStatus(state, task)).toBe('expired');
      state = { ...state, at: state.at + ACTION_MS };
    }

    expect(state.log.length - logBefore).toBe(1);
    expect(expiredTimes(state, task.id)).toBe(1);
  });

  it('3. 次日（跨过 expiredDay）回到 claimable', () => {
    const task = mkTask({ id: 't-next-day', deadlineDays: 1 });
    let state = base({ at: T0 + DAY_MS + 1, flags: acceptedFlags(task.id) });
    state = expireTasks(state, [task]);
    expect(taskStatus(state, task)).toBe('expired');
    expect(expiredDay(state, task.id)).toBe(Math.floor(state.at / DAY_MS));

    const nextDay = { ...state, at: state.at + DAY_MS };
    expect(taskStatus(nextDay, task)).toBe('claimable');
  });

  it('4. expireTasks 幂等：同一 state 连跑 3 次 → expiredTimes 仍 1、日志仍 1 条', () => {
    const task = mkTask({ id: 't-idem', deadlineDays: 1 });
    const start = base({ at: T0 + DAY_MS + 1, flags: acceptedFlags(task.id) });

    const once = expireTasks(start, [task]);
    const twice = expireTasks(once, [task]);
    const thrice = expireTasks(twice, [task]);

    expect(expiredTimes(thrice, task.id)).toBe(1);
    expect(thrice.log.length - start.log.length).toBe(1);
    expect(taskStatus(thrice, task)).toBe('expired');
  });

  it('5. 隔日重新领取后再次超时 → expiredTimes=2', () => {
    const task = mkTask({ id: 't-twice', deadlineDays: 1 });

    // 第一次：第 3 天领取，第 4 天超时
    const first = base({ at: T0 + DAY_MS + 1, flags: acceptedFlags(task.id) });
    const afterFirst = expireTasks(first, [task]);
    expect(expiredTimes(afterFirst, task.id)).toBe(1);

    // 第 5 天重新领取 → 第 6 天再次超时（过期记录是上一次领取留下的，必须重新计时）
    const reAcceptedAt = 5 * DAY_MS;
    const second = {
      ...afterFirst,
      at: reAcceptedAt + DAY_MS + 1,
      flags: {
        ...afterFirst.flags,
        [`task:${task.id}:acceptedAt`]: reAcceptedAt,
        [`task:${task.id}:doneAt`]: 0,
      },
    };
    expect(taskStatus(second, task)).toBe('expired');

    const afterSecond = expireTasks(second, [task]);
    expect(expiredTimes(afterSecond, task.id)).toBe(2);
    expect(expiredDay(afterSecond, task.id)).toBe(6);
  });

  it('6. 无 deadlineDays 的任务：状态不变、不计次、不写日志', () => {
    const task = mkTask({ id: 't-forever' });
    const state = base({ at: T0 + 100 * DAY_MS, flags: acceptedFlags(task.id) });
    const after = expireTasks(state, [task]);

    expect(taskStatus(after, task)).toBe('active');
    expect(expiredTimes(after, task.id)).toBe(0);
    expect(after.log.length).toBe(state.log.length);
    expect(after.flags[`task:${task.id}:expiredDay`]).toBeUndefined();
  });

  it('7. 旧存档没有 expiredCount → expiredTimes 返回 0，不抛错', () => {
    const state = base({ flags: { 'task:legacy:expiredDay': 4 } });
    expect(expiredTimes(state, 'legacy')).toBe(0);
    expect(expiredTimes(state, 'never-existed')).toBe(0);
  });
});
