/** 成长属性 */
export type StatKey = 'vocal' | 'dance' | 'acting' | 'talk';

export interface Stats {
  vocal: number;
  dance: number;
  acting: number;
  talk: number;
}

export interface LogEntry {
  at: number;
  actionId: string;
  text: string;
  staminaDelta: number;
  statDelta: Partial<Stats>;
}

/** 单局状态（P0 只保留跑通循环所需的最小字段） */
export interface RunState {
  /** 游戏内时间：排程耗尽即静止，所以这里是「最后一个已完成行动的结束时间」 */
  at: number;
  stamina: number;
  stats: Stats;
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
  /** 练哪个属性；不练属性则省略 */
  stat?: StatKey;
  /** 体力变化：负数消耗，正数恢复 */
  stamina: number;
  /** 属性成长区间 [min, max] */
  gain?: [number, number];
  /** 行动固定耗时（ms） */
  durationMs: number;
  /** 日志文案模板，{n} 会被替换成实际成长值 */
  text: string;
}

export type StopReason = 'exhausted' | 'stamina' | 'time' | null;

export interface SettleResult {
  state: RunState;
  executed: string[];
  stoppedReason: StopReason;
}
