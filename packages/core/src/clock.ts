/**
 * 时钟状态机（T-039）：恒 1×，服务端唯一结算。
 *
 * - status：running / paused
 * - gameAt：已结算到的游戏时间（不变量 === run.at）
 * - wallAnchor：gameAt 对应的服务端墙钟
 *
 * 纯函数：不读 Date.now() / Math.random() / DOM / localStorage。
 */
import { ACTION_MS, TIME_SCALE } from './content';
import { settle } from './settle';
import { nextPendingItem } from './plan';
import type { RunState, ScheduleItem, StopReason } from './types';

/** 真实流逝 elapsedMs 在给定倍速下推进多少游戏毫秒（D-017，唯一公式来源） */
export function gameAdvance(
  elapsedMs: number,
  speed: number,
  timeScale: number = TIME_SCALE,
): number {
  return Math.max(0, elapsedMs) * Math.max(1, speed) * Math.max(1, timeScale);
}

export const CLAMP_TOLERANCE_MS = 500;

export type ClockStatus = 'running' | 'paused';

export interface ClockState {
  status: ClockStatus;
  gameAt: number;
  wallAnchor: number;
  updatedAt: number;
}

/** 新建默认时钟：paused */
export function createClock(gameAt: number, overrides: Partial<ClockState> = {}): ClockState {
  return {
    status: 'paused',
    gameAt,
    wallAnchor: 0,
    updatedAt: 0,
    ...overrides,
  };
}

/** 推进上界：running 时 gameAt + 墙钟流逝 × timeScale + 容差；paused 时等于 gameAt */
export function maxTargetAt(clock: ClockState, serverNow: number, timeScale = TIME_SCALE): number {
  if (clock.status !== 'running') return clock.gameAt;
  return clock.gameAt + gameAdvance(serverNow - clock.wallAnchor, 1, timeScale) + CLAMP_TOLERANCE_MS;
}

/** 推进后 wallAnchor 前移已推进量，不重置成 serverNow（保留网络延迟余量） */
export function advanceAnchor(clock: ClockState, newGameAt: number, timeScale = TIME_SCALE): number {
  if (clock.status !== 'running') return clock.wallAnchor;
  return clock.wallAnchor + (newGameAt - clock.gameAt) / Math.max(1, timeScale);
}

/** 下一条未完成项结束的游戏时间；无则 null */
export function nextStopAt(schedule: ScheduleItem[]): number | null {
  const next = nextPendingItem(schedule);
  if (!next) return null;
  return next.endAt ?? next.startAt + ACTION_MS;
}

/** 给排程打「已执行」标记，并只保留最近 60 条已完成的。 */
export function markDone(schedule: ScheduleItem[], executed: string[]): ScheduleItem[] {
  if (executed.length === 0) return schedule;
  const done = new Set(executed);
  const marked = schedule.map((s) => (done.has(s.id) ? { ...s, done: true } : s));
  const doneIds = marked.filter((s) => s.done).map((s) => s.id);
  const keep = new Set(doneIds.slice(-60));
  return marked.filter((s) => !s.done || keep.has(s.id));
}

export interface CatchUpOptions {
  endAt?: number;
  maxSteps?: number;
  timeScale?: number;
}

export interface CatchUpResult {
  state: RunState;
  schedule: ScheduleItem[];
  clock: ClockState;
  executed: string[];
  stoppedReason: StopReason;
  advanced: number;
}

/** 测试/后台脚本用薄包装：相当于一次推进到上界；服务端路由不得调用 */
export function catchUp(
  run: RunState,
  schedule: ScheduleItem[],
  clock: ClockState,
  nowWall: number,
  seed: string,
  opts: CatchUpOptions = {},
): CatchUpResult {
  if (clock.status !== 'running') {
    return { state: run, schedule, clock, executed: [], stoppedReason: null, advanced: 0 };
  }
  const timeScale = Math.max(1, opts.timeScale ?? TIME_SCALE);
  const target = maxTargetAt(clock, nowWall, timeScale);
  const maxSteps = opts.maxSteps ?? 200;
  const result = settle(run, schedule, clock.gameAt, target, seed, {
    endAt: opts.endAt,
    maxSteps,
  });
  const nextSchedule = markDone(schedule, result.executed);
  const gameAt = result.state.at;
  const keepRunning =
    result.stoppedReason === 'time' ||
    result.executed.length >= maxSteps ||
    (result.stoppedReason === 'exhausted' && nextSchedule.some((s) => !s.done));
  const status: ClockStatus = keepRunning ? 'running' : 'paused';
  const wallAnchor = keepRunning ? advanceAnchor(clock, gameAt, timeScale) : 0;
  return {
    state: result.state,
    schedule: nextSchedule,
    clock: { status, gameAt, wallAnchor, updatedAt: nowWall },
    executed: result.executed,
    stoppedReason: result.stoppedReason,
    advanced: gameAt - clock.gameAt,
  };
}
