import { describe, expect, it } from 'vitest';
import { ACTION_MS, DAILY_SLOTS, DAY_MS } from '../src/content';
import { createFans } from '../src/fans';
import { taskDeadline, taskStatus, type TaskDef } from '../src/tasks';
import type { RunState } from '../src/types';

/**
 * T-010 · 任务倒计时（UI 唯一真源）
 *
 * 所有数字都追到 DAY_MS / ACTION_MS / DAILY_SLOTS，不写死魔法数。
 * 关键语义：pastDeadline() 用 `>`（恰好到期仍 active），taskDeadline.due 用 `>=`（时间已到）。
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

/** 造一条任务；completeCondition 给个永远不成立的，保证「已领取未完成」停在 active */
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

const acceptedAt = (id: string, at = T0) => ({ [`task:${id}:acceptedAt`]: at });

describe('taskDeadline 倒计时', () => {
  it('1. 无限期（无 deadlineDays）→ null', () => {
    const task = mkTask({ id: 't-forever' });
    expect(taskDeadline(base({ flags: acceptedAt(task.id) }), task)).toBeNull();
    // deadlineDays: 0 也算无限期
    const zero = mkTask({ id: 't-forever-0', deadlineDays: 0 });
    expect(taskDeadline(base({ flags: acceptedAt(zero.id) }), zero)).toBeNull();
  });

  it('2. 未领取 → null', () => {
    const task = mkTask({ id: 't-not-accepted', deadlineDays: 3 });
    expect(taskDeadline(base(), task)).toBeNull();
  });

  it('3. 领取后立刻查（deadlineDays: 3）', () => {
    const days = 3;
    const task = mkTask({ id: 't-right-after', deadlineDays: days });
    const deadline = taskDeadline(base({ flags: acceptedAt(task.id) }), task);
    expect(deadline).not.toBeNull();
    expect(deadline!.deadlineAt).toBe(T0 + days * DAY_MS);
    expect(deadline!.remainingMs).toBe(days * DAY_MS);
    // 1 天 = DAILY_SLOTS 次行动
    expect(deadline!.remainingSlots).toBe(days * DAILY_SLOTS);
    expect(deadline!.remainingDays).toBe(days);
    expect(deadline!.due).toBe(false);
    expect(deadline!.urgent).toBe(false);
  });

  it('4. 推进 2 次行动后剩余行动数恰好少 2；1 天时限进入 urgent', () => {
    const three = mkTask({ id: 't-three-days', deadlineDays: 3 });
    const d3 = taskDeadline(
      base({ at: T0 + 2 * ACTION_MS, flags: acceptedAt(three.id) }),
      three,
    );
    expect(d3!.remainingSlots).toBe(3 * DAILY_SLOTS - 2);
    expect(d3!.remainingMs).toBe(3 * DAY_MS - 2 * ACTION_MS);
    expect(d3!.urgent).toBe(false);

    const one = mkTask({ id: 't-one-day', deadlineDays: 1 });
    const d1 = taskDeadline(base({ at: T0 + 2 * ACTION_MS, flags: acceptedAt(one.id) }), one);
    expect(d1!.remainingSlots).toBe(DAILY_SLOTS - 2);
    expect(d1!.urgent).toBe(true);
  });

  it('5. 恰好到期：remainingSlots 0 / due true，但 taskStatus 仍是 active（> 语义）', () => {
    const task = mkTask({ id: 't-exact-due', deadlineDays: 1 });
    const state = base({ at: T0 + DAY_MS, flags: acceptedAt(task.id) });

    expect(taskStatus(state, task)).toBe('active');
    const deadline = taskDeadline(state, task);
    expect(deadline!.remainingMs).toBe(0);
    expect(deadline!.remainingSlots).toBe(0);
    expect(deadline!.due).toBe(true);
  });

  it('6. 再过 1ms：任务 expired，但 taskDeadline 不返回 null 且 due true', () => {
    const task = mkTask({ id: 't-just-expired', deadlineDays: 1 });
    const state = base({ at: T0 + DAY_MS + 1, flags: acceptedAt(task.id) });

    expect(taskStatus(state, task)).toBe('expired');
    const deadline = taskDeadline(state, task);
    expect(deadline).not.toBeNull();
    expect(deadline!.remainingMs).toBe(-1);
    expect(deadline!.remainingSlots).toBe(0);
    expect(deadline!.due).toBe(true);
  });

  it('7. 已完成（doneAt > 0）→ null', () => {
    const task = mkTask({ id: 't-done', deadlineDays: 3 });
    const state = base({
      flags: {
        ...acceptedAt(task.id),
        [`task:${task.id}:doneAt`]: T0,
      },
    });
    expect(taskDeadline(state, task)).toBeNull();
  });

  it('8. 剩余 1ms → remainingSlots 1（向上取整，不会出现「显示 0 次却还进行中」）', () => {
    const task = mkTask({ id: 't-last-ms', deadlineDays: 1 });
    const state = base({ at: T0 + DAY_MS - 1, flags: acceptedAt(task.id) });

    expect(taskStatus(state, task)).toBe('active');
    const deadline = taskDeadline(state, task);
    expect(deadline!.remainingMs).toBe(1);
    expect(deadline!.remainingSlots).toBe(1);
    expect(deadline!.remainingDays).toBe(1);
    expect(deadline!.due).toBe(false);
  });
});
