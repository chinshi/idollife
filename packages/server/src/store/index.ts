import { FileStore } from './file.js';
import { SupabaseStore } from './supabase.js';
import type { Store } from './types.js';

export type { RunRecord, Store } from './types.js';

let store: Store | null = null;

/**
 * 有 SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY 就用 Supabase，
 * 否则退回本地 JSON 文件——开发时不需要任何配置也能跑。
 */
export function getStore(): Store {
  if (store) return store;

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const mode = process.env.STORE; // 'file' | 'supabase'，不填则自动判断

  if (mode === 'file') {
    store = new FileStore();
    return store;
  }

  if (url && key) {
    store = new SupabaseStore(url, key);
  } else {
    store = new FileStore();
  }
  return store;
}
