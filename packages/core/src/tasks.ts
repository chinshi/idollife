/**
 * 任务系统：显示条件 / 领取条件 / 奖励 / 次数
 * 领取记录记在 flags 里：task:<id>:claimed = 次数
 */
import tasksJson from '../data/tasks.json';
import { matchesCondition } from './events';
import { applyFanAction } from './fans';
import type { RunState, Stats } from './types';

export type TaskType = 'once' | 'repeat';

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
  claimCondition?: Record<string, unknown>;
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

const claimKey = (id: string) => `task:${id}:claimed`;

/** 已领取次数 */
export function claimedTimes(state: RunState, taskId: string): number {
  return Number(state.flags[claimKey(taskId)] ?? 0);
}

/** 是否还能再领（次数用完后不可领） */
export function taskRemaining(state: RunState, task: TaskDef): number {
  if (task.times <= 0) return Number.POSITIVE_INFINITY;
  return Math.max(0, task.times - claimedTimes(state, task.id));
}

/** 是否显示在列表里 */
export function taskVisible(state: RunState, task: TaskDef): boolean {
  return matchesCondition(state, task.displayCondition as never);
}

/** 领取条件是否满足 */
export function taskClaimable(state: RunState, task: TaskDef): boolean {
  if (taskRemaining(state, task) <= 0) return false;
  if (!matchesCondition(state, task.claimCondition as never)) return false;
  // 一次性任务领过就不再显示为可领
  if (task.type === 'once' && claimedTimes(state, task.id) > 0) return false;
  return true;
}

export type ClaimResult = 'ok' | 'not-found' | 'hidden' | 'not-ready' | 'used-up';

/** 领奖：改数值 + 记次数 */
export function claimTask(
  state: RunState,
  taskId: string,
): { state: RunState; result: ClaimResult } {
  const task = TASKS.find((t) => t.id === taskId);
  if (!task) return { state, result: 'not-found' };
  if (!taskVisible(state, task)) return { state, result: 'hidden' };
  if (taskRemaining(state, task) <= 0) return { state, result: 'used-up' };
  if (!taskClaimable(state, task)) return { state, result: 'not-ready' };

  const next: RunState = {
    ...state,
    money: state.money + (task.rewards.money ?? 0),
    stamina: Math.max(0, Math.min(100, state.stamina + (task.rewards.stamina ?? 0))),
    stats: { ...state.stats },
    flags: { ...state.flags },
    fans: state.fans,
    log: [...state.log],
  };

  for (const [k, v] of Object.entries(task.rewards.stats ?? {})) {
    const key = k as keyof Stats;
    next.stats[key] = Math.max(0, Math.min(100, next.stats[key] + (v ?? 0)));
  }

  if (task.rewards.fans && task.rewards.fans > 0) {
    next.fans = applyFanAction(state.fans, 'stage', task.rewards.fans, 0.2);
  }

  next.flags[claimKey(task.id)] = claimedTimes(state, task.id) + 1;

  next.log.push({
    at: next.at,
    actionId: `task:${task.id}`,
    text: `完成任务「${task.name}」。（${[
      task.rewards.money ? `+¥${task.rewards.money}` : '',
      task.rewards.stamina ? `体力 +${task.rewards.stamina}` : '',
      task.rewards.fans ? `粉丝 +${task.rewards.fans}` : '',
    ]
      .filter(Boolean)
      .join(' · ') || '已记录'}）`,
    staminaDelta: task.rewards.stamina ?? 0,
    statDelta: task.rewards.stats ?? {},
    kind: 'action',
  });

  return { state: next, result: 'ok' };
}
