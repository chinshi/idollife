import { describe, expect, it } from 'vitest';
import { START_AT, DAY_MS } from '../src/content';
import { createFans } from '../src/fans';
import {
  TASKS,
  acceptTask,
  claimTaskReward,
  claimableTasks,
  doneTimes,
  lastDoneDay,
  taskStatus,
} from '../src/tasks';
import type { RunState } from '../src/types';

const T0 = START_AT;

function base(over: Partial<RunState> = {}): RunState {
  return {
    at: T0,
    startedAt: T0,
    stamina: 100,
    money: 6000,
    stats: { vocal: 15, dance: 15, acting: 15, talk: 15 },
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
  };
}

// T-017 内容改版：task-first-show 已 once 化进引导链，repeat 语义改用 task-show-10 验证
const repeatTask = TASKS.find((t) => t.id === 'task-show-10')!;

describe('测试 B：repeat 任务', () => {
  it('完成后当日不可再领，下一游戏日重置，达 times 上限后永久完成', () => {
    const fans = createFans(0);
    fans.byType.stage = 450;
    let state = base({ fans });

    // 第一轮：领取 → 完成
    state = acceptTask(state, repeatTask.id).state;
    expect(taskStatus(state, repeatTask)).toBe('completable');
    state = claimTaskReward(state, repeatTask.id).state;

    expect(doneTimes(state, repeatTask.id)).toBe(1);
    expect(lastDoneDay(state, repeatTask.id)).toBe(Math.floor(state.at / DAY_MS));
    expect(taskStatus(state, repeatTask)).toBe('done');
    expect(claimableTasks(state).some((t) => t.id === repeatTask.id)).toBe(false);
    expect(acceptTask(state, repeatTask.id).result).toBe('done');

    // 跨到下一个游戏日：重置为可再领
    state = { ...state, at: state.at + DAY_MS };
    expect(taskStatus(state, repeatTask)).toBe('claimable');
    expect(claimableTasks(state).some((t) => t.id === repeatTask.id)).toBe(true);
    expect(acceptTask(state, repeatTask.id).result).toBe('ok');

    // 依次完成剩余次数
    for (let i = 1; i < repeatTask.times; i++) {
      state = { ...state, at: state.at + DAY_MS };
      expect(taskStatus(state, repeatTask)).toBe('claimable');

      const accepted = acceptTask(state, repeatTask.id);
      expect(accepted.result).toBe('ok');
      state = accepted.state;
      expect(taskStatus(state, repeatTask)).toBe('completable');

      const claimed = claimTaskReward(state, repeatTask.id);
      expect(claimed.result).toBe('ok');
      state = claimed.state;
      expect(doneTimes(state, repeatTask.id)).toBe(i + 1);
      expect(taskStatus(state, repeatTask)).toBe('done');
    }

    // 达到 times 上限：转长期完成态，跨日也不再重置
    expect(doneTimes(state, repeatTask.id)).toBe(repeatTask.times);
    state = { ...state, at: state.at + DAY_MS };
    expect(taskStatus(state, repeatTask)).toBe('done');
    expect(acceptTask(state, repeatTask.id).result).toBe('done');
  });
});
