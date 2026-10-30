-- 方案 B：不新增 schema，用 public 下的前缀表（与工具站数据靠命名隔离）
-- 在 Supabase SQL Editor 里执行一次即可。

create table if not exists public.idollife_runs (
  run_id       text primary key,
  revision     integer not null default 0,
  last_sync_at bigint  not null,
  updated_at   bigint  not null,
  seed         text    not null,
  state        jsonb   not null,
  schedule     jsonb   not null default '[]'::jsonb
);

create index if not exists idollife_runs_updated_idx
  on public.idollife_runs (updated_at desc);

-- 只有服务端（service_role）能碰；浏览器端的 anon / authenticated 全部禁止
alter table public.idollife_runs enable row level security;
revoke all on public.idollife_runs from anon, authenticated;
