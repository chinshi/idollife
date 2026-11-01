import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

/** 没配置时返回 null，界面据此隐藏登录入口 */
export const supabase: SupabaseClient | null =
  url && anonKey
    ? createClient(url, anonKey, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: false,
          storageKey: 'idollife-auth',
        },
      })
    : null;

export interface AuthUser {
  id: string;
  email: string | null;
}

export async function signIn(email: string, password: string): Promise<{ error?: string }> {
  if (!supabase) return { error: '未配置 Supabase' };
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  return error ? { error: error.message } : {};
}

export async function signUp(email: string, password: string): Promise<{ error?: string }> {
  if (!supabase) return { error: '未配置 Supabase' };
  const { data, error } = await supabase.auth.signUp({ email, password });
  if (error) return { error: error.message };
  // 关闭邮箱验证时会直接返回 session；若需要验证则提示
  if (!data.session) return { error: '注册成功，请到邮箱确认后再登录' };
  return {};
}

export async function signOut(): Promise<void> {
  await supabase?.auth.signOut();
}

export async function getSessionUser(): Promise<AuthUser | null> {
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  const u = data.session?.user;
  return u ? { id: u.id, email: u.email ?? null } : null;
}

/** 取 access token；过期会自动刷新一次 */
export async function getAccessToken(): Promise<string | null> {
  if (!supabase) return null;

  const { data } = await supabase.auth.getSession();
  if (data.session?.access_token) return data.session.access_token;

  const refreshed = await supabase.auth.refreshSession();
  return refreshed.data.session?.access_token ?? null;
}

/** 手动刷新一次 token（接口返回 401 时用） */
export async function refreshAccessToken(): Promise<string | null> {
  if (!supabase) return null;
  const { data } = await supabase.auth.refreshSession();
  return data.session?.access_token ?? null;
}

export function onAuthChange(cb: (user: AuthUser | null) => void): () => void {
  if (!supabase) return () => {};
  const { data } = supabase.auth.onAuthStateChange((_event, session) => {
    const u = session?.user;
    cb(u ? { id: u.id, email: u.email ?? null } : null);
  });
  return () => data.subscription.unsubscribe();
}
