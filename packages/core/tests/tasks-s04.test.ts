import { describe, expect, it } from 'vitest';
import { DAY_MS } from '../src/content';
import { findPrerequisiteCycle } from '../src/task-prerequisite.js';
import { taskColumnField } from '../src/task-headers.js';
import {
  TASKS,
  doneTimes,
  expireTasks,
  expiredDay,
  taskStatus,
  type TaskDef,
} from '../src/tasks';
import { createFans } from '../src/fans';
import type { RunState } from '../src/types';

/**
 * T-007 · S04 收尾 A/B/C：过期时间 / 重置周期 / 任务链（docs/25 §2.5）
 *
 * A1～A4 过期、B1～B3 重置、C1～C2 任务链。B3 是「现有 3 条 repeat 任务缺省行为不变」的回归。
 * T-009：过期单位由「游戏小时」改为「游戏日」——1 天 = 3 行动 = `DAY_MS`（D-014），
 * 所以下面的 A1～A4 直接用 `DAY_MS` 按「天」验，不再有「小时」换算。
 */
/** 取游戏第 3 天作为基准，避免 day 0 的边界干扰 */
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

/** 造一条任务；不写 completeCondition 时给个永远不成立的，方便停在 active */
const mkTask = (over: Partial<TaskDef> & { id: string }): TaskDef => ({
  type: 'once',
  name: '演示任务',
  completeCondition: 'dance >= 999',
  rewards: {},
  times: 1,
  content: '',
  brief: '',
  priority: 1,
  ...over,
});

const acceptedFlags = (id: string, at = T0) => ({ [`task:${id}:acceptedAt`]: at });

describe('A. 过期时间 deadlineDays（单位：游戏日，1 天 = 3 行动 = DAY_MS）', () => {
  it('A1. deadlineDays: 1 → 满 1 天没过期，超过 1 天才 expired', () => {
    const task = mkTask({ id: 't-deadline', deadlineDays: 1 });
    const flags = acceptedFlags(task.id);
    // 正好 1 天（3 行动）: now - acceptedAt === DAY_MS，严格大于才算过期
    expect(taskStatus(base({ at: T0 + DAY_MS, flags }), task)).toBe('active');
    // 超过 1 天 1 毫秒 → 过期
    expect(taskStatus(base({ at: T0 + DAY_MS + 1, flags }), task)).toBe('expired');
    // 2 天当然也过期
    expect(taskStatus(base({ at: T0 + 2 * DAY_MS, flags }), task)).toBe('expired');
  });

  it('A2. 过期不消耗 times（doneTimes 不变，不扣钱不扣粉）', () => {
    const task = mkTask({ id: 't-deadline-slack', deadlineDays: 1, times: 3 });
    const before = base({ at: T0 + 2 * DAY_MS, flags: acceptedFlags(task.id) });
    expect(taskStatus(before, task)).toBe('expired');

    const after = expireTasks(before, [task]);
    expect(doneTimes(after, task.id)).toBe(0);
    expect(after.flags[`task:${task.id}:count`]).toBeUndefined();
    expect(after.money).toBe(before.money);
    expect(after.fans.byType.stage).toBe(before.fans.byType.stage);
    expect(after.log[after.log.length - 1]?.text).toBe(`通告「${task.name}」超时未完成。`);
  });

  it('A3. 过期后同一游戏日内不再出现；次日机会还给玩家', () => {
    const task = mkTask({ id: 't-deadline-cool', deadlineDays: 1, times: 3 });
    const state = base({ at: T0 + 2 * DAY_MS, flags: acceptedFlags(task.id) });
    expect(taskStatus(state, task)).toBe('expired');

    const cooled = expireTasks(state, [task]);
    expect(expiredDay(cooled, task.id)).toBe(Math.floor(cooled.at / DAY_MS));
    // T-011：当日冷却从「隐藏」改为「可见但不可操作」（已错过），不再返回 hidden
    expect(taskStatus(cooled, task)).toBe('expired');

    // 下一个游戏日：冷却结束，机会还给玩家
    const nextDay = { ...cooled, at: cooled.at + DAY_MS };
    expect(taskStatus(nextDay, task)).toBe('claimable');
  });

  it('A4. deadlineDays 为 0 或缺省时永不 expired', () => {
    const long = T0 + 1000 * DAY_MS;
    for (const task of [mkTask({ id: 't-forever-0', deadlineDays: 0 }), mkTask({ id: 't-forever-x' })]) {
      const state = base({ at: long, flags: acceptedFlags(task.id) });
      expect(taskStatus(state, task)).toBe('active');
      expect(expireTasks(state, [task]).log.length).toBe(state.log.length);
    }
  });
});

describe('B. 重置周期 reset', () => {
  it("B1. reset: 'weekly' 每 7 个游戏日重置", () => {
    const task = mkTask({ id: 't-weekly', type: 'repeat', times: 10, reset: 'weekly' });
    const flags = {
      ...acceptedFlags(task.id),
      [`task:${task.id}:doneAt`]: T0,
      [`task:${task.id}:doneDay`]: Math.floor(T0 / DAY_MS),
      [`task:${task.id}:count`]: 1,
    };
    expect(taskStatus(base({ at: T0, flags }), task)).toBe('done');
    expect(taskStatus(base({ at: T0 + 6 * DAY_MS, flags }), task)).toBe('done');
    expect(taskStatus(base({ at: T0 + 7 * DAY_MS, flags }), task)).toBe('claimable');
  });

  it("B2. reset: 'none'：times 用尽永久 done，未用尽完成也不再跨日重置", () => {
    const capped = mkTask({ id: 't-none-capped', times: 1, reset: 'none' });
    const cappedFlags = {
      ...acceptedFlags(capped.id),
      [`task:${capped.id}:doneAt`]: T0,
      [`task:${capped.id}:doneDay`]: Math.floor(T0 / DAY_MS),
      [`task:${capped.id}:count`]: 1,
    };
    expect(taskStatus(base({ at: T0, flags: cappedFlags }), capped)).toBe('done');
    expect(taskStatus(base({ at: T0 + 30 * DAY_MS, flags: cappedFlags }), capped)).toBe('done');

    const slack = mkTask({ id: 't-none-slack', type: 'repeat', times: 5, reset: 'none' });
    const slackFlags = {
      ...acceptedFlags(slack.id),
      [`task:${slack.id}:doneAt`]: T0,
      [`task:${slack.id}:doneDay`]: Math.floor(T0 / DAY_MS),
      [`task:${slack.id}:count`]: 1,
    };
    expect(taskStatus(base({ at: T0, flags: slackFlags }), slack)).toBe('done');
    expect(taskStatus(base({ at: T0 + 5 * DAY_MS, flags: slackFlags }), slack)).toBe('done');
  });

  it('B3. 现有 2 条 repeat 任务缺省行为不变（等价 D-011 daily）', () => {
    // T-017 内容改版：task-first-show 引导链内 once 化，repeat 只剩 show-10 / daily-repeat
    const repeats = TASKS.filter((t) => t.type === 'repeat');
    expect(repeats.length).toBe(2);
    expect(repeats.map((t) => t.id).sort()).toEqual(['task-daily-repeat', 'task-show-10']);

    const flagsFor = (id: string) => ({
      [`task:${id}:acceptedAt`]: T0,
      [`task:${id}:doneAt`]: T0,
      [`task:${id}:doneDay`]: Math.floor(T0 / DAY_MS),
      [`task:${id}:count`]: 1,
    });
    // 让所有 repeat 任务的 display / accept 条件都成立（total 80、舞台粉 500）
    const fans = createFans(0);
    fans.byType.stage = 500;
    const stats = { vocal: 20, dance: 20, acting: 20, talk: 20 };

    for (const task of repeats) {
      // 只断言行为，不耦合「字段在不在」：策划加列后填 daily 应继续通过
      const flags = flagsFor(task.id);
      expect(taskStatus(base({ at: T0, flags, fans, stats }), task)).toBe('done');
      expect(taskStatus(base({ at: T0 + DAY_MS, flags, fans, stats }), task)).toBe('claimable');
    }
  });
});

describe('C. 任务链 prerequisite', () => {
  it('C1. 前置未完成 → hidden；前置全 done → 正常可见', () => {
    const prereq = TASKS.find((t) => t.id === 'task-vocal-20');
    expect(prereq).toBeDefined();
    const dependent = mkTask({ id: 't-chain-child', prerequisite: ['task-vocal-20'] });

    expect(taskStatus(base(), dependent)).toBe('hidden');

    const flags = {
      [`task:task-vocal-20:acceptedAt`]: T0,
      [`task:task-vocal-20:doneAt`]: T0,
      [`task:task-vocal-20:doneDay`]: Math.floor(T0 / DAY_MS),
      [`task:task-vocal-20:count`]: prereq!.times,
    };
    expect(taskStatus(base({ flags }), dependent)).toBe('claimable');
  });

  it('C2. 环检测：成环返回环路径，无环返回 null', () => {
    const cycle = findPrerequisiteCycle([
      { id: 'a', prerequisite: ['b'] },
      { id: 'b', prerequisite: ['c'] },
      { id: 'c', prerequisite: ['a'] },
    ]);
    expect(cycle).not.toBeNull();
    expect(new Set(cycle)).toEqual(new Set(['a', 'b', 'c']));
    expect(cycle![0]).toBe(cycle![cycle!.length - 1]);

    expect(findPrerequisiteCycle([{ id: 'a', prerequisite: ['b'] }, { id: 'b' }])).toBeNull();
    expect(findPrerequisiteCycle([])).toBeNull();
  });
});

describe('tasks 表头映射（三个可选列，T-009 起时限单位是「天」）', () => {
  it('中文 / 全角括号 / 英文 / 大小写 / 空白都能映射，旧「小时」表头不识别', () => {
    // 时限（天）：半角括号、全角括号、前后空白、英文大小写
    expect(taskColumnField('时限(天)')).toBe('deadlineDays');
    expect(taskColumnField('时限（天）')).toBe('deadlineDays');
    expect(taskColumnField('  时限(天)  ')).toBe('deadlineDays');
    expect(taskColumnField('deadlineDays')).toBe('deadlineDays');
    expect(taskColumnField(' DeadlineDays ')).toBe('deadlineDays');

    // T-009：旧单位「时限(小时)」故意不识别（返回 null），避免静默错读一个量级
    expect(taskColumnField('时限(小时)')).toBeNull();
    expect(taskColumnField('时限（小时）')).toBeNull();
    expect(taskColumnField(' 时限(小时) ')).toBeNull();

    expect(taskColumnField('重置周期')).toBe('reset');
    expect(taskColumnField(' Reset ')).toBe('reset');

    expect(taskColumnField('前置任务')).toBe('prerequisite');
    expect(taskColumnField(' Prerequisite ')).toBe('prerequisite');

    // 现有的中文表头不误伤
    expect(taskColumnField('优先级')).toBeNull();
    expect(taskColumnField('任务名')).toBeNull();
    expect(taskColumnField('')).toBeNull();
    expect(taskColumnField(null)).toBeNull();
  });
});
