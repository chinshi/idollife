import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createClock, type RunState, type ScheduleItem } from '@idollife/core';

/**
 * T-025 服务端时钟接口最小测试（内存/文件 store + 假登录）。
 * 用 createApp({ getUser }) 注入用户，避免依赖 Supabase。
 */
const T0 = Date.UTC(2026, 0, 1, 9, 0, 0);
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

  it('gap heal：executed=[] 且 to 等于某条未完成项的 startAt → 200 接受，不是 mismatch', async () => {
    // 客户端把 at 前移到下一条行动开始（不执行）；replay 会停在 clock.gameAt
    const gapStart = T0 + 10 * MIN;
    const rec = record('run-gap', {
      schedule: [
        { id: 'g1', actionId: 'vocal-karaoke', startAt: gapStart, endAt: gapStart + 10 * MIN },
      ],
      clock: { ...createClock(T0), status: 'running', wallAnchor: Date.now() - 10 * MIN, speed: 1, sessionId: 'A' },
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
});
