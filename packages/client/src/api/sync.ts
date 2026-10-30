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

export type SyncOutcome =
  | { kind: 'ok'; data: SyncResponse }
  | { kind: 'stale'; data: SyncResponse }
  | { kind: 'unauthorized' }
  | { kind: 'error'; status: number };

/** token 为空时直接返回 unauthorized，调用方据此走「未登录」分支 */
export async function syncRun(body: SyncRequest, token: string | null): Promise<SyncOutcome> {
  if (!token) return { kind: 'unauthorized' };
  try {
    const res = await fetch(`${BASE}/v1/sync`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
    });

    if (res.status === 401) return { kind: 'unauthorized' };
    if (res.status === 409) {
      return { kind: 'stale', data: (await res.json()) as SyncResponse };
    }
    if (!res.ok) return { kind: 'error', status: res.status };
    return { kind: 'ok', data: (await res.json()) as SyncResponse };
  } catch {
    return { kind: 'error', status: 0 };
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

export interface CloudRun {
  runId: string;
  revision: number;
  lastSyncAt: number;
  updatedAt: number;
  seed: string;
  run: SyncRequest['run'];
  schedule: SyncRequest['schedule'];
}

/** 取当前登录用户最近的一局；没有或失败返回 null */
export async function fetchLatestRun(token: string | null): Promise<CloudRun | null> {
  if (!token) return null;
  try {
    const res = await fetch(`${BASE}/v1/runs/latest`, {
      headers: { authorization: `Bearer ${token}` },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as CloudRun | { run: null };
    if (!('runId' in data)) return null;
    return data;
  } catch {
    return null;
  }
}
