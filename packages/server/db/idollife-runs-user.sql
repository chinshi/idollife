-- 登录接入：给单局记录加归属
-- 在 Supabase SQL Editor 执行一次。

alter table public.idollife_runs
  add column if not exists user_id uuid references auth.users(id) on delete cascade;

create index if not exists idollife_runs_user_idx
  on public.idollife_runs (user_id);

-- 服务端仍用 service_role 读写；这里只是保证匿名/登录用户直连时读不到别人的东西。
grant all on public.idollife_runs to service_role;
