import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { START_AT, createClock, type RunState, type ScheduleItem } from '@idollife/core';

/**
 * T-025 服务端时钟接口最小测试（内存/文件 store + 假登录）。
 * 用 createApp({ getUser }) 注入用户，避免依赖 Supabase。
 */
const T0 = START_AT;
const MIN = 60_000;
const USER_ID = 'user-test';

let app: Awaited<ReturnType<typeof import('../src/app').createApp>>;
let store: Awaited<ReturnType<typeof import('../src/store/index').getStore>>;
let dataDir: string;

function baseRun(over: Partial<RunState> = {}): RunState {
  return {
    at: T0,
    startedAt: T0,
    stamina: 100,
    money: 5000,
    stats: { vocal: 10, dance: 10, acting: 10, talk: 10 },
    axes: { self: 50, others: 50, fit: 50 },
    mood: 70,
    satiety: 70,
    health: 100,
    fans: { byType: { stage: 0, gachi: 0, music: 0, live: 0, growth: 0, power: 0 }, loyalty: { casual: 0, dd: 0, group: 0, solo: 0 }, affection: { stage: 0, gachi: 0, music: 0, live: 0, growth: 0, power: 0 } },
    debuted: false,
    parties: [],
    friends: [],
    activePartyId: null,
    inventory: [],
    equipped: {},
    flags: {},
    pendingEvent: null,
    eventQueue: [],
    log: [],
    ...over,
  } as RunState;
}

function scheduleItem(id = 's1'): ScheduleItem {
  return { id, actionId: 'vocal-karaoke', startAt: T0, endAt: T0 + 10 * MIN };
}

function record(runId: string, over: Record<string, unknown> = {}) {
  const run = baseRun();
  return {
    userId: USER_ID,
    runId,
    revision: 1,
    lastSyncAt: run.at,
    updatedAt: Date.now(),
    seed: 'seed-test',
    run,
    schedule: [scheduleItem()],
    clock: createClock(run.at),
    ...over,
  };
}

async function request(path: string, body?: unknown) {
  const res = await app.request(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: 'Bearer test' },
    body: JSON.stringify(body ?? {}),
  });
  const json = (await res.json()) as Record<string, unknown>;
  return { status: res.status, json };
}

beforeAll(async () => {
  dataDir = mkdtempSync(join(tmpdir(), 'idollife-server-test-'));
  process.env.STORE = 'file';
  process.env.DATA_DIR = dataDir;
  delete process.env.SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;

  const appMod = await import('../src/app');
  app = appMod.createApp({ getUser: async () => ({ id: USER_ID, email: null }) });
  const storeMod = await import('../src/store/index');
  store = storeMod.getStore();
});

afterAll(() => {
  try {
    rmSync(dataDir, { recursive: true, force: true });
  } catch {
    /* 忽略 */
  }
});

describe('T-025 服务端时钟接口', () => {
  it('start：无排程 409 no_schedule；未完成排程 → running + sessionId', async () => {
    await store.putRun(record('run-start', { schedule: [] }) as never);
    const none = await request('/api/v1/clock/start', { runId: 'run-start', sessionId: 'A' });
    expect(none.status).toBe(409);
    expect(none.json.error).toBe('no_schedule');

    const full = record('run-start2');
    await store.putRun(full as never);
    const ok = await request('/api/v1/clock/start', { runId: 'run-start2', sessionId: 'A', speed: 2 });
    expect(ok.status).toBe(200);
    const clock = ok.json.clock as { status: string; sessionId: string; speed: number };
    expect(clock.status).toBe('running');
    expect(clock.sessionId).toBe('A');
    expect(clock.speed).toBe(2);
  });

  it('too_fast：to 超过水位线 → 409', async () => {
    const rec = record('run-fast', {
      clock: { ...createClock(T0), status: 'running', wallAnchor: Date.now(), speed: 1, sessionId: 'A' },
    });
    await store.putRun(rec as never);

    const to = T0 + 10 * 365 * 24 * 3600 * 1000; // 远超
    const res = await request('/api/v1/sync', {
      runId: 'run-fast',
      sessionId: 'A',
      run: { ...rec.run, at: to },
      schedule: rec.schedule,
      to,
      seed: 'seed-test',
    });
    expect(res.status).toBe(409);
    expect(res.json.error).toBe('too_fast');
  });

  it('taken_over：不同 sessionId 调 pause → 409', async () => {
    const rec = record('run-taken', {
      clock: { ...createClock(T0), status: 'running', wallAnchor: Date.now(), speed: 1, sessionId: 'A' },
    });
    await store.putRun(rec as never);
    const res = await request('/api/v1/clock/pause', { runId: 'run-taken', sessionId: 'B' });
    expect(res.status).toBe(409);
    expect(res.json.error).toBe('taken_over');
  });

  it('mismatch：篡改 money → 409 且返回服务端重放结果', async () => {
    const rec = record('run-mismatch', {
      clock: { ...createClock(T0), status: 'idle', sessionId: 'A' },
    });
    await store.putRun(rec as never);

    const tampered = { ...rec.run, money: rec.run.money + 999 };
    const res = await request('/api/v1/sync', {
      runId: 'run-mismatch',
      sessionId: 'A',
      run: tampered,
      schedule: rec.schedule,
      to: T0,
      seed: 'seed-test',
    });
    expect(res.status).toBe(409);
    expect(res.json.error).toBe('mismatch');
    expect((res.json.state as RunState).money).toBe(rec.run.money);
  });

  it('旧记录无 clock → 默认 idle，不抛错', async () => {
    const old = record('run-old');
    const noClock = { ...old, clock: undefined };
    await store.putRun(noClock as never);

    const direct = await app.request('/api/v1/runs/run-old', {
      headers: { authorization: 'Bearer test' },
    });
    expect(direct.status).toBe(200);
    const body = (await direct.json()) as { clock?: { status?: string; gameAt?: number } };
    expect(body.clock?.status).toBe('idle');
    expect(body.clock?.gameAt).toBe(T0);
  });

  it('start 后立刻 session：下一条在 5 分钟后仍返回 running', async () => {
    const rec = record('run-start-session', {
      schedule: [
        {
          id: 'later',
          actionId: 'vocal-karaoke',
          startAt: T0 + 5 * MIN,
          endAt: T0 + 15 * MIN,
        },
      ],
    });
    await store.putRun(rec as never);

    const started = await request('/api/v1/clock/start', {
      runId: 'run-start-session',
      sessionId: 'A',
      schedule: rec.schedule,
    });
    expect(started.status).toBe(200);

    const ses = await request('/api/v1/clock/session', {
      runId: 'run-start-session',
      sessionId: 'A',
    });
    expect(ses.status).toBe(200);
    expect((ses.json.clock as { status: string }).status).toBe('running');
  });

  it('start 只写一次库（putRun 调用次数 = 1）', async () => {
    const rec = record('run-put-count');
    await store.putRun(rec as never);

    const original = store.putRun.bind(store);
    let puts = 0;
    (store as unknown as { putRun: typeof store.putRun }).putRun = async (r) => {
      puts += 1;
      return original(r);
    };
    try {
      const res = await request('/api/v1/clock/start', {
        runId: 'run-put-count',
        sessionId: 'A',
        schedule: rec.schedule,
      });
      expect(res.status).toBe(200);
      expect(puts).toBe(1);
    } finally {
      (store as unknown as { putRun: typeof store.putRun }).putRun = original;
    }
  });

  it('T-028：8 倍速起播后 1.2 真实秒上报不得 too_fast', async () => {
    const rec = record('run-tolerance');
    await store.putRun(rec as never);

    const started = await request('/api/v1/clock/start', {
      runId: 'run-tolerance',
      sessionId: 'A',
      speed: 8,
      schedule: rec.schedule,
    });
    expect(started.status).toBe(200);

    // 客户端跑 1.2 真实秒（8×20 系数）→ 192000 游戏毫秒；旧容差只有 +1000，必被 too_fast
    const to = T0 + 1200 * 8 * 20;
    const res = await request('/api/v1/sync', {
      runId: 'run-tolerance',
      sessionId: 'A',
      run: { ...rec.run, at: to },
      schedule: rec.schedule,
      to,
      seed: 'seed-test',
    });
    expect(res.status).not.toBe(0);
    expect(res.json.error).not.toBe('too_fast');
  });

  it('T-029 stop 权威性：at 前进 60 游戏秒、请求晚到，落库 gameAt 必须等于上报 at', async () => {
    const gapEnd = T0 + 60_000;
    const rec = record('run-ev-stop', {
      schedule: [
        { id: 'e1', actionId: 'vocal-karaoke', startAt: T0, endAt: gapEnd },
      ],
      clock: { ...createClock(T0), status: 'running', wallAnchor: Date.now() - 8000, speed: 1, sessionId: 'A' },
    });
    await store.putRun(rec as never);

    const res = await request('/api/v1/clock/event', {
      runId: 'run-ev-stop',
      sessionId: 'A',
      eventId: 'ev-stop-1',
      type: 'stop',
      speed: 1,
      at: gapEnd,
      run: { ...rec.run, at: gapEnd },
      schedule: rec.schedule,
      seed: 'seed-test',
      runStartAt: T0,
      elapsedMs: 3000,
      clientTs: 1000,
    });
    expect(res.status).toBe(200);
    expect((res.json.clock as { gameAt: number }).gameAt).toBe(gapEnd);
    expect((res.json.clock as { status: string }).status).toBe('paused');
  });

  it('T-029 幂等：同一 eventId 连发两次 → duplicate:true 且 revision 不变', async () => {
    const rec = record('run-ev-idem', {
      clock: { ...createClock(T0), status: 'idle', sessionId: 'A' },
    });
    await store.putRun(rec as never);

    const body = {
      runId: 'run-ev-idem',
      sessionId: 'A',
      eventId: 'ev-idem-1',
      type: 'start' as const,
      speed: 1,
      at: T0,
      run: rec.run,
      schedule: rec.schedule,
      seed: 'seed-test',
      runStartAt: T0,
      elapsedMs: 0,
      clientTs: 1000,
    };
    const first = await request('/api/v1/clock/event', body);
    const second = await request('/api/v1/clock/event', body);
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(second.json.duplicate).toBe(true);
    expect(second.json.revision).toBe(first.json.revision);
  });

  it('T-029 时长上界：at 超预算 → adjusted:true 且夹到上界，不是 409', async () => {
    const rec = record('run-ev-cap', {
      clock: { ...createClock(T0), status: 'running', wallAnchor: Date.now(), speed: 1, sessionId: 'A' },
    });
    await store.putRun(rec as never);

    const res = await request('/api/v1/clock/event', {
      runId: 'run-ev-cap',
      sessionId: 'A',
      eventId: 'ev-cap-1',
      type: 'stop',
      speed: 1,
      at: T0 + 999_999,
      run: { ...rec.run, at: T0 + 999_999 },
      schedule: rec.schedule,
      seed: 'seed-test',
      runStartAt: T0,
      elapsedMs: 1000,
      clientTs: 1000,
    });
    expect(res.status).toBe(200);
    expect(res.json.adjusted).toBe(true);
    const gameAt = (res.json.clock as { gameAt: number }).gameAt;
    expect(gameAt).toBeLessThanOrEqual(T0 + 1000 * 20 + 500);
  });

  it('T-029 丢失暂停兜底：session 带本地 paused → 返回 paused 且 gameAt===本地值', async () => {
    const pausedAt = T0 + 60_000;
    const rec = record('run-ev-lost', {
      schedule: [
        { id: 'l1', actionId: 'vocal-karaoke', startAt: T0, endAt: pausedAt },
        { id: 'l2', actionId: 'vocal-karaoke', startAt: pausedAt, endAt: pausedAt + 10 * MIN },
      ],
      clock: { ...createClock(T0), status: 'running', wallAnchor: Date.now() - 5000, speed: 1, sessionId: 'A' },
    });
    await store.putRun(rec as never);

    const res = await request('/api/v1/clock/session', {
      runId: 'run-ev-lost',
      sessionId: 'A',
      localClock: { ...createClock(pausedAt), status: 'paused', gameAt: pausedAt },
    });
    expect(res.status).toBe(200);
    expect((res.json.clock as { status: string }).status).toBe('paused');
    expect((res.json.clock as { gameAt: number }).gameAt).toBe(pausedAt);
    expect(res.json.reconciled).toBe('lost_pause');
  });

  it('T-029 乱序丢弃：clientTs 小于 lastEventTs 的 start → dropped:out_of_order，clock 不变', async () => {
    const rec = record('run-ev-order', {
      clock: { ...createClock(T0), status: 'paused', speed: 1, sessionId: 'A' },
      lastEventTs: 5000,
    });
    await store.putRun(rec as never);

    const res = await request('/api/v1/clock/event', {
      runId: 'run-ev-order',
      sessionId: 'A',
      eventId: 'ev-order-old',
      type: 'start',
      speed: 1,
      at: T0,
      run: rec.run,
      schedule: rec.schedule,
      seed: 'seed-test',
      runStartAt: T0,
      elapsedMs: 0,
      clientTs: 1000,
    });
    expect(res.status).toBe(200);
    expect(res.json.dropped).toBe('out_of_order');
    expect((res.json.clock as { status: string }).status).toBe('paused');
  });

  it('T-029 新档：服务端无记录时 start 事件自动建档', async () => {
    const run = baseRun();
    const schedule = [scheduleItem()];
    const res = await request('/api/v1/clock/event', {
      runId: 'run-ev-new',
      sessionId: 'A',
      eventId: 'ev-new-1',
      type: 'start',
      speed: 1,
      at: T0,
      run,
      schedule,
      seed: 'seed-test',
      runStartAt: T0,
      elapsedMs: 0,
      clientTs: 1000,
    });
    expect(res.status).toBe(200);
    const saved = await store.getRun('run-ev-new');
    expect(saved).toBeTruthy();
    expect(saved!.clock.status).toBe('running');
    expect(saved!.revision).toBe(1);
  });

  it('T-029 旧记录无 clock 时 event 不抛错', async () => {
    const old = record('run-ev-old');
    await store.putRun({ ...old, clock: undefined } as never);
    const res = await request('/api/v1/clock/event', {
      runId: 'run-ev-old',
      sessionId: 'A',
      eventId: 'ev-old-1',
      type: 'stop',
      speed: 1,
      at: T0,
      run: old.run,
      schedule: old.schedule,
      seed: 'seed-test',
      runStartAt: T0,
      elapsedMs: 0,
      clientTs: 1000,
    });
    expect(res.status).toBe(200);
    expect((res.json.clock as { status: string }).status).toBe('paused');
  });

  it('gap heal：executed=[] 且 to 等于某条未完成项的 startAt → 200 接受，不是 mismatch', async () => {
    // 客户端把 at 前移到下一条行动开始（不执行）；replay 会停在 clock.gameAt
    const gapStart = T0 + 30_000;
    const rec = record('run-gap', {
      schedule: [
        { id: 'g1', actionId: 'vocal-karaoke', startAt: gapStart, endAt: gapStart + 10 * MIN },
      ],
      clock: { ...createClock(T0), status: 'running', wallAnchor: Date.now() - 1000, speed: 1, sessionId: 'A' },
    });
    await store.putRun(rec as never);

    const healedRun = { ...rec.run, at: gapStart };
    const res = await request('/api/v1/sync', {
      runId: 'run-gap',
      sessionId: 'A',
      run: healedRun,
      schedule: rec.schedule,
      to: gapStart,
      seed: 'seed-test',
    });
    expect(res.status).toBe(200);
    expect((res.json.state as RunState).at).toBe(gapStart);
  });

  it('choice 不会把权威水位线改小', async () => {
    const ahead = T0 + 20 * MIN;
    const rec = record('run-choice-water', {
      clock: { ...createClock(ahead), status: 'idle', sessionId: 'A' },
    });
    await store.putRun(rec as never);

    const res = await request('/api/v1/choice', {
      runId: 'run-choice-water',
      run: { ...rec.run, at: T0 }, // 客户端本地更旧
      sessionId: 'A',
    });
    expect(res.status).toBe(200);
    expect((res.json.clock as { gameAt: number }).gameAt).toBe(ahead);
  });

  it('pause 幂等：连调两次都成功', async () => {
    const rec = record('run-pause', {
      clock: { ...createClock(T0), status: 'running', wallAnchor: Date.now(), speed: 1, sessionId: 'A' },
    });
    await store.putRun(rec as never);
    const first = await request('/api/v1/clock/pause', { runId: 'run-pause', sessionId: 'A' });
    expect(first.status).toBe(200);
    const second = await request('/api/v1/clock/pause', { runId: 'run-pause', sessionId: 'A' });
    expect(second.status).toBe(200);
    expect((second.json.clock as { status: string }).status).toBe('paused');
  });

  it('T-036 接管：B 换主、A 事件 409、B 事件 200', async () => {
    const rec = record('run-takeover', {
      clock: { ...createClock(T0), status: 'running', wallAnchor: Date.now(), speed: 1, sessionId: 'A', ownerTs: 1 },
    });
    await store.putRun(rec as never);

    const takeover = await request('/api/v1/clock/takeover', {
      runId: 'run-takeover',
      sessionId: 'B',
      speed: 2,
    });
    expect(takeover.status).toBe(200);
    const clock = takeover.json.clock as { sessionId: string; ownerTs: number };
    expect(clock.sessionId).toBe('B');
    expect(clock.ownerTs).toBeGreaterThan(0);

    const event = (sessionId: string, eventId: string) => ({
      runId: 'run-takeover',
      sessionId,
      eventId,
      type: 'stop',
      speed: 1,
      at: rec.run.at,
      run: rec.run,
      schedule: rec.schedule,
      seed: 'seed-test',
      runStartAt: rec.run.at,
      elapsedMs: 0,
      clientTs: Date.now(),
    });
    const old = await request('/api/v1/clock/event', event('A', 'ev-a'));
    expect(old.status).toBe(409);
    expect(old.json.error).toBe('taken_over');
    const fresh = await request('/api/v1/clock/event', event('B', 'ev-b'));
    expect(fresh.status).toBe(200);
  });

  it('T-036 非 holder 的 lost_pause 不抢主、不写 sessionId', async () => {
    const rec = record('run-lost-holder', {
      clock: { ...createClock(T0), status: 'running', wallAnchor: Date.now(), speed: 1, sessionId: 'B', ownerTs: 5 },
    });
    await store.putRun(rec as never);

    const before = (await store.getRun('run-lost-holder'))!.clock;
    const res = await request('/api/v1/clock/session', {
      runId: 'run-lost-holder',
      sessionId: 'A',
      localClock: { ...createClock(T0 - MIN), status: 'paused', sessionId: 'A' },
    });
    expect(res.status).toBe(200);
    expect(res.json.holder).toBe(false);
    const after = (await store.getRun('run-lost-holder'))!.clock;
    expect(after.sessionId).toBe('B');
    expect(after.gameAt).toBeGreaterThanOrEqual(before.gameAt);
  });

  it('T-036 start 非 holder 也 409，不改主', async () => {
    const rec = record('run-start-holder', {
      clock: { ...createClock(T0), status: 'running', wallAnchor: Date.now(), speed: 1, sessionId: 'A' },
    });
    await store.putRun(rec as never);
    const res = await request('/api/v1/clock/start', { runId: 'run-start-holder', sessionId: 'B' });
    expect(res.status).toBe(409);
    expect((await store.getRun('run-start-holder'))!.clock.sessionId).toBe('A');
  });
});
