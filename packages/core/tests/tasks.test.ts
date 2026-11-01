import { describe, expect, it } from 'vitest';
import { TASKS, acceptTask, activeTasks, checkTaskCompletions, completedTasks, taskStatus } from '../src/tasks';
import { createFans } from '../src/fans';
import type { RunState } from '../src/types';

const T0 = 1767300000000;

function base(over: Partial<RunState> = {}): RunState {
  return {
    at: T0,
    startedAt: T0,
    stamina: 100,
    money: 6000,
    stats: { vocal: 10, dance: 10, acting: 10, talk: 10 },
    axes: { self: 50, others: 50, fit: 50 },
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

const danceTask = TASKS.find((t) => t.id === 'task-dance-30')!;

describe('任务状态机', () => {
  it('可见但未达领取条件 → locked', () => {
    expect(taskStatus(base(), danceTask)).toBe('locked');
  });

  it('达到领取条件 → claimable，领取后 → active', () => {
    const state = base({ stats: { vocal: 10, dance: 25, acting: 10, talk: 10 } });
    expect(taskStatus(state, danceTask)).toBe('claimable');

    const r = acceptTask(state, danceTask.id);
    expect(r.result).toBe('ok');
    expect(taskStatus(r.state, danceTask)).toBe('active');
    expect(activeTasks(r.state).length).toBe(1);
  });

  it('进行中满足完成条件 → 自动完成并发奖', () => {
    let state = base({ stats: { vocal: 10, dance: 25, acting: 10, talk: 10 } });
    state = acceptTask(state, danceTask.id).state;

    // 把舞蹈练到 30
    state = { ...state, stats: { ...state.stats, dance: 30 }, money: 1000 };
    state = checkTaskCompletions(state);

    expect(taskStatus(state, danceTask)).toBe('done');
    expect(state.money).toBe(1500);
    expect(completedTasks(state)[0]?.task.id).toBe(danceTask.id);
    expect(state.log.some((l) => l.actionId === `task-done:${danceTask.id}`)).toBe(true);
  });

  it('未领取的任务即使满足完成条件也不会自动完成', () => {
    const state = base({ stats: { vocal: 10, dance: 30, acting: 10, talk: 10 } });
    const next = checkTaskCompletions(state);
    expect(completedTasks(next).length).toBe(0);
  });
});
