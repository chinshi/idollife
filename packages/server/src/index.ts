import 'dotenv/config';
import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { settle } from '@idollife/core';
import type { RunState, ScheduleItem } from '@idollife/core';
import { getUserFromRequest } from './auth.js';
import { getStore, type RunRecord } from './store/index.js';

const app = new Hono();

app.use(
  '*',
  cors({
    origin: ['http://127.0.0.1:5273', 'http://localhost:5273'],
    allowMethods: ['GET', 'POST'],
    allowHeaders: ['content-type', 'authorization'],
  }),
);

app.get('/health', async (c) => {
  const store = getStore();
  let runs = -1;
  try {
    runs = await store.countRuns();
  } catch {
    runs = -1;
  }
  return c.json({
    ok: true,
    name: 'idollife-api',
    version: '0.4.0',
    store: store.kind,
    runs,
    serverTime: Date.now(),
  });
});

interface SyncBody {
  runId: string;
  run: RunState;
  schedule: ScheduleItem[];
  from: number;
  to: number;
  seed: string;
}

function validate(body: unknown): { error: string } | { body: SyncBody } {
  if (!body || typeof body !== 'object') return { error: 'body must be an object' };
  const b = body as Partial<SyncBody>;

  if (typeof b.runId !== 'string' || !b.runId) return { error: 'runId required' };
  if (!b.run || typeof b.run !== 'object') return { error: 'run required' };
  if (typeof b.run.at !== 'number') return { error: 'run.at must be number' };
  if (typeof b.run.stamina !== 'number') return { error: 'run.stamina must be number' };
  if (!b.run.stats || typeof b.run.stats.vocal !== 'number') return { error: 'run.stats invalid' };
  if (!Array.isArray(b.run.log)) return { error: 'run.log must be array' };
  if (!Array.isArray(b.schedule)) return { error: 'schedule must be array' };
  if (typeof b.from !== 'number' || typeof b.to !== 'number') return { error: 'from/to required' };
  if (b.to < b.from) return { error: 'to must be >= from' };
  if (typeof b.seed !== 'string') return { error: 'seed required' };

  return { body: b as SyncBody };
}

/**
 * 同步：需要登录。服务端用同一份 core 重放并写回，revision 递增。
 * - 未登录 → 401
 * - 别人的局 → 403
 * - 客户端的局比服务器旧 → 409，返回服务器状态让它回滚
 */
app.post('/v1/sync', async (c) => {
  const user = await getUserFromRequest(c);
  if (!user) return c.json({ error: 'unauthorized' }, 401);

  const raw = await c.req.json().catch(() => null);
  const parsed = validate(raw);
  if ('error' in parsed) return c.json({ error: parsed.error }, 400);

  const { runId, run, schedule, from, to, seed } = parsed.body;
  const store = getStore();

  let existing: RunRecord | undefined;
  try {
    existing = await store.getRun(runId);
  } catch (err) {
    return c.json({ error: 'store unavailable', detail: String(err) }, 503);
  }

  if (existing?.userId && existing.userId !== user.id) {
    return c.json({ error: 'forbidden' }, 403);
  }

  if (existing && existing.run.at > run.at) {
    return c.json(
      {
        runId,
        revision: existing.revision,
        accepted: [],
        stoppedReason: 'stale',
        state: existing.run,
        serverTime: Date.now(),
      },
      409,
    );
  }

  const base = existing?.run ?? run;
  const result = settle(base, schedule, from, to, seed);

  const record: RunRecord = {
    userId: user.id,
    runId,
    revision: (existing?.revision ?? 0) + 1,
    lastSyncAt: to,
    updatedAt: Date.now(),
    seed,
    run: result.state,
    schedule,
  };

  try {
    await store.putRun(record);
  } catch (err) {
    return c.json({ error: 'store write failed', detail: String(err) }, 503);
  }

  return c.json({
    runId,
    revision: record.revision,
    accepted: result.executed,
    stoppedReason: result.stoppedReason,
    state: result.state,
    serverTime: Date.now(),
  });
});

/** 当前用户最近的一局（登录后用它恢复云端进度） */
app.get('/v1/runs/latest', async (c) => {
  const user = await getUserFromRequest(c);
  if (!user) return c.json({ error: 'unauthorized' }, 401);

  try {
    const rec = await getStore().latestForUser(user.id);
    if (!rec) return c.json({ run: null }, 200);
    return c.json(rec);
  } catch (err) {
    return c.json({ error: 'store unavailable', detail: String(err) }, 503);
  }
});

app.get('/v1/runs/:id', async (c) => {
  const user = await getUserFromRequest(c);
  if (!user) return c.json({ error: 'unauthorized' }, 401);

  const rec = await getStore().getRun(c.req.param('id'));
  if (!rec) return c.json({ error: 'not found' }, 404);
  if (rec.userId && rec.userId !== user.id) return c.json({ error: 'forbidden' }, 403);

  return c.json(rec);
});

const port = Number(process.env.PORT ?? 8787);

serve({ fetch: app.fetch, port }, (info) => {
  console.log(`idollife-api listening on http://127.0.0.1:${info.port} (store: ${getStore().kind})`);
});
