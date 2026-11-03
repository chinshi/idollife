import type { ClockState, RunState, ScheduleItem } from '@idollife/core';

export interface RunRecord {
  /** 归属用户；未登录时为 null */
  userId: string | null;
  runId: string;
  revision: number;
  lastSyncAt: number;
  updatedAt: number;
  seed: string;
  run: RunState;
  schedule: ScheduleItem[];
  /** T-025：服务端持有的时钟状态（旧记录缺省，读取处补 createClock(run.at)） */
  clock: ClockState;
}

export interface Store {
  kind: string;
  getRun(id: string): Promise<RunRecord | undefined>;
  putRun(rec: RunRecord): Promise<void>;
  listRuns(): Promise<RunRecord[]>;
  countRuns(): Promise<number>;
  /** 某个用户最近更新的一局 */
  latestForUser(userId: string): Promise<RunRecord | undefined>;
}
