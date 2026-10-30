import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPA_URL;
const anon = process.env.SUPA_ANON;
const api = process.env.API_BASE ?? 'http://127.0.0.1:8787';

if (!url || !anon) {
  console.error('missing SUPA_URL / SUPA_ANON');
  process.exit(1);
}

const sb = createClient(url, anon, { auth: { persistSession: false } });
const email = `probe+${Date.now()}@example.com`;
const password = 'probe-pass-123456';

const { data, error } = await sb.auth.signUp({ email, password });
console.log('signup:', error ? `error=${error.message}` : 'ok');
console.log('email:', email);
console.log('has session:', !!data.session);

if (!data.session) {
  console.log('=> 邮箱验证仍开启：注册后没直接给 session');
  process.exit(0);
}

const token = data.session.access_token;
const T0 = 1767258000000;
const res = await fetch(`${api}/v1/sync`, {
  method: 'POST',
  headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
  body: JSON.stringify({
    runId: `probe-run-${Date.now()}`,
    run: { at: T0, stamina: 100, stats: { vocal: 10, dance: 10, acting: 10, talk: 10 }, log: [] },
    schedule: [
      { id: 's1', actionId: 'vocal-karaoke', startAt: T0, endAt: T0 + 600000 },
    ],
    from: T0,
    to: T0 + 600000,
    seed: 'probe',
  }),
});
console.log('sync:', res.status, (await res.text()).slice(0, 200));
