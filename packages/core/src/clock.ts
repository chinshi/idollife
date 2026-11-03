/**
 * 时钟状态机（T-025）：服务端持有权威时钟，客户端只负责播放。
 *
 * - `status`：idle（停）/ running（推进中）/ paused（玩家暂停）
 * - `gameAt`：已结算到的游戏时间（权威水位线；不变量 === 对应 RunState.at）
 * - `wallAnchor`：running 时的服务端墙钟锚点（毫秒），其余状态为 0
 *
 * 纯函数：不读 Date.now() / Math.random() / DOM / localStorage。
 */
import { TIME_SCALE } from './content';
import { settle } from './settle';
import type { RunState, ScheduleItem, StopReason } from './types';

/** 真实流逝 elapsedMs 在给定倍速下推进多少游戏毫秒（D-017，唯一公式来源） */
export function gameAdvance(
  elapsedMs: number,
  speed: number,
  timeScale: number = TIME_SCALE,
): number {
  return Math.max(0, elapsedMs) * Math.max(1, speed) * Math.max(1, timeScale);
}

/** running 时钟在 nowWall 时刻的目标游戏时间；非 running 直接返回 gameAt */
export function clockTarget(
  clock: ClockState,
  nowWall: number,
  timeScale: number = TIME_SCALE,
): number {
  const elapsed = clock.status === 'running' ? Math.max(0, nowWall - clock.wallAnchor) : 0;
  return clock.gameAt + gameAdvance(elapsed, clock.speed, timeScale);
}

/**
 * 用「本次运行时长」校验一段推进是否合法（T-029）：
 * 不受网络延迟影响，返回 gameAdvance + 半秒容差。
 */
export function elapsedBudget(
  elapsedMs: number,
  speed: number,
  timeScale: number = TIME_SCALE,
): number {
  return gameAdvance(elapsedMs, speed, timeScale) + 500;
}

export type ClockStatus = 'idle' | 'running' | 'paused';

export interface ClockState {
  status: ClockStatus;
  gameAt: number;
  wallAnchor: number;
  speed: number;
  sessionId: string | null;
  updatedAt: number;
}

export const ALLOWED_SPEEDS = [1, 2, 4, 8] as const;

/** 新建默认时钟：idle / speed 1 / 无 session */
export function createClock(gameAt: number, overrides: Partial<ClockState> = {}): ClockState {
  return {
    status: 'idle',
    gameAt,
    wallAnchor: 0,
    speed: 1,
    sessionId: null,
    updatedAt: 0,
    ...overrides,
  };
}

/**
 * 给排程打「已执行」标记，并只保留最近 60 条已完成的（与客户端旧 markExecuted 口径一致，
 * 防止 schedule 数组无线增长）。
 */
export function markDone(schedule: ScheduleItem[], executed: string[]): ScheduleItem[] {
  if (executed.length === 0) return schedule;
  const done = new Set(executed);
  const marked = schedule.map((s) => (done.has(s.id) ? { ...s, done: true } : s));
  const doneIds = marked.filter((s) => s.done).map((s) => s.id);
  const keep = new Set(doneIds.slice(-60));
  return marked.filter((s) => !s.done || keep.has(s.id));
}

export interface CatchUpOptions {
  /** 周目结束点（T0 + RUN_LENGTH_MS），到点停 */
  endAt?: number;
  /** 单次最多结算的行动条数，默认 200（防病态排程死循环） */
  maxSteps?: number;
  /** 时间尺度系数；默认 content 的 TIME_SCALE（测试/非默认档位可覆盖） */
  timeScale?: number;
}

export interface CatchUpResult {
  state: RunState;
  schedule: ScheduleItem[];
  clock: ClockState;
  executed: string[];
  stoppedReason: StopReason;
  /** 本次实际推进的游戏毫秒 */
  advanced: number;
}

/**
 * 把 running 的时钟补算到 `nowWall`。
 *
 * 铁律：同一输入下「一次算完」与「拆成多次算」结果必须一致（settle 的 rng 按 item id 派生）。
 */
export function catchUp(
  run: RunState,
  schedule: ScheduleItem[],
  clock: ClockState,
  nowWall: number,
  seed: string,
  opts: CatchUpOptions = {},
): CatchUpResult {
  const before = clock.gameAt;

  // 1) 非 running：完全不推进
  if (clock.status !== 'running') {
    return {
      state: run,
      schedule,
      clock,
      executed: [],
      stoppedReason: null,
      advanced: 0,
    };
  }

  // 2) 目标游戏时间（时钟回拨时 elapsed 取 0；speed/timeScale 兜底防脏数据除零）
  const speed = Math.max(1, clock.speed);
  const timeScale = Math.max(1, opts.timeScale ?? TIME_SCALE);
  const rate = speed * timeScale;
  const target = clockTarget(clock, nowWall, timeScale);
  const maxSteps = opts.maxSteps ?? 200;

  // 3) 结算（settle 只跑完整行动；时间落在行动中间会 stoppedReason='time'）
  const result = settle(run, schedule, clock.gameAt, target, seed, { endAt: opts.endAt });

  // 4) 排程标记
  const nextSchedule = markDone(schedule, result.executed);

  let gameAt = result.state.at;
  let status: ClockState['status'] = clock.status;
  let wallAnchor = 0;

  if (result.stoppedReason === 'time') {
    // 时间用完但排程还有（含「首条行动还没结束」）：保持 running，把未消费的零头留在锚点里
    status = 'running';
    wallAnchor = nowWall - (target - gameAt) / rate;
  } else if (result.executed.length >= maxSteps) {
    // 5) 达到单次结算上限：视为还没算完，下次继续
    status = 'running';
    wallAnchor = nowWall - Math.max(0, target - gameAt) / rate;
  } else if (result.stoppedReason === 'exhausted' && nextSchedule.some((s) => !s.done)) {
    // T-026：exhausted 不等于「跑完了」——排程还有未完成项（空档 / 时间不够一条）时必须保持 running，
    // 否则一次读路径就会把 status 打成 idle 并落库，刷新页面回到「待执行」。
    status = 'running';
    wallAnchor = nowWall - Math.max(0, target - gameAt) / rate;
  } else {
    // 真跑完（exhausted 且全 done）/ event / stamina / money / stopped / ending
    status = 'idle';
    wallAnchor = 0;
  }

  const nextClock: ClockState = {
    ...clock,
    status,
    gameAt,
    wallAnchor,
    speed,
    updatedAt: nowWall,
  };

  return {
    state: result.state,
    schedule: nextSchedule,
    clock: nextClock,
    executed: result.executed,
    stoppedReason: result.stoppedReason,
    advanced: gameAt - before,
  };
}
