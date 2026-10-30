import type { Fans } from './fans';

/** 成长属性 */
export type StatKey = 'vocal' | 'dance' | 'acting' | 'talk';

export interface Stats {
  vocal: number;
  dance: number;
  acting: number;
  talk: number;
}

/** 三轴：自我 / 他人 / 适配（0–100，界面只显示档位） */
export interface Axes {
  self: number;
  others: number;
  fit: number;
}

export type Tier = 'low' | 'mid' | 'high';

export type Bias = 'vocal' | 'dance' | 'acting' | 'talk' | 'balanced';

export interface Member {
  id: string;
  name: string;
  bias: Bias;
  /** 重复招募次数，每次 +1%，上限 10 */
  dupCount: number;
}

export interface LogEntry {
  at: number;
  actionId: string;
  text: string;
  staminaDelta: number;
  statDelta: Partial<Stats>;
  kind?: 'action' | 'routine' | 'choice';
}

/** 单局状态（P0 只保留跑通循环所需字段） */
export interface RunState {
  /** 游戏内时间：排程耗尽即静止 */
  at: number;
  stamina: number;
  /** 资金；可以为负（负债） */
  money: number;
  stats: Stats;
  axes: Axes;
  fans: Fans;
  /** 组合里的 NPC 成员（不含主角） */
  party: Member[];
  flags: Record<string, boolean | number>;
  /** 待玩家抉择的剧情事件 id；不为空时不能继续推进 */
  pendingEvent: string | null;
  log: LogEntry[];
}

export interface ScheduleItem {
  id: string;
  actionId: string;
  /** 真实时间戳（ms） */
  startAt: number;
  endAt: number;
}

export interface ActionDef {
  id: string;
  name: string;
  stat?: StatKey;
  /** 体力变化：负数消耗，正数恢复 */
  stamina: number;
  /** 属性成长区间 [min, max] */
  gain?: [number, number];
  /** 金钱消耗（正数表示要花这么多） */
  cost?: number;
  /** 金钱收入 */
  money?: number;
  durationMs: number;
  text: string;
}

export type StopReason = 'exhausted' | 'stamina' | 'money' | 'time' | 'event' | 'ending' | null;

export interface SettleResult {
  state: RunState;
  executed: string[];
  stoppedReason: StopReason;
}

export function tierOf(v: number): Tier {
  if (v >= 67) return 'high';
  if (v >= 34) return 'mid';
  return 'low';
}
