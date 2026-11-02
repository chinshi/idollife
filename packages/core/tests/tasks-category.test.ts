import { describe, expect, it } from 'vitest';
import { ACTION_MS, DAY_MS } from '../src/content';
import { createFans } from '../src/fans';
import { settle } from '../src/settle';
import {
  TASKS,
  TASK_CATEGORY_LABEL,
  autoAcceptTasks,
  briefTasks,
  expiredTimes,
  expireTasks,
  taskStatus,
  type TaskDef,
} from '../src/tasks';
import type { RunState, ScheduleItem } from '../src/types';

/**
 * T-017 · 任务三类化：自动领取 / 引导组链 / 限时触发与超时 / 简报数据。
 * 数字都追 DAY_MS / ACTION_MS。
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

const byId = (id: string): TaskDef => TASKS.find((t) => t.id === id)!;
const G1 = TASKS.filter((t) => t.category === 'guide' && t.guideGroup === 'G1');

/** G1 全部完成（taskExhausted 口径：count = times） */
const G1_DONE = Object.fromEntries(
  G1.flatMap((t) => [
    [`task:${t.id}:count`, Math.max(1, t.times)],
    [`task:${t.id}:doneAt`, T0 - 1],
    [`task:${t.id}:acceptedAt`, T0 - 1],
  ]),
);

describe('T-017 任务三类化', () => {
  it('自动领取：G1 引导任务可领时自动进入 active，并写「领取任务」日志', () => {
    const task = byId('task-vocal-20'); // G1，acceptCondition: vocal >= 10
    const before = base();
    expect(taskStatus(before, task)).toBe('claimable');

    const after = autoAcceptTasks(before);
    expect(taskStatus(after, task)).toBe('active');
    expect(after.flags[`task:${task.id}:acceptedAt`]).toBe(T0);
    expect(after.log.some((l) => l.actionId === `task-accept:${task.id}`)).toBe(true);
  });

  it('组链：G1 未全部完成时 G2 任务 hidden；G1 完成后可见', () => {
    const g2 = byId('task-dance-30'); // G2，acceptCondition: dance >= 20
    expect(taskStatus(base(), g2)).toBe('hidden');
    expect(taskStatus(base({ stats: { vocal: 10, dance: 25, acting: 10, talk: 10 } }), g2)).toBe(
      'hidden',
    );

    const unlocked = base({
      stats: { vocal: 10, dance: 25, acting: 10, talk: 10 },
      flags: { ...G1_DONE },
    });
    expect(taskStatus(unlocked, g2)).toBe('claimable');
  });

  it('G1 常驻可见（不依赖任何前置组）', () => {
    for (const task of G1) {
      expect(taskStatus(base(), task)).not.toBe('hidden');
    }
  });

  it('timed：事件未触发 → hidden；触发后自动领取（日志有领取记录）', () => {
    const task = byId('task-ev-insomnia'); // displayCondition: hasFlag("ev:insomnia")，deadlineDays: 2
    expect(taskStatus(base({ stamina: 50 }), task)).toBe('hidden');

    const triggered = base({ stamina: 50, flags: { 'ev:insomnia': true } });
    expect(taskStatus(triggered, task)).toBe('claimable');

    const after = autoAcceptTasks(triggered);
    expect(taskStatus(after, task)).toBe('active');
    expect(after.flags[`task:${task.id}:acceptedAt`]).toBe(T0);
    expect(after.log.some((l) => l.actionId === `task-accept:${task.id}`)).toBe(true);
  });

  it('timed：超时走 expired，日志文案是「限时委托…超时未完成。」', () => {
    const task = byId('task-ev-insomnia'); // 2 天
    const accepted = autoAcceptTasks(base({ stamina: 50, flags: { 'ev:insomnia': true } }));
    expect(taskStatus(accepted, task)).toBe('active');

    // 推进超过 2 个游戏日（timed 的 deadlineDays: 2）
    const late = { ...accepted, at: T0 + 3 * DAY_MS };
    expect(taskStatus(late, task)).not.toBe('hidden');
    const afterExpire = expireTasks(late);

    expect(taskStatus(afterExpire, task)).toBe('expired');
    expect(expiredTimes(afterExpire, task.id)).toBe(1);
    const log = afterExpire.log.find((l) => l.actionId === `task-expired:${task.id}`);
    expect(log?.text).toBe(`限时委托「${task.name}」超时未完成。`);
  });

  it('briefTasks：按引导/常规/限时分组，引导按组号排序，条目带 status/progress/deadline', () => {
    const groups = briefTasks(base());
    const order = ['guide', 'routine', 'timed'];
    expect(groups.some((g) => g.category === 'guide')).toBe(true);
    // 分组顺序固定 guide → routine → timed
    expect(groups.map((g) => order.indexOf(g.category))).toEqual(
      groups.map((g) => order.indexOf(g.category)).slice().sort((a, b) => a - b),
    );
    const guide = groups.find((g) => g.category === 'guide')!;
    expect(guide.tasks.length).toBeGreaterThan(0);
    for (const entry of guide.tasks) {
      expect(entry.task.guideGroup).toBe('G1');
      expect(typeof entry.status).toBe('string');
      expect('progress' in entry).toBe(true);
      expect('deadline' in entry).toBe(true);
    }
    expect(TASK_CATEGORY_LABEL).toEqual({ guide: '引导', routine: '常规', timed: '限时' });
  });

  it('briefTasks：G1 完成后出现 G2 组，且不会混入已完成（done）以外的隐藏任务', () => {
    const groups = briefTasks(base({ flags: { ...G1_DONE } }));
    const guide = groups.find((g) => g.category === 'guide');
    expect(guide).toBeDefined();
    expect(guide!.tasks.some((e) => e.task.guideGroup === 'G2')).toBe(true);
    // 所有返回的任务都不是 hidden
    for (const group of groups) {
      for (const entry of group.tasks) {
        expect(entry.status).not.toBe('hidden');
      }
    }
  });

  it('结算流程触发自动领取：一次行动后 G1 任务自动进入 active', () => {
    const task = byId('task-vocal-20');
    const schedule: ScheduleItem[] = [
      { id: 's-auto', actionId: 'vocal-karaoke', startAt: T0, endAt: T0 + 3 * ACTION_MS, done: false },
    ];
    const result = settle(base(), schedule, T0, T0 + 3 * ACTION_MS, 'seed-t017', {
      routineChance: 0,
    });
    expect(taskStatus(result.state, task)).toBe('active');
    expect(result.state.flags[`task:${task.id}:acceptedAt`]).toBe(T0 + 3 * ACTION_MS);
  });
});
