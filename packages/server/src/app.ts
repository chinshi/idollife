import { Hono } from 'hono';
import { cors } from 'hono/cors';
import {
  ALLOWED_SPEEDS,
  RUN_END_AT,
  createClock,
  markDone,
  settle,
  type ClockState,
  type RunState,
  type ScheduleItem,
  type StopReason,
} from '@idollife/core';
import { getUserFromRequest, type AuthUser } from './auth';
import { getStore, type RunRecord } from './store/index';
import { loadAndCatchUp, saveClock } from './clock-service';

type GetUser = (c: Parameters<typeof getUserFromRequest>[0]) => Promise<AuthUser | null>;

function origins(): string[] {
  const raw = process.env.CORS_ORIGINS;
  if (!raw) return ['http://127.0.0.1:5273', 'http://localhost:5273'];
  return raw.split(',').map((s) => s.trim()).filter(Boolean);
}

/** 允许：本地开发的端口、显式配置的域名、任何 vercel.app 部署 */
function allowOrigin(origin: string): string | undefined {
  const list = origins();
  if (!origin) return list[0];
  if (list.includes(origin)) return origin;
  if (/^https:\/\/[a-z0-9-]+\.vercel\.app$/.test(origin)) return origin;
  // 自有域名：nofunoffice.com 及其子域
  if (origin === 'https://nofunoffice.com') return origin;
  if (/^https:\/\/[a-z0-9-]+(\.[a-z0-9-]+)*\.nofunoffice\.com$/.test(origin)) return origin;
  return undefined;
}

const fansTotal = (run: RunState) =>
  Object.values(run.fans?.byType ?? {}).reduce((n, v) => n + (Number(v) || 0), 0);

/** 服务端重放与客户端提交的比对字段（容差不做，必须完全一致） */
function sameSnapshot(a: RunState, b: RunState): boolean {
  const statsA = a.stats;
  const statsB = b.stats;
  const statKeys: Array<keyof typeof statsA> = ['vocal', 'dance', 'acting', 'talk'];
  return (
    a.at === b.at &&
    a.stamina === b.stamina &&
    a.money === b.money &&
    (a.mood ?? 70) === (b.mood ?? 70) &&
    (a.satiety ?? 70) === (b.satiety ?? 70) &&
    (a.health ?? 100) === (b.health ?? 100) &&
    statKeys.every((k) => statsA[k] === statsB[k]) &&
    (a.axes?.self ?? 50) === (b.axes?.self ?? 50) &&
    (a.axes?.others ?? 50) === (b.axes?.others ?? 50) &&
    (a.axes?.fit ?? 50) === (b.axes?.fit ?? 50) &&
    fansTotal(a) === fansTotal(b) &&
    (a.inventory ?? []).length === (b.inventory ?? []).length &&
    a.pendingEvent === b.pendingEvent &&
    a.log.length === b.log.length
  );
}

/** 时钟相关的响应体（客户端统一解析） */
function snapshot(rec: RunRecord, extra: Record<string, unknown> = {}) {
  return {
    runId: rec.runId,
    revision: rec.revision,
    clock: rec.clock,
    state: rec.run,
    schedule: rec.schedule,
    serverTime: Date.now(),
    ...extra,
  };
}

export function createApp(options: { getUser?: GetUser } = {}) {
  const getUser = options.getUser ?? getUserFromRequest;
  const app = new Hono().basePath('/api');

  app.use(
    '*',
    cors({
      origin: (origin) => allowOrigin(origin),
      allowMethods: ['GET', 'POST'],
      allowHeaders: ['content-type', 'authorization'],
    }),
  );

  app.get('/_debug', (c) => {
    return c.json({
      url: c.req.url,
      path: c.req.path,
      host: c.req.header('host') ?? null,
    });
  });

  app.get('/health', async (c) => {
    let storeKind = 'unknown';
    let runs = -1;
    let error: string | null = null;

    try {
      const store = getStore();
      storeKind = store.kind;
      runs = await store.countRuns();
    } catch (err) {
      error = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
    }

    return c.json({
      debug: error,
      storeKind,
      ok: true,
      name: 'idollife-api',
      version: '0.6.0',
      runs,
      serverTime: Date.now(),
    });
  });

  // ---------- T-025 时钟权威 ----------

  interface ClockStartBody {
    runId: string;
    sessionId: string;
    speed?: number;
    /** 客户端最新排程（可选）：start 时把本地排程带到服务端，离线补算才准 */
    schedule?: ScheduleItem[];
  }

  app.post('/v1/clock/start', async (c) => {
    const user = await getUser(c);
    if (!user) return c.json({ error: 'unauthorized' }, 401);

    const body = (await c.req.json().catch(() => null)) as Partial<ClockStartBody> | null;
    if (!body?.runId || typeof body.runId !== 'string') return c.json({ error: 'runId required' }, 400);
    if (typeof body.sessionId !== 'string' || !body.sessionId) {
      return c.json({ error: 'sessionId required' }, 400);
    }
    if (body.schedule !== undefined && !Array.isArray(body.schedule)) {
      return c.json({ error: 'schedule must be array' }, 400);
    }
    const speed = body.speed ?? 1;
    if (!ALLOWED_SPEEDS.includes(speed as (typeof ALLOWED_SPEEDS)[number])) {
      return c.json({ error: 'bad_speed', reason: 'bad_speed' }, 400);
    }

    const now = Date.now();
    const loaded = await loadAndCatchUp(body.runId, now, body.schedule);
    if (!loaded) return c.json({ error: 'not found' }, 404);
    if (loaded.rec.userId && loaded.rec.userId !== user.id) return c.json({ error: 'forbidden' }, 403);

    const rec = loaded.rec;
    if (!rec.schedule.some((s) => !s.done)) {
      return c.json({ error: 'no_schedule', reason: 'no_schedule', ...snapshot(rec) }, 409);
    }
    if (rec.run.pendingEvent) {
      return c.json({ error: 'pending_event', reason: 'pending_event', ...snapshot(rec) }, 409);
    }

    const clock: ClockState = {
      ...rec.clock,
      status: 'running',
      gameAt: rec.run.at,
      wallAnchor: now,
      speed,
      sessionId: body.sessionId,
      updatedAt: now,
    };
    const next = await saveClock(rec, clock, { lastSyncAt: rec.run.at }, now);
    return c.json(snapshot(next, { offline: loaded.offline, accepted: [] }));
  });

  interface ClockPauseBody {
    runId: string;
    sessionId: string;
  }

  app.post('/v1/clock/pause', async (c) => {
    const user = await getUser(c);
    if (!user) return c.json({ error: 'unauthorized' }, 401);

    const body = (await c.req.json().catch(() => null)) as Partial<ClockPauseBody> | null;
    if (!body?.runId || typeof body.runId !== 'string') return c.json({ error: 'runId required' }, 400);
    if (typeof body.sessionId !== 'string' || !body.sessionId) {
      return c.json({ error: 'sessionId required' }, 400);
    }

    const now = Date.now();
    const loaded = await loadAndCatchUp(body.runId, now);
    if (!loaded) return c.json({ error: 'not found' }, 404);
    if (loaded.rec.userId && loaded.rec.userId !== user.id) return c.json({ error: 'forbidden' }, 403);

    const rec = loaded.rec;
    if (rec.clock.sessionId && rec.clock.sessionId !== body.sessionId) {
      return c.json({ error: 'taken_over', reason: 'taken_over', ...snapshot(rec) }, 409);
    }

    // 幂等：已经 paused/idle 时直接返回当前状态
    if (rec.clock.status === 'paused' || rec.clock.status === 'idle') {
      return c.json(snapshot(rec, { offline: loaded.offline, accepted: [] }));
    }

    const clock: ClockState = {
      ...rec.clock,
      status: 'paused',
      gameAt: rec.run.at,
      wallAnchor: 0,
      sessionId: body.sessionId,
      updatedAt: now,
    };
    const next = await saveClock(rec, clock, { lastSyncAt: rec.run.at }, now);
    return c.json(snapshot(next, { offline: loaded.offline, accepted: [] }));
  });

  app.post('/v1/clock/session', async (c) => {
    const user = await getUser(c);
    if (!user) return c.json({ error: 'unauthorized' }, 401);

    const body = (await c.req.json().catch(() => null)) as Partial<ClockPauseBody> | null;
    if (!body?.runId || typeof body.runId !== 'string') return c.json({ error: 'runId required' }, 400);
    if (typeof body.sessionId !== 'string' || !body.sessionId) {
      return c.json({ error: 'sessionId required' }, 400);
    }

    const now = Date.now();
    const loaded = await loadAndCatchUp(body.runId, now);
    if (!loaded) return c.json({ error: 'not found' }, 404);
    if (loaded.rec.userId && loaded.rec.userId !== user.id) return c.json({ error: 'forbidden' }, 403);

    let rec = loaded.rec;
    const holder = rec.clock.sessionId === body.sessionId || rec.clock.sessionId === null;
    if (holder && rec.clock.sessionId === null) {
      // 无持有者时顺手写入，避免每次都要靠失败的 sync 才发现被接管
      const clock: ClockState = { ...rec.clock, sessionId: body.sessionId, updatedAt: now };
      rec = await saveClock(rec, clock, {}, now);
    }
    return c.json(snapshot(rec, { offline: loaded.offline, holder, accepted: [] }));
  });

  // ---------- 结算上报 ----------

  interface SyncBody {
    runId: string;
    sessionId: string;
    run: RunState;
    schedule: ScheduleItem[];
    to: number;
    seed: string;
  }

  function validateSync(body: unknown): { error: string } | { body: SyncBody } {
    if (!body || typeof body !== 'object') return { error: 'body must be an object' };
    const b = body as Partial<SyncBody>;
    if (typeof b.runId !== 'string' || !b.runId) return { error: 'runId required' };
    if (typeof b.sessionId !== 'string' || !b.sessionId) return { error: 'sessionId required' };
    if (!b.run || typeof b.run !== 'object') return { error: 'run required' };
    if (typeof b.run.at !== 'number') return { error: 'run.at must be number' };
    if (typeof b.run.stamina !== 'number') return { error: 'run.stamina must be number' };
    if (!b.run.stats || typeof b.run.stats.vocal !== 'number') return { error: 'run.stats invalid' };
    if (!Array.isArray(b.run.log)) return { error: 'run.log must be array' };
    if (!Array.isArray(b.schedule)) return { error: 'schedule must be array' };
    if (typeof b.to !== 'number') return { error: 'to required' };
    if (typeof b.seed !== 'string') return { error: 'seed required' };
    return { body: b as SyncBody };
  }

  app.post('/v1/sync', async (c) => {
    const user = await getUser(c);
    if (!user) return c.json({ error: 'unauthorized' }, 401);

    const raw = await c.req.json().catch(() => null);
    const parsed = validateSync(raw);
    if ('error' in parsed) return c.json({ error: parsed.error }, 400);
    const body = parsed.body;

    const now = Date.now();
    let loaded = await loadAndCatchUp(body.runId, now);
    if (!loaded) {
      // 新档第一次上报：创建服务端记录（clock 默认 idle；sessionId 预置）
      const created: RunRecord = {
        userId: user.id,
        runId: body.runId,
        revision: 0,
        lastSyncAt: body.run.at,
        updatedAt: now,
        seed: body.seed,
        run: body.run,
        schedule: body.schedule,
        clock: createClock(body.run.at, { sessionId: body.sessionId }),
      };
      await getStore().putRun(created);
      loaded = { rec: created, offline: null };
    }
    const rec = loaded.rec;
    if (rec.userId && rec.userId !== user.id) return c.json({ error: 'forbidden' }, 403);

    const clock = rec.clock;
    if (clock.sessionId !== body.sessionId) {
      return c.json({ error: 'taken_over', reason: 'taken_over', ...snapshot(rec) }, 409);
    }
    if (body.run.at !== body.to) {
      return c.json({ error: 'bad_to', reason: 'bad_to', ...snapshot(rec) }, 400);
    }
    if (body.to < clock.gameAt) {
      return c.json({ error: 'stale', reason: 'stale', ...snapshot(rec) }, 409);
    }

    // 水位线：最多允许 gameAt + 真实流逝 × 倍速 + 1 游戏秒容差
    const allowed =
      clock.status === 'running'
        ? clock.gameAt + Math.max(0, now - clock.wallAnchor) * clock.speed + 1000
        : clock.gameAt + 1000;
    if (body.to > allowed) {
      return c.json({ error: 'too_fast', reason: 'too_fast', ...snapshot(rec) }, 409);
    }

    // 服务端重放比对：以服务端状态 + 客户端带来的排程重算到 to
    const replay = settle(rec.run, body.schedule, clock.gameAt, body.to, body.seed, {
      endAt: RUN_END_AT,
    });
    const replaySchedule = markDone(body.schedule, replay.executed);
    const nextClock: ClockState = {
      ...clock,
      gameAt: body.to,
      wallAnchor: clock.status === 'running' ? now : 0,
      updatedAt: now,
    };

    /**
     * 白名单：跨空档前移（客户端 tick 只把 at 对齐到下一行动开始，不执行任何行动）。
     * 这种请求 replay.executed=[] 且 replay.state.at 仍是 clock.gameAt，直接按客户端 body.run 接受；
     * 否则会被 sameSnapshot 误判 mismatch，来回拉锯。
     */
    const gapHeal =
      replay.executed.length === 0 &&
      replay.state.at < body.to &&
      body.schedule.some((s) => !s.done && s.startAt === body.to);

    if (gapHeal || sameSnapshot(replay.state, body.run)) {
      const accepted: RunRecord = {
        ...rec,
        run: body.run,
        schedule: gapHeal ? markDone(body.schedule, []) : replaySchedule,
        clock: nextClock,
        revision: rec.revision + 1,
        lastSyncAt: body.to,
        updatedAt: now,
      };
      await getStore().putRun(accepted);
      return c.json(
        snapshot(accepted, {
          accepted: replay.executed,
          stoppedReason: replay.stoppedReason,
          offline: loaded.offline,
        }),
      );
    }

    // 不一致：以服务端重放结果为准写入并返回
    const authoritative: RunRecord = {
      ...rec,
      run: replay.state,
      schedule: replaySchedule,
      clock: nextClock,
      revision: rec.revision + 1,
      lastSyncAt: body.to,
      updatedAt: now,
    };
    await getStore().putRun(authoritative);
    return c.json(
      {
        error: 'mismatch',
        reason: 'mismatch',
        accepted: replay.executed,
        stoppedReason: replay.stoppedReason,
        offline: loaded.offline,
        ...snapshot(authoritative),
      },
      409,
    );
  });

  app.post('/v1/choice', async (c) => {
    const user = await getUser(c);
    if (!user) return c.json({ error: 'unauthorized' }, 401);

    const body = (await c.req.json().catch(() => null)) as
      | { runId?: string; run?: RunState; sessionId?: string }
      | null;
    if (!body?.runId || !body.run) return c.json({ error: 'runId and run required' }, 400);

    const now = Date.now();
    const loaded = await loadAndCatchUp(body.runId, now);
    if (!loaded) {
      // 新档：创建服务端记录（clock 默认 idle）
      const clock = createClock(body.run.at, {
        sessionId: typeof body.sessionId === 'string' ? body.sessionId : null,
      });
      const rec: RunRecord = {
        userId: user.id,
        runId: body.runId,
        revision: 1,
        lastSyncAt: body.run.at,
        updatedAt: now,
        seed: 'choice',
        run: body.run,
        schedule: [],
        clock,
      };
      await getStore().putRun(rec);
      return c.json({ runId: rec.runId, revision: rec.revision, clock, state: rec.run });
    }
    const rec = loaded.rec;
    if (rec.userId && rec.userId !== user.id) return c.json({ error: 'forbidden' }, 403);

    // 抉择不推进时间：run.at 不应超过权威水位线（1 游戏秒容差）
    if (body.run.at > rec.clock.gameAt + 1000) {
      return c.json({ error: 'too_fast', reason: 'too_fast', ...snapshot(rec) }, 409);
    }

    const clock: ClockState = {
      ...rec.clock,
      // 抉择不推进时间：水位线只能取「已有权威值」与「客户端 at」的较大者，绝不回退
      gameAt: Math.max(rec.clock.gameAt, body.run.at),
      updatedAt: now,
    };
    const next: RunRecord = {
      ...rec,
      run: body.run,
      clock,
      revision: rec.revision + 1,
      lastSyncAt: body.run.at,
      updatedAt: now,
    };
    await getStore().putRun(next);
    return c.json({ runId: next.runId, revision: next.revision, clock, state: next.run });
  });

  app.get('/v1/runs/latest', async (c) => {
    const user = await getUser(c);
    if (!user) return c.json({ error: 'unauthorized' }, 401);

    try {
      const rec = await getStore().latestForUser(user.id);
      if (!rec) return c.json({ run: null }, 200);
      const loaded = await loadAndCatchUp(rec.runId, Date.now());
      return c.json({ ...(loaded?.rec ?? rec), offline: loaded?.offline ?? null });
    } catch (err) {
      return c.json({ error: 'store unavailable', detail: String(err) }, 503);
    }
  });

  app.get('/v1/runs/:id', async (c) => {
    const user = await getUser(c);
    if (!user) return c.json({ error: 'unauthorized' }, 401);

    const rec = await getStore().getRun(c.req.param('id'));
    if (!rec) return c.json({ error: 'not found' }, 404);
    if (rec.userId && rec.userId !== user.id) return c.json({ error: 'forbidden' }, 403);

    const loaded = await loadAndCatchUp(rec.runId, Date.now());
    return c.json({ ...(loaded?.rec ?? rec), offline: loaded?.offline ?? null });
  });

  return app;
}

export const app = createApp();
