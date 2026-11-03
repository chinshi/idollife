/**
 * T-029：本地优先的串行 outbox。
 *
 * - 启停事件与结算快照走同一条队列，天然保证 start 先于其后的 sync。
 * - 同步写 localStorage，网络失败保留，成功出队；flush 单飞。
 * - 读路径（session）前可 flushWithTimeout(1500) 尽量把在途事件送到。
 */
import type { ClockState } from '@idollife/core';
import {
  sendClockEvent,
  syncRun,
  type ClockEventBody,
  type ClockEventResponse,
  type SyncRequest,
  type SyncResponse,
} from '../api/sync';
import { appendClockEvent, appendSync, type OutboxItem } from './outbox-queue';

export type { OutboxItem } from './outbox-queue';

export interface LocalClock {
  status: 'idle' | 'running' | 'paused';
  gameAt: number;
  speed: number;
  savedAt: number;
}

interface OutboxConfig {
  runId: string;
  getToken: () => Promise<string | null>;
  onSync: (
    kind: 'ok' | 'stale' | 'too_fast' | 'mismatch',
    data: SyncResponse,
  ) => void;
  onEvent: (kind: 'ok' | 'taken_over', data: ClockEventResponse) => void;
  onTakenOver: (data: ClockEventResponse | SyncResponse) => void;
  onUnauthorized: () => void;
}

const OUTBOX_PREFIX = 'idollife:outbox:';
const LOCAL_CLOCK_PREFIX = 'idollife:localClock:';

let config: OutboxConfig | null = null;
let queue: OutboxItem[] = [];
let flushing = false;
let listenersInstalled = false;

function storageKey() {
  return config ? `${OUTBOX_PREFIX}${config.runId}` : '';
}

function persist() {
  if (!config) return;
  try {
    localStorage.setItem(storageKey(), JSON.stringify(queue));
  } catch {
    /* 忽略：内存队列仍可工作 */
  }
}

function load() {
  if (!config) return;
  try {
    const raw = localStorage.getItem(storageKey());
    if (!raw) {
      queue = [];
      return;
    }
    const parsed = JSON.parse(raw) as OutboxItem[];
    queue = Array.isArray(parsed) ? parsed : [];
  } catch {
    queue = [];
  }
}

export function configureOutbox(cfg: OutboxConfig) {
  config = cfg;
  load();
  if (!listenersInstalled && typeof window !== 'undefined') {
    listenersInstalled = true;
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') void flush();
    });
    window.addEventListener('beforeunload', () => {
      void flush();
    });
  }
}

export function enqueueClockEvent(body: ClockEventBody) {
  if (!config || body.runId !== config.runId) return;
  queue = appendClockEvent(queue, body);
  persist();
}

export function enqueueSync(body: SyncRequest) {
  if (!config || body.runId !== config.runId) return;
  queue = appendSync(queue, body);
  persist();
}

export function pendingCount(): number {
  return queue.length;
}

/** 串行发送；网络错误/401 保留队列并停止本次 flush */
export async function flush(): Promise<void> {
  if (!config || flushing) return;
  flushing = true;
  const cfg = config;
  try {
    while (queue.length > 0) {
      const item = queue[0]!;
      const token = await cfg.getToken();
      if (!token) {
        cfg.onUnauthorized();
        return;
      }

      if (item.kind === 'clockEvent') {
        const outcome = await sendClockEvent(item.body, token);
        if (outcome.kind === 'error') return;
        if (outcome.kind === 'unauthorized') {
          cfg.onUnauthorized();
          return;
        }
        queue.shift();
        persist();
        if (outcome.kind === 'taken_over') {
          queue = [];
          persist();
          cfg.onEvent('taken_over', outcome.data);
          cfg.onTakenOver(outcome.data);
          return;
        }
        cfg.onEvent('ok', outcome.data);
      } else {
        const outcome = await syncRun(item.body, token);
        if (outcome.kind === 'error') return;
        if (outcome.kind === 'unauthorized') {
          cfg.onUnauthorized();
          return;
        }
        queue.shift();
        persist();
        if (outcome.kind === 'taken_over') {
          queue = [];
          persist();
          cfg.onTakenOver(outcome.data);
          return;
        }
        if (outcome.kind === 'ok') cfg.onSync('ok', outcome.data);
        else cfg.onSync(outcome.kind, outcome.data);
      }
    }
  } finally {
    flushing = false;
  }
}

/** 读路径用：最多等 timeoutMs，不取消后台 flush */
export async function flushWithTimeout(timeoutMs: number): Promise<void> {
  await Promise.race([
    flush(),
    new Promise<void>((resolve) => setTimeout(resolve, timeoutMs)),
  ]);
}

export function writeLocalClock(runId: string, clock: Omit<LocalClock, 'savedAt'>) {
  try {
    const data: LocalClock = { ...clock, savedAt: Date.now() };
    localStorage.setItem(`${LOCAL_CLOCK_PREFIX}${runId}`, JSON.stringify(data));
  } catch {
    /* 忽略 */
  }
}

export function readLocalClock(runId: string): LocalClock | null {
  try {
    const raw = localStorage.getItem(`${LOCAL_CLOCK_PREFIX}${runId}`);
    if (!raw) return null;
    const data = JSON.parse(raw) as LocalClock;
    if (!data || typeof data.gameAt !== 'number') return null;
    return data;
  } catch {
    return null;
  }
}

export function readLocalClockState(runId: string): ClockState | null {
  const local = readLocalClock(runId);
  if (!local) return null;
  return {
    status: local.status,
    gameAt: local.gameAt,
    wallAnchor: 0,
    speed: local.speed,
    sessionId: null,
    updatedAt: local.savedAt,
  };
}
