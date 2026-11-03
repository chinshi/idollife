/**
 * 服务端时钟权威（T-025）。
 *
 * 所有读写路径先过 `loadAndCatchUp`：读一局 → 旧记录补默认 clock → running 就补算到 now
 * （有推进则落库、revision+1）→ 返回离线摘要给客户端提示。
 */
import { catchUp, createClock, RUN_END_AT, type ClockState, type StopReason } from '@idollife/core';
import { getStore, type RunRecord } from './store/index';

export interface OfflineSummary {
  from: number;
  to: number;
  executed: string[];
  stoppedReason: StopReason;
}

export interface LoadedRun {
  rec: RunRecord;
  /** 非空表示这次读取补算了离线进度 */
  offline: OfflineSummary | null;
}

/** 读一局并做懒补算；找不到返回 null。scheduleOverride：客户端提交的最新排程（start 时带上） */
export async function loadAndCatchUp(
  runId: string,
  now: number,
  scheduleOverride?: import('@idollife/core').ScheduleItem[],
): Promise<LoadedRun | null> {
  const store = getStore();
  const found = await store.getRun(runId);
  if (!found) return null;

  // 旧记录无 clock → 补默认 idle（不抛错、不要求数据迁移）
  const rec: RunRecord = found.clock
    ? found
    : { ...found, clock: createClock(found.run.at) };
  const schedule = scheduleOverride ?? rec.schedule;

  const result = catchUp(rec.run, schedule, rec.clock, now, rec.seed, {
    endAt: RUN_END_AT,
  });

  // 有推进，或时钟状态/锚点发生变化（如命中事件后 running→idle），或客户端带来了新排程，都要落库
  const committed =
    result.advanced > 0 ||
    result.executed.length > 0 ||
    result.clock.status !== rec.clock.status ||
    result.clock.wallAnchor !== rec.clock.wallAnchor ||
    scheduleOverride !== undefined;

  if (committed) {
    const next: RunRecord = {
      ...rec,
      revision: rec.revision + 1,
      run: result.state,
      schedule: result.schedule,
      clock: result.clock,
      lastSyncAt: result.state.at,
      updatedAt: now,
    };
    await store.putRun(next);
    return {
      rec: next,
      offline:
        result.advanced > 0 || result.executed.length > 0
          ? {
              from: rec.clock.gameAt,
              to: result.state.at,
              executed: result.executed,
              stoppedReason: result.stoppedReason,
            }
          : null,
    };
  }

  return { rec, offline: null };
}

/** 统一把时钟改到指定状态并落库（revision+1） */
export async function saveClock(
  rec: RunRecord,
  clock: ClockState,
  patch: Partial<RunRecord>,
  now: number,
): Promise<RunRecord> {
  const next: RunRecord = {
    ...rec,
    ...patch,
    clock,
    revision: rec.revision + 1,
    updatedAt: now,
  };
  await getStore().putRun(next);
  return next;
}
