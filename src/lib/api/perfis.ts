import { ApiError, supabase, toApiError, unwrap } from '@/lib/supabase';
import type { NovoUsuarioInput, PapelUsuario, Perfil, UUID } from '@/types/database';

/** Nome da Edge Function que cria/convida usuários (supabase/functions/admin-criar-usuario). */
export const FUNCAO_CRIAR_USUARIO = 'admin-criar-usuario';

export async function listPerfis(unidadeId?: UUID | null): Promise<Perfil[]> {
  let q = supabase.from('perfis').select('*').order('nome');
  if (unidadeId) q = q.eq('unidade_id', unidadeId);
  const res = await q;
  return (unwrap(res) ?? []) as Perfil[];
}

/**
 * Atualização direta do perfil. Usuário comum só altera o próprio `nome`
 * (o banco bloqueia o resto); papel/unidade/situação → `adminDefinirPerfil`.
 */
export async function updatePerfil(id: UUID, patch: Partial<Pick<Perfil, 'nome'>>): Promise<Perfil> {
  const res = await supabase.from('perfis').update(patch).eq('id', id).select('*').single();
  return unwrap(res) as Perfil;
}

/** Somente admin: define papel, unidade, situação e nome (RPC admin_definir_perfil). */
export async function adminDefinirPerfil(
  id: UUID,
  dados: { papel: PapelUsuario; unidade_id: UUID | null; ativo: boolean; nome?: string },
): Promise<Perfil> {
  const res = await supabase.rpc('admin_definir_perfil', {
    p_user_id: id,
    p_papel: dados.papel,
    p_unidade_id: dados.unidade_id,
    p_ativo: dados.ativo,
    p_nome: dados.nome?.trim() || null,
  });
  const p = unwrap(res) as Perfil | Perfil[] | null;
  const perfil = Array.isArray(p) ? p[0] : p;
  if (!perfil) throw new ApiError('Usuário não encontrado.');
  return perfil;
}

/** Usuário novo (signup/convite pelo painel do Supabase) ainda não liberado por um admin. */
export function perfilPendente(p: Pick<Perfil, 'ativo' | 'papel' | 'unidade_id'>): boolean {
  return !p.ativo && p.papel === 'cozinheiro' && !p.unidade_id;
}

/**
 * Cria (com senha inicial) ou convida (sem senha → e-mail de convite) um usuário.
 * Somente admin. Executado pela Edge Function `admin-criar-usuario`, que usa a
 * service role no servidor — o navegador nunca cria contas com a chave anon e
 * o perfil (papel/unidade) é definido pelo servidor, não pelo metadata.
 */
export async function criarUsuario(input: NovoUsuarioInput): Promise<Perfil> {
  const redirectTo = typeof window !== 'undefined' ? `${window.location.origin}/redefinir-senha` : undefined;
  const { data, error } = await supabase.functions.invoke(FUNCAO_CRIAR_USUARIO, {
    body: {
      email: input.email.trim(),
      senha: input.senha ? input.senha : undefined,
      nome: input.nome.trim(),
      papel: input.papel,
      unidade_id: input.unidade_id,
      redirect_to: redirectTo,
    },
  });
  if (error) {
    const ctx = (error as { context?: Response }).context;
    let msg: string | undefined;
    let status: number | undefined;
    if (ctx && typeof ctx.status === 'number') {
      status = ctx.status;
      try {
        const corpo = (await ctx.clone().json()) as { error?: string };
        msg = corpo?.error;
      } catch {
        /* corpo não-JSON */
      }
    }
    if (msg) throw new ApiError(msg, status ? String(status) : undefined);
    if (status === 404 || /failed to send a request|fetch/i.test(error.message ?? '')) {
      throw new ApiError(
        'A função de cadastro de usuários (admin-criar-usuario) não está publicada. ' +
          'Convide o usuário pelo painel do Supabase (Authentication → Users → Invite) e depois libere o acesso aqui.',
        'funcao_indisponivel',
      );
    }
    throw toApiError(error);
  }
  const perfil = (data as { perfil?: Perfil } | null)?.perfil;
  if (!perfil) throw new ApiError('Não foi possível criar o usuário.');
  return perfil;
}
