/**
 * 任务系统
 *
 * 状态流转：
 *   未达可见条件 → 可见但不足可领取条件 → 可领取 → 进行中 → 已完成
 *
 * 存档标记（flags）：
 *   task:<id>:acceptedAt  领取时间（游戏时间）
 *   task:<id>:doneAt      完成时间
 *   task:<id>:count       已完成次数
 */
import tasksJson from '../data/tasks.json';
import { matchesCondition } from './events';
import { applyFanAction } from './fans';
import type { RunState, Stats } from './types';

export type TaskType = 'once' | 'repeat';

export type TaskStatus = 'hidden' | 'locked' | 'claimable' | 'active' | 'done';

export interface TaskRewards {
  money?: number;
  stamina?: number;
  fans?: number;
  stats?: Partial<Record<keyof Stats, number>>;
}

export interface TaskDef {
  id: string;
  type: TaskType;
  name: string;
  displayCondition?: Record<string, unknown>;
  acceptCondition?: Record<string, unknown>;
  completeCondition?: Record<string, unknown>;
  rewards: TaskRewards;
  /** 0 = 无限制 */
  times: number;
  content: string;
  brief: string;
  priority: number;
}

export const TASKS: TaskDef[] = (tasksJson.tasks as TaskDef[]).slice().sort(
  (a, b) => a.priority - b.priority,
);

export const TASK_TYPE_LABEL: Record<string, string> = {
  once: '一次性',
  repeat: '长期',
};

const acceptedKey = (id: string) => `task:${id}:acceptedAt`;
const doneKey = (id: string) => `task:${id}:doneAt`;
const countKey = (id: string) => `task:${id}:count`;

export function acceptedAt(state: RunState, taskId: string): number {
  return Number(state.flags[acceptedKey(taskId)] ?? 0);
}

export function doneAt(state: RunState, taskId: string): number {
  return Number(state.flags[doneKey(taskId)] ?? 0);
}

export function doneTimes(state: RunState, taskId: string): number {
  return Number(state.flags[countKey(taskId)] ?? 0);
}

/** 次数用完（一次性/限次任务） */
export function taskExhausted(state: RunState, task: TaskDef): boolean {
  if (task.times <= 0) return false;
  return doneTimes(state, task.id) >= task.times;
}

/** 当前任务状态 */
export function taskStatus(state: RunState, task: TaskDef): TaskStatus {
  if (!matchesCondition(state, task.displayCondition as never)) return 'hidden';
  if (taskExhausted(state, task)) return 'done';

  const accepted = acceptedAt(state, task.id) > 0;
  if (accepted) {
    const complete = matchesCondition(state, task.completeCondition as never);
    return complete ? 'done' : 'active';
  }

  const canAccept = matchesCondition(state, task.acceptCondition as never);
  return canAccept ? 'claimable' : 'locked';
}

/** 领取任务 → 进行中 */
export function acceptTask(
  state: RunState,
  taskId: string,
): { state: RunState; result: 'ok' | 'not-found' | 'not-claimable' | 'done' } {
  const task = TASKS.find((t) => t.id === taskId);
  if (!task) return { state, result: 'not-found' };

  const status = taskStatus(state, task);
  if (status === 'done') return { state, result: 'done' };
  if (status !== 'claimable') return { state, result: 'not-claimable' };

  return {
    state: {
      ...state,
      flags: { ...state.flags, [acceptedKey(task.id)]: state.at, [doneKey(task.id)]: 0 },
      log: [
        ...state.log,
        {
          at: state.at,
          actionId: `task-accept:${task.id}`,
          text: `领取任务「${task.name}」。`,
          staminaDelta: 0,
          statDelta: {},
          kind: 'action',
        },
      ],
    },
    result: 'ok',
  };
}

/**
 * 结算任务完成：进行中的任务一旦满足完成条件，自动完成并发奖。
 * 在 settle 结束时调用（纯函数，返回新状态）。
 */
export function checkTaskCompletions(state: RunState): RunState {
  let next = state;

  for (const task of TASKS) {
    if (acceptedAt(next, task.id) <= 0) continue;
    if (!matchesCondition(next, task.completeCondition as never)) continue;
    if (doneAt(next, task.id) > 0) continue;
    if (taskExhausted(next, task)) continue;

    const rewards = task.rewards ?? {};
    const stats = { ...next.stats };
    for (const [k, v] of Object.entries(rewards.stats ?? {})) {
      const key = k as keyof Stats;
      stats[key] = Math.max(0, Math.min(100, stats[key] + (v ?? 0)));
    }

    const fanGain = rewards.fans ?? 0;
    const fans = fanGain > 0 ? applyFanAction(next.fans, 'stage', fanGain, 0.2) : next.fans;

    next = {
      ...next,
      money: next.money + (rewards.money ?? 0),
      stamina: Math.max(0, Math.min(100, next.stamina + (rewards.stamina ?? 0))),
      stats,
      fans,
      flags: {
        ...next.flags,
        [doneKey(task.id)]: next.at,
        [countKey(task.id)]: doneTimes(next, task.id) + 1,
      },
      log: [
        ...next.log,
        {
          at: next.at,
          actionId: `task-done:${task.id}`,
          text: `完成任务「${task.name}」。（${[
            rewards.money ? `+¥${rewards.money}` : '',
            rewards.stamina ? `体力 +${rewards.stamina}` : '',
            rewards.fans ? `粉丝 +${rewards.fans}` : '',
          ]
            .filter(Boolean)
            .join(' · ') || '已记录'}）`,
          staminaDelta: rewards.stamina ?? 0,
          statDelta: rewards.stats ?? {},
          kind: 'action',
        },
      ],
    };
  }

  return next;
}

/** 已完成任务（按完成时间倒序；没有完成时间的排最后） */
export function completedTasks(state: RunState): Array<{ task: TaskDef; at: number }> {
  return TASKS.filter((task) => taskStatus(state, task) === 'done')
    .map((task) => ({ task, at: doneAt(state, task.id) || acceptedAt(state, task.id) || 0 }))
    .sort((a, b) => b.at - a.at);
}

/** 进行中的任务（按领取时间正序） */
export function activeTasks(state: RunState): Array<{ task: TaskDef; at: number }> {
  return TASKS.map((task) => ({ task, at: acceptedAt(state, task.id) }))
    .filter((x) => {
      if (x.at <= 0) return false;
      return taskStatus(state, x.task) === 'active';
    })
    .sort((a, b) => a.at - b.at);
}

/** 可领取的任务 */
export function claimableTasks(state: RunState): TaskDef[] {
  return TASKS.filter((task) => taskStatus(state, task) === 'claimable');
}

/** 需要玩家注意的任务（可领取 + 已完成未看） */
export function taskBadgeCount(state: RunState): number {
  return claimableTasks(state).length;
}
