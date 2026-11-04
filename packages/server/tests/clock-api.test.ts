import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { START_AT, TIME_SCALE, createClock, type RunState, type ScheduleItem } from '@idollife/core';

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
    fans: {
      byType: { stage: 0, gachi: 0, music: 0, live: 0, growth: 0, power: 0 },
      loyalty: { casual: 0, dd: 0, group: 0, solo: 0 },
      affection: { stage: 0, gachi: 0, music: 0, live: 0, growth: 0, power: 0 },
    },
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

async function request(path: string, method: 'GET' | 'POST' | 'PUT', body?: unknown) {
  const res = await app.request(path, {
    method,
    headers: { 'content-type': 'application/json', authorization: 'Bearer test' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, json: (await res.json()) as Record<string, any> };
}

beforeAll(async () => {
  dataDir = mkdtempSync(join(tmpdir(), 'idollife-t039-'));
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

describe('T-039 服务端唯一结算', () => {
  it('G5 GET 纯读：running 不推进、revision 不变', async () => {
    const rec = record('g5', {
      clock: { ...createClock(T0), status: 'running', wallAnchor: Date.now() - 60_000 },
    });
    await store.putRun(rec as never);
    const res = await request('/api/v1/state?runId=g5', 'GET');
    expect(res.status).toBe(200);
    expect(res.json.revision).toBe(1);
    expect((await store.getRun('g5'))!.clock.gameAt).toBe(T0);
  });

  it('G1 超上界 targetAt 裁剪 clamped=true', async () => {
    const rec = record('g1', {
      clock: { ...createClock(T0), status: 'running', wallAnchor: Date.now() },
    });
    await store.putRun(rec as never);
    const res = await request('/api/v1/advance', 'POST', {
      runId: 'g1',
      expectedRevision: 1,
      targetAt: T0 + 999_999_999,
    });
    expect(res.status).toBe(200);
    expect(res.json.clamped).toBe(true);
    expect(res.json.clock.gameAt).toBeLessThan(T0 + 10 * MIN);
  });

  it('G2 paused 时 advance 不推进', async () => {
    const rec = record('g2');
    await store.putRun(rec as never);
    const res = await request('/api/v1/advance', 'POST', {
      runId: 'g2',
      expectedRevision: 1,
      targetAt: T0 + 999_999,
    });
    expect(res.status).toBe(200);
    expect(res.json.stepped).toBe(0);
    expect(res.json.clock.gameAt).toBe(T0);
  });

  it('G4 PUT run.at 不同 → 409 stale_clock', async () => {
    const rec = record('g4');
    await store.putRun(rec as never);
    const res = await request('/api/v1/state', 'PUT', {
      runId: 'g4',
      expectedRevision: 1,
      run: { ...rec.run, at: T0 + 1000 },
    });
    expect(res.status).toBe(409);
    expect(res.json.error).toBe('stale_clock');
  });

  it('G6 expectedRevision 过期 → 409 conflict', async () => {
    const rec = record('g6');
    await store.putRun(rec as never);
    const res = await request('/api/v1/advance', 'POST', {
      runId: 'g6',
      expectedRevision: 99,
      targetAt: T0,
    });
    expect(res.status).toBe(409);
    expect(res.json.error).toBe('conflict');
  });

  it('G7 start：无排程 / pendingEvent → 409，running 幂等', async () => {
    await store.putRun(record('g7a', { schedule: [] }) as never);
    expect((await request('/api/v1/start', 'POST', { runId: 'g7a' })).status).toBe(409);

    const pending = record('g7b', { run: baseRun({ pendingEvent: 'ev' }) });
    await store.putRun(pending as never);
    const p = await request('/api/v1/start', 'POST', { runId: 'g7b' });
    expect(p.status).toBe(409);
    expect(p.json.error).toBe('pending_event');

    const running = record('g7c', {
      clock: { ...createClock(T0), status: 'running', wallAnchor: Date.now() },
    });
    await store.putRun(running as never);
    const r = await request('/api/v1/start', 'POST', { runId: 'g7c' });
    expect(r.status).toBe(200);
    expect(r.json.revision).toBe(1);
  });

  it('G3 advance 后 wallAnchor 前移已推进量，不重置为 now', async () => {
    const wall = Date.now() - 60_000;
    const rec = record('g3', {
      clock: { ...createClock(T0), status: 'running', wallAnchor: wall },
      schedule: [
        scheduleItem('s1'),
        { id: 's2', actionId: 'vocal-karaoke', startAt: T0 + 10 * MIN, endAt: T0 + 20 * MIN },
      ],
    });
    await store.putRun(rec as never);
    const res = await request('/api/v1/advance', 'POST', {
      runId: 'g3',
      expectedRevision: 1,
      targetAt: T0 + 10 * MIN,
    });
    expect(res.status).toBe(200);
    const clock = res.json.clock as { wallAnchor: number; gameAt: number };
    expect(clock.wallAnchor).toBe(wall + (10 * MIN) / TIME_SCALE);
    expect(clock.wallAnchor).toBeLessThan(Date.now() + 1000);
    expect(clock.gameAt).toBe(T0 + 10 * MIN);
  });

  it('pause 从 running 结算并置 paused；重复 pause 幂等', async () => {
    const rec = record('pause', {
      clock: { ...createClock(T0), status: 'running', wallAnchor: Date.now() - 60_000 },
    });
    await store.putRun(rec as never);
    const first = await request('/api/v1/pause', 'POST', { runId: 'pause', targetAt: T0 + 10 * MIN });
    expect(first.status).toBe(200);
    expect(first.json.clock.status).toBe('paused');
    const rev = first.json.revision;
    const second = await request('/api/v1/pause', 'POST', { runId: 'pause' });
    expect(second.json.revision).toBe(rev);
  });

  it('G11 过期未完成项 → advance 后仍 running', async () => {
    const rec = record('g11', {
      clock: { ...createClock(T0), status: 'running', wallAnchor: Date.now() },
      schedule: [
        { id: 'old', actionId: 'vocal-karaoke', startAt: T0 - 10 * MIN, endAt: T0 - MIN },
      ],
    });
    await store.putRun(rec as never);
    const res = await request('/api/v1/advance', 'POST', {
      runId: 'g11',
      expectedRevision: 1,
      targetAt: T0 + 1000,
    });
    expect(res.status).toBe(200);
    expect(res.json.stoppedReason).toBe('exhausted');
    expect(res.json.clock.status).toBe('running');
  });

  it('G15 targetAt <= gameAt 幂等：executed=[]、revision 不变', async () => {
    const rec = record('g15', {
      clock: { ...createClock(T0), status: 'running', wallAnchor: Date.now() },
    });
    await store.putRun(rec as never);
    const res = await request('/api/v1/advance', 'POST', {
      runId: 'g15',
      expectedRevision: 1,
      targetAt: T0,
    });
    expect(res.status).toBe(200);
    expect(res.json.executed).toEqual([]);
    expect(res.json.revision).toBe(1);
  });

  it('G14 paused 时快照 nextStopAt 为 null', async () => {
    const rec = record('g14');
    await store.putRun(rec as never);
    const res = await request('/api/v1/state?runId=g14', 'GET');
    expect(res.status).toBe(200);
    expect(res.json.nextStopAt).toBeNull();
  });
});
