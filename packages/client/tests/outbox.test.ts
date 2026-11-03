import { describe, expect, it } from 'vitest';
import { appendClockEvent, appendSync, capQueue, type OutboxItem } from '../src/state/outbox-queue';

const syncBody = (n: number) =>
  ({
    runId: 'r1',
    sessionId: 's1',
    run: { at: n },
    schedule: [],
    to: n,
    seed: 'seed',
  }) as never;

const eventBody = (n: number) =>
  ({
    runId: 'r1',
    sessionId: 's1',
    eventId: `e${n}`,
    type: 'start',
    speed: 1,
    at: n,
    run: { at: n },
    schedule: [],
    seed: 'seed',
    runStartAt: n,
    elapsedMs: 0,
    clientTs: n,
  }) as never;

describe('T-029 outbox 队列合并/淘汰', () => {
  it('连续入队 5 条 sync → 队列长度仍为 1，且内容是最新那条', () => {
    let queue: OutboxItem[] = [];
    for (let i = 1; i <= 5; i += 1) queue = appendSync(queue, syncBody(i));
    expect(queue).toHaveLength(1);
    expect(queue[0]!.kind).toBe('sync');
    expect((queue[0]!.body as { to: number }).to).toBe(5);
  });

  it('队列 61 条且头部是 sync → 淘汰后 clockEvent 全部保留', () => {
    const raw: OutboxItem[] = [{ kind: 'sync', body: syncBody(0) }];
    for (let i = 1; i <= 60; i += 1) raw.push({ kind: 'clockEvent', body: eventBody(i) });
    expect(raw).toHaveLength(61);

    const capped = capQueue(raw, 60);
    expect(capped).toHaveLength(60);
    expect(capped.every((item) => item.kind === 'clockEvent')).toBe(true);
    expect(capped.map((item) => (item.body as { eventId: string }).eventId)).toEqual(
      Array.from({ length: 60 }, (_, i) => `e${i + 1}`),
    );
  });
});
