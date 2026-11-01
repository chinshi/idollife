import type { Fans } from './fans';

/** 成长属性 */
export type StatKey = 'vocal' | 'dance' | 'acting' | 'talk';

export interface Stats {
  vocal: number;
  dance: number;
  acting: number;
  talk: number;
}

/** 三轴：自我 / 他人 / 适配（0–100，界面上隐藏，只能靠占卜看档位） */
export interface Axes {
  self: number;
  others: number;
  fit: number;
}

export type Tier = 'low' | 'mid' | 'high';

export type Bias = 'vocal' | 'dance' | 'acting' | 'talk' | 'balanced';

export interface EquipItem {
  id: string;
  name: string;
  slot: 'outfit';
  rarity: 'common' | 'rare';
  price: number;
  affix: { stat: StatKey; value: number };
}

export interface Member {
  id: string;
  name: string;
  bias: Bias;
  /** 重复招募次数，每次 +1%，上限 10 */
  dupCount: number;
}

/** 朋友圈里的人（还没加入组合） */
export interface Friend {
  id: string;
  name: string;
  bias: Bias;
  /** 认识的渠道 id */
  from: string;
  /** 认识的时间（游戏时间） */
  metAt: number;
  /** 强度系数：0.8 ~ 1.15 */
  quality: number;
  /** 已加入的组合 id；null=还在朋友圈 */
  partyId: string | null;
  /** 退团冷却截止时间（游戏时间）；0 表示无冷却 */
  cooldownUntil?: number;
  /** 重复遇到累积的默契（%），上限 10 */
  dupCount?: number;
}

/** 组合（一个玩家可以有多个） */
export interface Party {
  id: string;
  name: string;
  members: Member[];
}

export interface LogEntry {
  at: number;
  actionId: string;
  text: string;
  staminaDelta: number;
  statDelta: Partial<Stats>;
  /** 隐藏属性（三轴）是否发生变化：只记录有无，不记录数值 */
  axesChanged?: boolean;
  kind?: 'action' | 'routine' | 'choice';
}

/** 单局状态 */
export interface RunState {
  /** 开局时间（用于按周扣房租） */
  startedAt: number;
  /** 游戏内时间：排程耗尽即静止 */
  at: number;
  stamina: number;
  /** 资金；可以为负（负债） */
  money: number;
  stats: Stats;
  axes: Axes;
  fans: Fans;
  /** 是否已出道（出道后才能组组合） */
  debuted: boolean;
  /** 拥有 / 加入的组合 */
  parties: Party[];
  /** 当前操作的组合 id；没有组合时为 null */
  activePartyId: string | null;
  /** 朋友圈：认识但还没加入组合的人 */
  friends: Friend[];
  /** 背包里的装备 */
  inventory: EquipItem[];
  /** 已装备的槽位 → 物品 id */
  equipped: { outfit?: string };
  flags: Record<string, boolean | number>;
  /** 重点事件（会暂停时间），不为空时不能继续推进 */
  pendingEvent: string | null;
  /** 普通事件队列：不暂停时间，玩家有空再处理 */
  eventQueue: string[];
  log: LogEntry[];
}

export interface ScheduleItem {
  id: string;
  actionId: string;
  /** 游戏时间戳（ms） */
  startAt: number;
  endAt: number;
  /** 打勾后：执行完这一条就停止推进 */
  stopAfter?: boolean;
  /** 已经执行过（留在时间轴上给玩家看） */
  done?: boolean;
  /** 强制固定行程（系统安排，比如周末演出），不能删 */
  fixed?: boolean;
}

/** 行动分类（界面按这个分组） */
export type ActionCategory = 'growth' | 'recover' | 'work';

export interface ActionDef {
  id: string;
  name: string;
  category: ActionCategory;
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

export type StopReason =
  | 'exhausted'
  | 'stamina'
  | 'money'
  | 'time'
  | 'event'
  | 'ending'
  | 'stopped'
  | null;

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
