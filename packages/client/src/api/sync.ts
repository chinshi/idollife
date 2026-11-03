import type { ClockState, RunState, ScheduleItem } from '@idollife/core';

const BASE = import.meta.env.VITE_API_BASE ?? '/api';

/** 服务端补算的离线摘要（T-025） */
export interface OfflineSummary {
  from: number;
  to: number;
  executed: string[];
  stoppedReason: string | null;
}

export interface SyncRequest {
  runId: string;
  sessionId: string;
  run: RunState;
  schedule: ScheduleItem[];
  to: number;
  seed: string;
}

export interface SyncResponse {
  runId: string;
  revision: number;
  accepted: string[];
  stoppedReason: string | null;
  state: RunState;
  schedule?: ScheduleItem[];
  clock: ClockState;
  offline?: OfflineSummary | null;
  serverTime: number;
}

export type SyncOutcome =
  | { kind: 'ok'; data: SyncResponse }
  | { kind: 'stale'; data: SyncResponse }
  | { kind: 'taken_over'; data: SyncResponse }
  | { kind: 'too_fast'; data: SyncResponse }
  | { kind: 'mismatch'; data: SyncResponse }
  | { kind: 'unauthorized' }
  | { kind: 'error'; status: number };

async function post(path: string, body: unknown, token: string | null) {
  if (!token) return null;
  try {
    return await fetch(`${BASE}${path}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
    });
  } catch {
    return null;
  }
}

function reasonOf(json: unknown): string | null {
  if (json && typeof json === 'object' && 'reason' in json) {
    const r = (json as { reason?: unknown }).reason;
    return typeof r === 'string' ? r : null;
  }
  return null;
}

/** 结算上报（客户端每完成一条行动 / 批次收尾） */
export async function syncRun(body: SyncRequest, token: string | null): Promise<SyncOutcome> {
  const res = await post('/v1/sync', body, token);
  if (!res) return { kind: 'error', status: 0 };
  if (res.status === 401) return { kind: 'unauthorized' };
  if (res.status === 409 || res.status === 400) {
    const data = (await res.json().catch(() => ({}))) as SyncResponse & { reason?: string };
    const reason = reasonOf(data);
    if (reason === 'taken_over') return { kind: 'taken_over', data };
    if (reason === 'too_fast') return { kind: 'too_fast', data };
    if (reason === 'mismatch') return { kind: 'mismatch', data };
    return { kind: 'stale', data };
  }
  if (!res.ok) return { kind: 'error', status: res.status };
  return { kind: 'ok', data: (await res.json()) as SyncResponse };
}

export interface ClockResponse {
  runId: string;
  revision: number;
  clock: ClockState;
  state: RunState;
  schedule: ScheduleItem[];
  offline: OfflineSummary | null;
  serverTime: number;
  holder?: boolean;
  reconciled?: string;
}

/** T-029 本地优先的时钟事件（后台串行上传） */
export interface ClockEventBody {
  runId: string;
  sessionId: string;
  eventId: string;
  type: 'start' | 'stop';
  speed: number;
  at: number;
  run: RunState;
  schedule: ScheduleItem[];
  seed: string;
  runStartAt: number;
  elapsedMs: number;
  clientTs: number;
}

export interface ClockEventResponse {
  runId: string;
  revision: number;
  clock: ClockState;
  state: RunState;
  schedule: ScheduleItem[];
  serverTime: number;
  accepted?: string[];
  stoppedReason?: string | null;
  adjusted?: boolean;
  duplicate?: boolean;
  dropped?: string;
}

export type ClockEventOutcome =
  | { kind: 'ok'; data: ClockEventResponse }
  | { kind: 'taken_over'; data: ClockEventResponse }
  | { kind: 'unauthorized' }
  | { kind: 'error'; status: number };

/** 上传一条时钟事件；409 taken_over 单独返回 */
export async function sendClockEvent(
  body: ClockEventBody,
  token: string | null,
): Promise<ClockEventOutcome> {
  const res = await post('/v1/clock/event', body, token);
  if (!res) return { kind: 'error', status: 0 };
  if (res.status === 401) return { kind: 'unauthorized' };
  if (res.status === 409) {
    const data = (await res.json().catch(() => ({}))) as ClockEventResponse;
    return { kind: 'taken_over', data };
  }
  if (!res.ok) return { kind: 'error', status: res.status };
  return { kind: 'ok', data: (await res.json()) as ClockEventResponse };
}

export type ClockOutcome =
  | { kind: 'ok'; data: ClockResponse }
  | { kind: 'taken_over' | 'no_schedule' | 'pending_event'; data: ClockResponse & { reason?: string } }
  | { kind: 'bad_speed' }
  | { kind: 'unauthorized' }
  | { kind: 'error'; status: number };

async function clockCall(
  path: '/v1/clock/start' | '/v1/clock/pause' | '/v1/clock/session',
  body: Record<string, unknown>,
  token: string | null,
): Promise<ClockOutcome> {
  const res = await post(path, body, token);
  if (!res) return { kind: 'error', status: 0 };
  if (res.status === 401) return { kind: 'unauthorized' };
  if (res.status === 400) {
    const data = (await res.json().catch(() => ({}))) as { reason?: string };
    return data.reason === 'bad_speed' ? { kind: 'bad_speed' } : { kind: 'error', status: 400 };
  }
  if (res.status === 409) {
    const data = (await res.json().catch(() => ({}))) as ClockResponse & { reason?: string };
    const reason = data.reason;
    if (reason === 'taken_over' || reason === 'no_schedule' || reason === 'pending_event') {
      return { kind: reason, data };
    }
    return { kind: 'error', status: 409 };
  }
  if (!res.ok) return { kind: 'error', status: res.status };
  return { kind: 'ok', data: (await res.json()) as ClockResponse };
}

/** 开始/继续推进（后到者直接接管）；schedule 可选：把本地最新排程带到服务端 */
export function startClock(
  runId: string,
  sessionId: string,
  speed: number,
  token: string | null,
  schedule?: ScheduleItem[],
): Promise<ClockOutcome> {
  return clockCall('/v1/clock/start', { runId, sessionId, speed, schedule }, token);
}

/** 暂停（服务端先把流逝部分结算掉） */
export function pauseClock(
  runId: string,
  sessionId: string,
  token: string | null,
): Promise<ClockOutcome> {
  return clockCall('/v1/clock/pause', { runId, sessionId }, token);
}

/** 打开页面时确认持有者身份（T-029 可带本地 clock 做丢失暂停对账） */
export function fetchClockSession(
  runId: string,
  sessionId: string,
  token: string | null,
  localClock?: ClockState | null,
): Promise<ClockOutcome> {
  return clockCall('/v1/clock/session', { runId, sessionId, localClock }, token);
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
  clock?: ClockState;
  offline?: OfflineSummary | null;
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

/** 提交一次事件抉择后的状态（不推进时间） */
export async function pushChoice(
  runId: string,
  run: SyncRequest['run'],
  sessionId: string,
  token: string | null,
  schedule?: SyncRequest['schedule'],
): Promise<{ revision: number; clock?: ClockState; state?: RunState } | null> {
  const res = await post('/v1/choice', { runId, run, sessionId, schedule }, token);
  if (!res || !res.ok) return null;
  return (await res.json()) as { revision: number; clock?: ClockState; state?: RunState };
}
