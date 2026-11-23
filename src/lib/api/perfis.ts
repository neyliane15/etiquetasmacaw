import { createClient } from '@supabase/supabase-js';
import { ApiError, SUPABASE_ANON_KEY, SUPABASE_URL, supabase, toApiError, unwrap } from '@/lib/supabase';
import type { NovoUsuarioInput, Perfil, UUID } from '@/types/database';

export async function listPerfis(unidadeId?: UUID | null): Promise<Perfil[]> {
  let q = supabase.from('perfis').select('*').order('nome');
  if (unidadeId) q = q.eq('unidade_id', unidadeId);
  const res = await q;
  return (unwrap(res) ?? []) as Perfil[];
}

export async function updatePerfil(
  id: UUID,
  patch: Partial<Pick<Perfil, 'nome' | 'papel' | 'unidade_id' | 'ativo'>>,
): Promise<Perfil> {
  const res = await supabase.from('perfis').update(patch).eq('id', id).select('*').single();
  return unwrap(res) as Perfil;
}

/**
 * Cria um usuário (somente admin). Usa um client secundário sem persistência para
 * que o signUp não substitua a sessão do admin logado. O trigger handle_new_user
 * cria o perfil como 'cozinheiro'; em seguida o admin ajusta papel/unidade.
 */
export async function criarUsuario(input: NovoUsuarioInput): Promise<Perfil> {
  const signupClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, storageKey: 'macaw-signup' },
  });

  const { data, error } = await signupClient.auth.signUp({
    email: input.email.trim(),
    password: input.senha,
    options: { data: { nome: input.nome.trim(), unidade_id: input.unidade_id } },
  });
  if (error) throw toApiError(error);

  const user = data.user;
  if (!user) throw new ApiError('Não foi possível criar o usuário.');
  // Com confirmação de e-mail ativa, um e-mail já cadastrado retorna usuário sem identidades.
  if (Array.isArray(user.identities) && user.identities.length === 0) {
    throw new ApiError('Já existe um usuário com este e-mail.', 'user_already_exists');
  }

  // Encerra a sessão do client secundário (se o signUp tiver criado uma).
  await signupClient.auth.signOut().catch(() => undefined);

  return updatePerfil(user.id, {
    nome: input.nome.trim(),
    papel: input.papel,
    unidade_id: input.unidade_id,
  });
}
