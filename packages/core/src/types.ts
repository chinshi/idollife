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

/** 道具稀有度（T-019；颜色在客户端 CSS，core 只给 key） */
export type Rarity = 'common' | 'uncommon' | 'rare' | 'legendary';

/** 角色身上的装备槽位（T-022）：服装 1 + 发型 1 + 发色 1 + 饰品 4 */
export type EquipSlot =
  | 'outfit'
  | 'hair'
  | 'haircolor'
  | 'accessory1'
  | 'accessory2'
  | 'accessory3'
  | 'accessory4';

/** 装备定义类别（配置表 equipments.slot 的取值） */
export type EquipCategory = 'outfit' | 'hair' | 'haircolor' | 'accessory';

/**
 * 背包条目（T-019）：消耗品按 itemId 堆叠（count 1–99）；装备每件一条（count 恒 1）。
 * itemId 指向 items.json / equipments.json；旧 shop 装备迁移失败时 itemId 为 ''，用 legacy 原样渲染。
 */
export interface InventoryEntry {
  /** 背包内实例 id（装备槽记录它） */
  id: string;
  itemId: string;
  count: number;
  /** 旧 shop 装备兜底（新表里找不到同名时保留原始 affix，不丢装备） */
  legacy?: EquipItem;
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
  kind?: 'action' | 'routine' | 'choice' | 'show';
}

/** 单局状态 */
export interface RunState {
  /** 开局时间（用于按周扣房租） */
  startedAt: number;
  /** 游戏内时间：排程耗尽即静止 */
  at: number;
  /** 偶像名；老档缺省，缺省时界面上按「未命名」处理（T-016） */
  name?: string;
  stamina: number;
  /** 资金；可以为负（负债） */
  money: number;
  stats: Stats;
  axes: Axes;
  fans: Fans;
  /** 固有属性：身高(cm)/体重(kg)/样貌（T-016c 删除身材比例） */
  innate?: Record<string, number>;
  /** 心情 0-100 */
  mood?: number;
  /** 饱腹 0-100 */
  satiety?: number;
  /** 健康 0-100（T-021；旧档缺省按 100 处理） */
  health?: number;
  /** 性格（隐藏） */
  traits?: Record<string, number>;
  /** 负向属性（隐藏） */
  negatives?: Record<string, number>;
  /** 熟练度（隐藏） */
  proficiency?: Record<string, number>;
  /** 是否已出道（出道后才能组组合） */
  debuted: boolean;
  /** 当前城市（T-032：3 三线 / 2 二线 / 1 一线 / 0 超一线；老档缺省 3） */
  city?: 0 | 1 | 2 | 3;
  /** 演出报名（T-032；老档缺省 []） */
  bookings?: Booking[];
  /** 拥有 / 加入的组合 */
  parties: Party[];
  /** 当前操作的组合 id；没有组合时为 null */
  activePartyId: string | null;
  /** 朋友圈：认识但还没加入组合的人 */
  friends: Friend[];
  /** 背包（消耗品堆叠 + 装备实例，T-019） */
  inventory: InventoryEntry[];
  /** 已装备的槽位 → 背包条目 id（T-022：7 槽） */
  equipped: {
    outfit?: string;
    hair?: string;
    haircolor?: string;
    accessory1?: string;
    accessory2?: string;
    accessory3?: string;
    accessory4?: string;
  };
  flags: Record<string, boolean | number>;
  /** 重点事件（会暂停时间），不为空时不能继续推进 */
  pendingEvent: string | null;
  /** 普通事件队列：不暂停时间，玩家有空再处理 */
  eventQueue: string[];
  /**
   * T-041：结局抉择。一旦写入就代表这局结束，重开才会清掉。
   * 老档缺省视为「还没做抉择」。
   */
  ending?: { decision: 'stay' | 'backstage' | 'leave'; at: number } | null;
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
  /** T-032：演出项 */
  kind?: 'show';
  bookingId?: string;
  /** T-032：占槽数（演出用自身 slots；普通行动缺省 1） */
  slots?: number;
}

/** T-032 演出报名 */
export interface Booking {
  id: string;
  occurrenceId: string;
  showId: string;
  name: string;
  type: 'circuit' | 'one-man' | 'comic' | 'business' | 'shoot';
  tier: 'normal' | 'large' | 'sino' | 'festival' | 'birthday' | 'graduate' | 'debut';
  slot: number;
  startAt: number;
  fee: number;
  status: 'booked' | 'announced' | 'done' | 'cancelled';
  result?: { ticket: number; goods: number; stat: number; fans: number; score: number };
}

/** 行动分类（界面按这个分组） */
export type ActionCategory = 'growth' | 'recover' | 'work' | 'performance';

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
