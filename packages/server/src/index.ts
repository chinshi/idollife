import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { settle } from '@idollife/core';
import type { RunState, ScheduleItem } from '@idollife/core';

const app = new Hono();

app.use(
  '*',
  cors({
    origin: ['http://127.0.0.1:5273', 'http://localhost:5273'],
    allowMethods: ['GET', 'POST'],
    allowHeaders: ['content-type'],
  }),
);

app.get('/health', (c) =>
  c.json({ ok: true, name: 'idollife-api', version: '0.1.0', serverTime: Date.now() }),
);

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
 * P0 同步桩：服务器用同一份 core 重放客户端提交的排程。
 * 真实版本会：读数据库里的最新快照、按 lastSyncAt 重放、写回 revision。
 */
app.post('/v1/sync', async (c) => {
  const raw = await c.req.json().catch(() => null);
  const parsed = validate(raw);
  if ('error' in parsed) return c.json({ error: parsed.error }, 400);

  const { runId, run, schedule, from, to, seed } = parsed.body;
  const result = settle(run, schedule, from, to, seed);

  return c.json({
    runId,
    revision: 1,
    accepted: result.executed,
    stoppedReason: result.stoppedReason,
    state: result.state,
    serverTime: Date.now(),
  });
});

const port = Number(process.env.PORT ?? 8787);

serve({ fetch: app.fetch, port }, (info) => {
  console.log(`idollife-api listening on http://127.0.0.1:${info.port}`);
});
