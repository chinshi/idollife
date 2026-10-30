import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPA_URL;
const anon = process.env.SUPA_ANON;
const service = process.env.SUPA_SERVICE;
const api = process.env.API_BASE ?? 'http://127.0.0.1:8787';

const mk = () => createClient(url, anon, { auth: { persistSession: false } });

async function newUser(tag) {
  const sb = mk();
  const email = `probe-${tag}+${Date.now()}@example.com`;
  const { data, error } = await sb.auth.signUp({ email, password: 'probe-pass-123456' });
  if (error || !data.session) throw new Error(`signup ${tag}: ${error?.message}`);
  return { id: data.session.user.id, token: data.session.access_token, email };
}

const a = await newUser('a');
const b = await newUser('b');
console.log('A:', a.id.slice(0, 8), ' B:', b.id.slice(0, 8));

const T0 = 1767258000000;
const runId = `own-${Date.now()}`;
const sync = await fetch(`${api}/v1/sync`, {
  method: 'POST',
  headers: { 'content-type': 'application/json', authorization: `Bearer ${a.token}` },
  body: JSON.stringify({
    runId,
    run: { at: T0, stamina: 100, stats: { vocal: 10, dance: 10, acting: 10, talk: 10 }, log: [] },
    schedule: [{ id: 's1', actionId: 'vocal-karaoke', startAt: T0, endAt: T0 + 600000 }],
    from: T0,
    to: T0 + 600000,
    seed: 'own',
  }),
});
console.log('A 同步:', sync.status);

const readA = await fetch(`${api}/v1/runs/${runId}`, {
  headers: { authorization: `Bearer ${a.token}` },
});
console.log('A 读自己的:', readA.status);

const readB = await fetch(`${api}/v1/runs/${runId}`, {
  headers: { authorization: `Bearer ${b.token}` },
});
console.log('B 读别人的:', readB.status, '(应为 403)');

const sbService = createClient(url, service, { auth: { persistSession: false } });
const { data, error } = await sbService
  .from('idollife_runs')
  .select('run_id,user_id,revision')
  .eq('run_id', runId)
  .maybeSingle();
console.log('库中归属:', error ? error.message : data, '| 是否等于 A:', data?.user_id === a.id);
