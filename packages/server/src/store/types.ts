import type { RunState, ScheduleItem } from '@idollife/core';

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
}

export interface Store {
  kind: string;
  getRun(id: string): Promise<RunRecord | undefined>;
  putRun(rec: RunRecord): Promise<void>;
  listRuns(): Promise<RunRecord[]>;
  countRuns(): Promise<number>;
}
