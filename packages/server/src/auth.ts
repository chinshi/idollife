import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Context } from 'hono';

let authClient: SupabaseClient | null = null;

const timedFetch: typeof fetch = (input, init) =>
  fetch(input, { ...init, signal: AbortSignal.timeout(8000) });

function client(): SupabaseClient | null {
  if (authClient) return authClient;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  authClient = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: timedFetch },
  });
  return authClient;
}

export interface AuthUser {
  id: string;
  email: string | null;
}

/**
 * T-026：进程内 token → user 缓存（5 分钟）。
 * 同一 token 在几分钟内重复走 `auth.getUser` 没有意义，跨境部署下每次约 1.1s。
 * 只缓存成功结果；401 / 出错时删除对应项，避免吊销后继续放行。
 */
const USER_CACHE_TTL = 5 * 60 * 1000;
const userCache = new Map<string, { user: AuthUser; exp: number }>();

/** 从 Authorization: Bearer <access_token> 解析出用户；失败返回 null */
export async function getUserFromRequest(c: Context): Promise<AuthUser | null> {
  const header = c.req.header('authorization') ?? '';
  if (!header.toLowerCase().startsWith('bearer ')) return null;

  const token = header.slice(7).trim();
  if (!token) return null;

  const cached = userCache.get(token);
  if (cached && cached.exp > Date.now()) return cached.user;
  if (cached) userCache.delete(token);

  const sb = client();
  if (!sb) return null;

  try {
    const { data, error } = await sb.auth.getUser(token);
    if (error || !data.user) {
      userCache.delete(token);
      return null;
    }
    const user: AuthUser = { id: data.user.id, email: data.user.email ?? null };
    // 简单防无限增长：超过 500 个 token 时清掉过期项
    if (userCache.size > 500) {
      const now = Date.now();
      for (const [k, v] of userCache) if (v.exp <= now) userCache.delete(k);
    }
    userCache.set(token, { user, exp: Date.now() + USER_CACHE_TTL });
    return user;
  } catch {
    userCache.delete(token);
    return null;
  }
}
