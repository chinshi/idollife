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

export type TaskStatus = 'hidden' | 'locked' | 'claimable' | 'active' | 'completable' | 'done';

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
    if (doneAt(state, task.id) > 0) return 'done';
    const complete = matchesCondition(state, task.completeCondition as never);
    return complete ? 'completable' : 'active';
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
 * 领取任务奖励：任务处于「可领奖」状态时调用，发奖并标记完成。
 */
export function claimTaskReward(
  state: RunState,
  taskId: string,
): { state: RunState; result: 'ok' | 'not-ready' | 'not-found' } {
  const task = TASKS.find((t) => t.id === taskId);
  if (!task) return { state, result: 'not-found' };
  if (taskStatus(state, task) !== 'completable') return { state, result: 'not-ready' };

  const rewards = task.rewards ?? {};
  const stats = { ...state.stats };
  for (const [k, v] of Object.entries(rewards.stats ?? {})) {
    const key = k as keyof Stats;
    stats[key] = Math.max(0, Math.min(100, stats[key] + (v ?? 0)));
  }

  const fanGain = rewards.fans ?? 0;
  const fans = fanGain > 0 ? applyFanAction(state.fans, 'stage', fanGain, 0.2) : state.fans;

  const rewardText =
    [
      rewards.money ? `+¥${rewards.money}` : '',
      rewards.stamina ? `体力 +${rewards.stamina}` : '',
      rewards.fans ? `粉丝 +${rewards.fans}` : '',
    ]
      .filter(Boolean)
      .join(' · ') || '已记录';

  return {
    state: {
      ...state,
      money: state.money + (rewards.money ?? 0),
      stamina: Math.max(0, Math.min(100, state.stamina + (rewards.stamina ?? 0))),
      stats,
      fans,
      flags: {
        ...state.flags,
        [doneKey(task.id)]: state.at,
        [countKey(task.id)]: doneTimes(state, task.id) + 1,
      },
      log: [
        ...state.log,
        {
          at: state.at,
          actionId: `task-done:${task.id}`,
          text: `完成任务「${task.name}」。（${rewardText}）`,
          staminaDelta: rewards.stamina ?? 0,
          statDelta: rewards.stats ?? {},
          kind: 'action',
        },
      ],
    },
    result: 'ok',
  };
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

const LABELS: Record<string, string> = {
  vocal: '演唱',
  dance: '舞蹈',
  acting: '演技',
  talk: '口才',
  self: '自我',
  others: '他人',
  fit: '适配',
  stage: '舞台粉',
  gachi: '嘎起粉',
  music: '音乐粉',
  live: '现场粉',
  growth: '养成粉',
  power: '实力粉',
};

/** 把条件翻译成中文，给界面展示 */
export function describeCondition(cond?: Record<string, unknown>): string {
  if (!cond || Object.keys(cond).length === 0) return '无';
  const c = cond as Record<string, Record<string, number> | number | string[] | undefined>;
  const parts: string[] = [];

  const sum = c.statsSumAtLeast as number | undefined;
  if (typeof sum === 'number') parts.push(`四项属性总和 ≥ ${sum}`);
  for (const [k, v] of Object.entries((c.statsAtLeast as Record<string, number>) ?? {})) {
    parts.push(`${LABELS[k] ?? k} ≥ ${v}`);
  }
  for (const [k, v] of Object.entries((c.axesAtLeast as Record<string, number>) ?? {})) {
    parts.push(`${LABELS[k] ?? k} ≥ ${v}`);
  }
  for (const [k, v] of Object.entries((c.axesBelow as Record<string, number>) ?? {})) {
    parts.push(`${LABELS[k] ?? k} < ${v}`);
  }
  if (typeof c.staminaBelow === 'number') parts.push(`体力 < ${c.staminaBelow}`);
  if (typeof c.moneyAtLeast === 'number') parts.push(`资金 ≥ ${c.moneyAtLeast}`);
  if (typeof c.friendsAtLeast === 'number') parts.push(`朋友圈 ≥ ${c.friendsAtLeast} 人`);
  for (const [k, v] of Object.entries((c.fansAtLeast as Record<string, number>) ?? {})) {
    parts.push(`${LABELS[k] ?? k} ≥ ${v}`);
  }
  for (const f of (c.flagsContain as string[]) ?? []) {
    parts.push(f === 'ev:debut' ? '完成出道' : `标记 ${f}`);
  }
  return parts.join('、') || '无';
}

/** 奖励文案 */
export function describeRewards(task: TaskDef): string {
  const r = task.rewards ?? {};
  const parts = [
    r.money ? `¥${r.money}` : '',
    r.stamina ? `体力 +${r.stamina}` : '',
    r.fans ? `粉丝 +${r.fans}` : '',
    ...Object.entries(r.stats ?? {}).map(([k, v]) => `${LABELS[k] ?? k} +${v}`),
  ].filter(Boolean);
  return parts.join(' · ') || '无';
}