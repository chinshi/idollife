import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { START_AT, createClock, type RunState } from '@idollife/core';

process.env.STORE = 'file';
process.env.DATA_DIR = mkdtempSync(join(tmpdir(), 't036-sessions-'));
const { createApp } = await import('../src/app');
const { getStore } = await import('../src/store/index');

const T0 = START_AT;
const app = createApp({ getUser: async () => ({ id: 'u1', email: null }) });
const store = getStore();
const run = {
  at: T0,
  startedAt: T0,
  stamina: 100,
  money: 5000,
  stats: { vocal: 10, dance: 10, acting: 10, talk: 10 },
  axes: { self: 50, others: 50, fit: 50 },
  fans: { byType: { stage: 0, gachi: 0, music: 0, live: 0, growth: 0, power: 0 }, loyalty: { casual: 0, dd: 0, group: 0, solo: 0 }, affection: { stage: 0, gachi: 0, music: 0, live: 0, growth: 0, power: 0 } },
  debuted: false,
  parties: [],
  activePartyId: null,
  friends: [],
  inventory: [],
  equipped: {},
  flags: {},
  pendingEvent: null,
  eventQueue: [],
  log: [],
} as RunState;
await store.putRun({
  userId: 'u1',
  runId: 'run-t036',
  revision: 1,
  lastSyncAt: T0,
  updatedAt: Date.now(),
  seed: 'seed-t036',
  run,
  schedule: [{ id: 's1', actionId: 'vocal-karaoke', startAt: T0, endAt: T0 + 600_000 }],
  clock: createClock(T0),
} as never);

async function call(path: string, body: unknown) {
  const res = await app.request(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: 'Bearer test' },
    body: JSON.stringify(body),
  });
  return { status: res.status, json: (await res.json()) as Record<string, any> };
}

const event = (sessionId: string, eventId: string) => ({
  runId: 'run-t036',
  sessionId,
  eventId,
  type: 'stop',
  speed: 1,
  at: T0,
  run,
  schedule: [{ id: 's1', actionId: 'vocal-karaoke', startAt: T0, endAt: T0 + 600_000 }],
  seed: 'seed-t036',
  runStartAt: T0,
  elapsedMs: 0,
  clientTs: Date.now(),
});

const a = await call('/api/v1/clock/start', { runId: 'run-t036', sessionId: 'A', speed: 1 });
console.log('1. A start →', a.status, 'sessionId=', a.json.clock?.sessionId, 'status=', a.json.clock?.status);
const bSes = await call('/api/v1/clock/session', { runId: 'run-t036', sessionId: 'B' });
console.log('2. B session →', bSes.status, 'holder=', bSes.json.holder);
const take = await call('/api/v1/clock/takeover', { runId: 'run-t036', sessionId: 'B', speed: 2 });
console.log('3. B takeover →', take.status, 'sessionId=', take.json.clock?.sessionId, 'ownerTs=', take.json.clock?.ownerTs);
const oldEv = await call('/api/v1/clock/event', event('A', 'ev-a'));
console.log('4. A event stop →', oldEv.status, 'error=', oldEv.json.error);
const before = (await store.getRun('run-t036'))!.clock;
const aSes = await call('/api/v1/clock/session', {
  runId: 'run-t036',
  sessionId: 'A',
  localClock: { ...createClock(T0 - 1), status: 'paused', sessionId: 'A' },
});
const after = (await store.getRun('run-t036'))!.clock;
console.log('5. A session paused →', aSes.status, 'holder=', aSes.json.holder, 'sessionId=', after.sessionId, 'gameAt 未变=', after.gameAt === before.gameAt);
const newEv = await call('/api/v1/clock/event', event('B', 'ev-b'));
console.log('6. B event stop →', newEv.status, 'error=', newEv.json.error ?? '(none)');
