import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { createClock, type ClockState } from '@idollife/core';
import type { RunRecord, Store } from './types.js';

/**
 * 表放在 public schema，用 `idollife_` 前缀与工具站数据隔离。
 * 服务端用 service_role 访问（绕过 RLS）；匿名与登录用户都不可直连。
 */
const TABLE = 'idollife_runs';

/** 8 秒硬超时：避免 Supabase 不可达时函数一直挂着 */
const timedFetch: typeof fetch = (input, init) =>
  fetch(input, { ...init, signal: AbortSignal.timeout(8000) });

interface Row {
  run_id: string;
  user_id: string | null;
  revision: number;
  last_sync_at: number;
  updated_at: number;
  seed: string;
  state: RunRecord['run'];
  schedule: RunRecord['schedule'];
  /** T-025：clock jsonb；加列前的旧记录可能为 undefined。T-029 的 appliedEvents/lastEventTs 存在同一 jsonb 里 */
  clock?: (ClockState & { appliedEvents?: string[]; lastEventTs?: number }) | null;
}

function toRecord(row: Row): RunRecord {
  return {
    userId: row.user_id,
    runId: row.run_id,
    revision: row.revision,
    lastSyncAt: row.last_sync_at,
    updatedAt: row.updated_at,
    seed: row.seed,
    run: row.state,
    schedule: row.schedule,
    // 旧记录无 clock → 默认 idle（不抛错、不要求数据迁移）
    clock: row.clock ?? createClock(row.state.at),
    appliedEvents: row.clock?.appliedEvents,
    lastEventTs: row.clock?.lastEventTs,
  };
}

export class SupabaseStore implements Store {
  kind = 'supabase';
  private client: SupabaseClient;

  constructor(url: string, serviceKey: string) {
    this.client = createClient(url, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { fetch: timedFetch },
    });
  }

  async getRun(id: string): Promise<RunRecord | undefined> {
    const { data, error } = await this.client.from(TABLE).select('*').eq('run_id', id).maybeSingle();
    if (error) throw new Error(`supabase getRun: ${error.message}`);
    return data ? toRecord(data as Row) : undefined;
  }

  async putRun(rec: RunRecord): Promise<void> {
    const row: Row = {
      run_id: rec.runId,
      user_id: rec.userId,
      revision: rec.revision,
      last_sync_at: rec.lastSyncAt,
      updated_at: rec.updatedAt,
      seed: rec.seed,
      state: rec.run,
      schedule: rec.schedule,
      // T-029：不新增列，把幂等键/事件时间塞进同一 clock jsonb
      clock: { ...rec.clock, appliedEvents: rec.appliedEvents ?? [], lastEventTs: rec.lastEventTs ?? 0 },
    };
    const { error } = await this.client.from(TABLE).upsert(row, { onConflict: 'run_id' });
    if (error) throw new Error(`supabase putRun: ${error.message}`);
  }

  async listRuns(): Promise<RunRecord[]> {
    const { data, error } = await this.client.from(TABLE).select('*').limit(200);
    if (error) throw new Error(`supabase listRuns: ${error.message}`);
    return (data as Row[]).map(toRecord);
  }

  async countRuns(): Promise<number> {
    const { count, error } = await this.client
      .from(TABLE)
      .select('run_id', { count: 'exact', head: true });
    if (error) throw new Error(`supabase countRuns: ${error.message}`);
    return count ?? 0;
  }

  async latestForUser(userId: string): Promise<RunRecord | undefined> {
    const { data, error } = await this.client
      .from(TABLE)
      .select('*')
      .eq('user_id', userId)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw new Error(`supabase latestForUser: ${error.message}`);
    return data ? toRecord(data as Row) : undefined;
  }
}
