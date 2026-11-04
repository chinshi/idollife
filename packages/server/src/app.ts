import { Hono } from 'hono';
import { cors } from 'hono/cors';
import {
  RUN_END_AT,
  advanceAnchor,
  createClock,
  markDone,
  maxTargetAt,
  nextStopAt,
  settle,
  type ClockState,
  type RunState,
  type ScheduleItem,
} from '@idollife/core';
import { getUserFromRequest, type AuthUser } from './auth';
import { getStore, type RunRecord } from './store/index';

type GetUser = (c: Parameters<typeof getUserFromRequest>[0]) => Promise<AuthUser | null>;

function origins(): string[] {
  const raw = process.env.CORS_ORIGINS;
  if (!raw) return ['http://127.0.0.1:5273', 'http://localhost:5273'];
  return raw.split(',').map((s) => s.trim()).filter(Boolean);
}

function allowOrigin(origin: string): string | undefined {
  const list = origins();
  if (!origin) return list[0];
  if (list.includes(origin)) return origin;
  if (/^https:\/\/[a-z0-9-]+\.vercel\.app$/.test(origin)) return origin;
  if (origin === 'https://nofunoffice.com') return origin;
  if (/^https:\/\/[a-z0-9-]+(\.[a-z0-9-]+)*\.nofunoffice\.com$/.test(origin)) return origin;
  return undefined;
}

function snapshot(rec: RunRecord, extra: Record<string, unknown> = {}) {
  return {
    runId: rec.runId,
    revision: rec.revision,
    seed: rec.seed,
    run: rec.run,
    state: rec.run,
    schedule: rec.schedule,
    clock: rec.clock,
    nextStopAt: rec.clock.status === 'running' ? nextStopAt(rec.schedule) : null,
    serverTime: Date.now(),
    ...extra,
  };
}

const num = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

function validPutRun(run: unknown): run is RunState {
  if (!run || typeof run !== 'object') return false;
  const r = run as Partial<RunState>;
  return num(r.at) && num(r.stamina) && !!r.stats && num(r.stats.vocal) && Array.isArray(r.log);
}

export function createApp(options: { getUser?: GetUser } = {}) {
  const getUser = options.getUser ?? getUserFromRequest;
  const app = new Hono().basePath('/api');

  app.use(
    '*',
    cors({ origin: (origin) => allowOrigin(origin), allowMethods: ['GET', 'POST', 'PUT'], allowHeaders: ['content-type', 'authorization'] }),
  );

  app.get('/_debug', (c) =>
    c.json({ url: c.req.url, path: c.req.path, host: c.req.header('host') ?? null }),
  );

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
    return c.json({ debug: error, storeKind, ok: true, name: 'idollife-api', version: '0.7.0', runs, serverTime: Date.now() });
  });

  // ---------- T-039 GET 纯读 ----------
  app.get('/v1/state', async (c) => {
    const user = await getUser(c);
    if (!user) return c.json({ error: 'unauthorized' }, 401);
    const runId = c.req.query('runId');
    const rec = runId ? await getStore().getRun(runId) : await getStore().latestForUser(user.id);
    if (!rec) return c.json({ error: 'not_found' }, 404);
    if (rec.userId && rec.userId !== user.id) return c.json({ error: 'forbidden' }, 403);
    return c.json(snapshot(rec));
  });

  // ---------- T-039 PUT 状态变更（不结算） ----------
  app.put('/v1/state', async (c) => {
    const user = await getUser(c);
    if (!user) return c.json({ error: 'unauthorized' }, 401);
    const body = (await c.req.json().catch(() => null)) as
      | { runId?: string; expectedRevision?: number; seed?: string; run?: RunState; schedule?: ScheduleItem[] }
      | null;
    if (!body?.runId) return c.json({ error: 'runId required' }, 400);
    if (body.run !== undefined && !validPutRun(body.run)) return c.json({ error: 'bad_run' }, 400);
    if (body.schedule !== undefined && !Array.isArray(body.schedule)) return c.json({ error: 'bad_schedule' }, 400);

    const store = getStore();
    const now = Date.now();
    const rec = await store.getRun(body.runId);
    if (!rec) {
      if (!body.run) return c.json({ error: 'run required for new record' }, 400);
      const created: RunRecord = {
        userId: user.id,
        runId: body.runId,
        revision: 1,
        seed: body.seed ?? 'run-demo',
        run: body.run,
        schedule: body.schedule ?? [],
        clock: createClock(body.run.at),
        lastSyncAt: body.run.at,
        updatedAt: now,
      };
      await store.putRun(created);
      return c.json(snapshot(created));
    }
    if (rec.userId && rec.userId !== user.id) return c.json({ error: 'forbidden' }, 403);
    if (body.expectedRevision !== rec.revision) return c.json({ error: 'conflict', ...snapshot(rec) }, 409);
    if (body.run && body.run.at !== rec.run.at) return c.json({ error: 'stale_clock', ...snapshot(rec) }, 409);

    const next: RunRecord = {
      ...rec,
      run: body.run ?? rec.run,
      schedule: body.schedule ?? rec.schedule,
      revision: rec.revision + 1,
      lastSyncAt: (body.run ?? rec.run).at,
      updatedAt: now,
    };
    await store.putRun(next);
    return c.json(snapshot(next));
  });

  // ---------- T-039 唯一推进入口 ----------
  app.post('/v1/advance', async (c) => {
    const user = await getUser(c);
    if (!user) return c.json({ error: 'unauthorized' }, 401);
    const body = (await c.req.json().catch(() => null)) as
      | { runId?: string; expectedRevision?: number; targetAt?: number | null }
      | null;
    if (!body?.runId) return c.json({ error: 'runId required' }, 400);

    const store = getStore();
    const now = Date.now();
    const rec = await store.getRun(body.runId);
    if (!rec) return c.json({ error: 'not_found' }, 404);
    if (rec.userId && rec.userId !== user.id) return c.json({ error: 'forbidden' }, 403);
    if (body.expectedRevision !== rec.revision) return c.json({ error: 'conflict', ...snapshot(rec) }, 409);

    const maxTarget = maxTargetAt(rec.clock, now);
    const requested = body.targetAt == null ? maxTarget : body.targetAt;
    const target = Math.min(requested, maxTarget);
    const clamped = requested > maxTarget;
    if (target <= rec.clock.gameAt) {
      return c.json(snapshot(rec, { executed: [], stepped: 0, stoppedReason: null, clamped, clampedTo: clamped ? target : null }));
    }

    const result = settle(rec.run, rec.schedule, rec.clock.gameAt, target, rec.seed, {
      endAt: RUN_END_AT,
      maxSteps: 2000,
    });
    const schedule = markDone(rec.schedule, result.executed);
    const gameAt = result.state.at;
    const keepRunning =
      result.stoppedReason === 'time' ||
      result.stoppedReason === null ||
      result.executed.length >= 2000 ||
      (result.stoppedReason === 'exhausted' && schedule.some((s) => !s.done));
    const status: ClockState['status'] = keepRunning ? 'running' : 'paused';
    const clock: ClockState =
      status === 'running'
        ? { ...rec.clock, status, gameAt, wallAnchor: advanceAnchor(rec.clock, gameAt), updatedAt: now }
        : { ...rec.clock, status, gameAt, wallAnchor: 0, updatedAt: now };
    const next: RunRecord = {
      ...rec,
      run: result.state,
      schedule,
      clock,
      revision: rec.revision + 1,
      lastSyncAt: gameAt,
      updatedAt: now,
    };
    await store.putRun(next);
    return c.json(
      snapshot(next, {
        executed: result.executed.slice(-60),
        stepped: result.executed.length,
        stoppedReason: result.stoppedReason,
        clamped,
        clampedTo: clamped ? target : null,
      }),
    );
  });

  // ---------- T-039 start / pause（无 speed） ----------
  app.post('/v1/start', async (c) => {
    const user = await getUser(c);
    if (!user) return c.json({ error: 'unauthorized' }, 401);
    const body = (await c.req.json().catch(() => null)) as { runId?: string } | null;
    if (!body?.runId) return c.json({ error: 'runId required' }, 400);

    const store = getStore();
    const rec = await store.getRun(body.runId);
    if (!rec) return c.json({ error: 'not_found' }, 404);
    if (rec.userId && rec.userId !== user.id) return c.json({ error: 'forbidden' }, 403);
    if (!rec.schedule.some((s) => !s.done)) return c.json({ error: 'no_schedule' }, 409);
    if (rec.run.pendingEvent) return c.json({ error: 'pending_event' }, 409);
    if (rec.clock.status === 'running') return c.json(snapshot(rec));

    const now = Date.now();
    const next: RunRecord = {
      ...rec,
      revision: rec.revision + 1,
      clock: { status: 'running', gameAt: rec.run.at, wallAnchor: now, updatedAt: now },
      updatedAt: now,
    };
    await store.putRun(next);
    return c.json(snapshot(next));
  });

  app.post('/v1/pause', async (c) => {
    const user = await getUser(c);
    if (!user) return c.json({ error: 'unauthorized' }, 401);
    const body = (await c.req.json().catch(() => null)) as { runId?: string; targetAt?: number | null } | null;
    if (!body?.runId) return c.json({ error: 'runId required' }, 400);

    const store = getStore();
    const rec = await store.getRun(body.runId);
    if (!rec) return c.json({ error: 'not_found' }, 404);
    if (rec.userId && rec.userId !== user.id) return c.json({ error: 'forbidden' }, 403);
    if (rec.clock.status === 'paused') return c.json(snapshot(rec));

    const now = Date.now();
    const maxTarget = maxTargetAt(rec.clock, now);
    const target = Math.min(body.targetAt == null ? maxTarget : body.targetAt, maxTarget);
    const result = settle(rec.run, rec.schedule, rec.clock.gameAt, target, rec.seed, {
      endAt: RUN_END_AT,
      maxSteps: 2000,
    });
    const next: RunRecord = {
      ...rec,
      run: result.state,
      schedule: markDone(rec.schedule, result.executed),
      revision: rec.revision + 1,
      clock: { ...rec.clock, status: 'paused', gameAt: result.state.at, wallAnchor: 0, updatedAt: now },
      lastSyncAt: result.state.at,
      updatedAt: now,
    };
    await store.putRun(next);
    return c.json(
      snapshot(next, { executed: result.executed.slice(-60), stepped: result.executed.length, stoppedReason: result.stoppedReason }),
    );
  });

  // 兼容旧读取接口（纯读）
  app.get('/v1/runs/latest', async (c) => {
    const user = await getUser(c);
    if (!user) return c.json({ error: 'unauthorized' }, 401);
    const rec = await getStore().latestForUser(user.id);
    if (!rec) return c.json({ run: null }, 200);
    return c.json(snapshot(rec));
  });

  app.get('/v1/runs/:id', async (c) => {
    const user = await getUser(c);
    if (!user) return c.json({ error: 'unauthorized' }, 401);
    const rec = await getStore().getRun(c.req.param('id'));
    if (!rec) return c.json({ error: 'not found' }, 404);
    if (rec.userId && rec.userId !== user.id) return c.json({ error: 'forbidden' }, 403);
    return c.json(snapshot(rec));
  });

  return app;
}

export const app = createApp();
