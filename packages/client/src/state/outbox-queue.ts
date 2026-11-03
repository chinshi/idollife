/**
 * T-029 P1-1：outbox 队列的纯函数（可单测，不碰 localStorage）。
 *
 * - sync 与队尾 sync 合并（只保留最新快照）
 * - clockEvent 永不合并、永不丢弃
 * - 总长上限 60，超出优先淘汰最旧的 sync；全是 clockEvent 时不再淘汰
 */
import type { ClockEventBody, SyncRequest } from '../api/sync';

export type OutboxItem =
  | { kind: 'clockEvent'; body: ClockEventBody }
  | { kind: 'sync'; body: SyncRequest };

export const OUTBOX_MAX = 60;

export function capQueue(queue: OutboxItem[], max = OUTBOX_MAX): OutboxItem[] {
  const next = [...queue];
  while (next.length > max) {
    const idx = next.findIndex((item) => item.kind === 'sync');
    if (idx < 0) break; // 全是玩家操作事实，绝不丢
    next.splice(idx, 1);
  }
  return next;
}

export function appendSync(queue: OutboxItem[], body: SyncRequest): OutboxItem[] {
  const next = [...queue];
  const last = next[next.length - 1];
  if (last && last.kind === 'sync') {
    next[next.length - 1] = { kind: 'sync', body };
  } else {
    next.push({ kind: 'sync', body });
  }
  return capQueue(next);
}

export function appendClockEvent(queue: OutboxItem[], body: ClockEventBody): OutboxItem[] {
  return capQueue([...queue, { kind: 'clockEvent', body }]);
}
