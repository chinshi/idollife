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

/** token 为空或请求失败都返回 null，调用方据此走「离线/未登录」分支 */
export async function syncRun(body: SyncRequest, token: string | null): Promise<SyncResponse | null> {
  if (!token) return null;
  try {
    const res = await fetch(`${BASE}/v1/sync`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${token}`,
      },
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
