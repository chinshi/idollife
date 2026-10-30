import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPA_URL;
const anon = process.env.SUPA_ANON;
const api = process.env.API_BASE ?? 'http://127.0.0.1:8787';

async function newUser(tag) {
  const sb = createClient(url, anon, { auth: { persistSession: false } });
  const email = `latest-${tag}+${Date.now()}@example.com`;
  const { data, error } = await sb.auth.signUp({ email, password: 'probe-pass-123456' });
  if (error || !data.session) throw new Error(`signup ${tag}: ${error?.message}`);
  return { token: data.session.access_token, id: data.session.user.id };
}

const a = await newUser('a');
const T0 = 1767258000000;
const runId = `latest-${Date.now()}`;

const sync = await fetch(`${api}/v1/sync`, {
  method: 'POST',
  headers: { 'content-type': 'application/json', authorization: `Bearer ${a.token}` },
  body: JSON.stringify({
    runId,
    run: { at: T0, stamina: 100, stats: { vocal: 10, dance: 10, acting: 10, talk: 10 }, log: [] },
    schedule: [{ id: 's1', actionId: 'vocal-karaoke', startAt: T0, endAt: T0 + 600000 }],
    from: T0,
    to: T0 + 600000,
    seed: 'latest',
  }),
});
console.log('A 同步:', sync.status);

const latestA = await fetch(`${api}/v1/runs/latest`, {
  headers: { authorization: `Bearer ${a.token}` },
});
const bodyA = await latestA.json();
console.log('A latest:', latestA.status, 'runId 匹配:', bodyA.runId === runId, 'revision:', bodyA.revision);

const b = await newUser('b');
const latestB = await fetch(`${api}/v1/runs/latest`, {
  headers: { authorization: `Bearer ${b.token}` },
});
const bodyB = await latestB.json();
console.log('B latest:', latestB.status, '返回:', JSON.stringify(bodyB));
