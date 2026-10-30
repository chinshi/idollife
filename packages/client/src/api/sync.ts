import type { RunState, ScheduleItem } from '@idollife/core';

const BASE = import.meta.env.VITE_API_BASE ?? '/api';

export interface SyncRequest {
  runId: string;
  run: RunState;
  schedule: ScheduleItem[];
  from: number;
  to: number;
  seed: string;
}

export interface SyncResponse {
  runId: string;
  revision: number;
  accepted: string[];
  stoppedReason: string | null;
  state: RunState;
  serverTime: number;
}

/** 同步失败返回 null，让调用方走「离线模式」 */
export async function syncRun(body: SyncRequest): Promise<SyncResponse | null> {
  try {
    const res = await fetch(`${BASE}/v1/sync`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) return null;
    return (await res.json()) as SyncResponse;
  } catch {
    return null;
  }
}

export async function ping(): Promise<boolean> {
  try {
    const res = await fetch(`${BASE}/health`);
    return res.ok;
  } catch {
    return false;
  }
}
