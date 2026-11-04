import type { ClockState, RunState, ScheduleItem } from '@idollife/core';

const BASE = import.meta.env.VITE_API_BASE ?? '/api';

export interface StateResponse {
  runId: string;
  revision: number;
  seed: string;
  run: RunState;
  state: RunState;
  schedule: ScheduleItem[];
  clock: ClockState;
  nextStopAt: number | null;
  serverTime: number;
  executed?: string[];
  stepped?: number;
  stoppedReason?: string | null;
  clamped?: boolean;
  clampedTo?: number | null;
}

export type ServerResult =
  | { kind: 'ok'; data: StateResponse }
  | { kind: 'not_found' | 'forbidden' | 'conflict' | 'stale_clock' | 'no_schedule' | 'pending_event'; data?: StateResponse }
  | { kind: 'unauthorized' }
  | { kind: 'error'; status: number };

async function request(
  path: string,
  method: 'GET' | 'POST' | 'PUT',
  body: unknown,
  token: string | null,
): Promise<ServerResult> {
  if (!token) return { kind: 'unauthorized' };
  try {
    const res = await fetch(`${BASE}${path}`, {
      method,
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (res.status === 401) return { kind: 'unauthorized' };
    if (res.status === 403) return { kind: 'forbidden' };
    if (res.status === 404) return { kind: 'not_found' };
    if (res.status === 409) {
      const data = (await res.json().catch(() => ({}))) as StateResponse & { error?: string };
      const reason = data.error as string | undefined;
      if (reason === 'stale_clock' || reason === 'no_schedule' || reason === 'pending_event') {
        return { kind: reason, data };
      }
      return { kind: 'conflict', data };
    }
    if (!res.ok) return { kind: 'error', status: res.status };
    return { kind: 'ok', data: (await res.json()) as StateResponse };
  } catch {
    return { kind: 'error', status: 0 };
  }
}

export function getState(runId: string | null, token: string | null) {
  return request(`/v1/state${runId ? `?runId=${encodeURIComponent(runId)}` : ''}`, 'GET', undefined, token);
}

export function putState(
  runId: string,
  expectedRevision: number,
  patch: { run?: RunState; schedule?: ScheduleItem[]; seed?: string },
  token: string | null,
) {
  return request('/v1/state', 'PUT', { runId, expectedRevision, ...patch }, token);
}

export function advance(
  runId: string,
  expectedRevision: number,
  targetAt: number | null,
  token: string | null,
) {
  return request('/v1/advance', 'POST', { runId, expectedRevision, targetAt }, token);
}

export function startClock(runId: string, token: string | null) {
  return request('/v1/start', 'POST', { runId }, token);
}

export function pauseClock(runId: string, targetAt: number | null, token: string | null) {
  return request('/v1/pause', 'POST', { runId, targetAt }, token);
}
