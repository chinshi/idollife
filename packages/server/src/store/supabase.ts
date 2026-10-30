import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { RunRecord, Store } from './types.js';

/**
 * 表放在 public schema，用 `idollife_` 前缀与工具站数据隔离。
 * 服务端用 service_role 访问（绕过 RLS）；匿名与登录用户都不可直连。
 */
const TABLE = 'idollife_runs';

interface Row {
  run_id: string;
  user_id: string | null;
  revision: number;
  last_sync_at: number;
  updated_at: number;
  seed: string;
  state: RunRecord['run'];
  schedule: RunRecord['schedule'];
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
  };
}

export class SupabaseStore implements Store {
  kind = 'supabase';
  private client: SupabaseClient;

  constructor(url: string, serviceKey: string) {
    this.client = createClient(url, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
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
}
