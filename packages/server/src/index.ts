import 'dotenv/config';
import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { settle } from '@idollife/core';
import type { RunState, ScheduleItem } from '@idollife/core';
import { getStore, type RunRecord } from './store/index.js';

const app = new Hono();

app.use(
  '*',
  cors({
    origin: ['http://127.0.0.1:5273', 'http://localhost:5273'],
    allowMethods: ['GET', 'POST'],
    allowHeaders: ['content-type'],
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
    version: '0.3.0',
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
 * 同步：读取服务器快照 → 用同一份 core 重放 → 写回并递增 revision。
 * 客户端落后于服务器快照时返回 409，让客户端回滚。
 */
app.post('/v1/sync', async (c) => {
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

app.get('/v1/runs/:id', async (c) => {
  const rec = await getStore().getRun(c.req.param('id'));
  if (!rec) return c.json({ error: 'not found' }, 404);
  return c.json(rec);
});

const port = Number(process.env.PORT ?? 8787);

serve({ fetch: app.fetch, port }, (info) => {
  console.log(`idollife-api listening on http://127.0.0.1:${info.port} (store: ${getStore().kind})`);
});
