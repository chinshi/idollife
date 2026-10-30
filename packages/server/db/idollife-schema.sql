-- idollife 在共享 Supabase 项目里的独立 schema
-- 在 Supabase 后台 → SQL Editor 里整段执行一次即可

create schema if not exists idollife;

-- 单局快照。P0 只存这一张表；动作日志等后续再加。
create table if not exists idollife.runs (
  run_id       text primary key,
  revision     integer not null default 0,
  last_sync_at bigint  not null,
  updated_at   bigint  not null,
  seed         text    not null,
  state        jsonb   not null,
  schedule     jsonb   not null default '[]'::jsonb
);

create index if not exists runs_updated_idx on idollife.runs (updated_at desc);

-- 服务端用 service_role 直接读写（绕过 RLS），所以这里不让 anon / authenticated 碰。
alter table idollife.runs enable row level security;
revoke all on idollife.runs from anon, authenticated;

grant usage on schema idollife to service_role;
grant all on all tables in schema idollife to service_role;
alter default privileges in schema idollife grant all on tables to service_role;
