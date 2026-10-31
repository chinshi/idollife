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

/** 从 Authorization: Bearer <access_token> 解析出用户；失败返回 null */
export async function getUserFromRequest(c: Context): Promise<AuthUser | null> {
  const header = c.req.header('authorization') ?? '';
  if (!header.toLowerCase().startsWith('bearer ')) return null;

  const token = header.slice(7).trim();
  if (!token) return null;

  const sb = client();
  if (!sb) return null;

  try {
    const { data, error } = await sb.auth.getUser(token);
    if (error || !data.user) return null;
    return { id: data.user.id, email: data.user.email ?? null };
  } catch {
    return null;
  }
}
