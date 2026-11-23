import { supabase, toApiError, unwrap } from '@/lib/supabase';
import type { Perfil, UUID } from '@/types/database';

export async function signIn(email: string, senha: string): Promise<void> {
  const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password: senha });
  if (error) throw toApiError(error);
}

export async function signOut(): Promise<void> {
  const { error } = await supabase.auth.signOut();
  if (error) throw toApiError(error);
}

export async function getSessionUserId(): Promise<UUID | null> {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw toApiError(error);
  return data.session?.user.id ?? null;
}

export async function getPerfilAtual(): Promise<Perfil | null> {
  const userId = await getSessionUserId();
  if (!userId) return null;
  const res = await supabase.from('perfis').select('*').eq('id', userId).maybeSingle();
  return unwrap(res) as Perfil | null;
}

export function onAuthChange(cb: (userId: UUID | null) => void): () => void {
  const { data } = supabase.auth.onAuthStateChange((_evento, session) => {
    cb(session?.user.id ?? null);
  });
  return () => data.subscription.unsubscribe();
}

export async function enviarResetSenha(email: string): Promise<void> {
  const redirectTo = typeof window !== 'undefined' ? `${window.location.origin}/login` : undefined;
  const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo });
  if (error) throw toApiError(error);
}

export async function atualizarSenha(nova: string): Promise<void> {
  const { error } = await supabase.auth.updateUser({ password: nova });
  if (error) throw toApiError(error);
}
