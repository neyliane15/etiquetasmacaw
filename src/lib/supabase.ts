import { createClient, type PostgrestError, type SupabaseClient } from '@supabase/supabase-js';

const url = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim() ?? '';
const anonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined)?.trim() ?? '';

/** false quando as variáveis de ambiente não foram definidas (a UI mostra aviso no login). */
export const supabaseConfigurado: boolean = Boolean(url && anonKey);

/** URL/chave usadas pelo client (placeholders quando não configurado, para não quebrar o boot). */
export const SUPABASE_URL = supabaseConfigurado ? url : 'http://localhost:54321';
export const SUPABASE_ANON_KEY = supabaseConfigurado ? anonKey : 'supabase-nao-configurado';

export const supabase: SupabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: true, autoRefreshToken: true },
});

export class ApiError extends Error {
  code?: string;
  details?: string;

  constructor(message: string, code?: string, details?: string) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.details = details;
  }
}

interface ErroLike {
  message?: string;
  code?: string;
  details?: string | null;
  hint?: string | null;
  status?: number;
}

/** Converte um erro do Supabase/Postgres/Auth em mensagem amigável pt-BR. */
export function mensagemErro(err: ErroLike): string {
  const code = err.code ?? '';
  const msg = err.message ?? '';
  switch (code) {
    case '23505':
      return 'Já existe um registro com esses dados (valor duplicado).';
    case '23503':
      return 'Operação não permitida: o registro está relacionado a outros dados.';
    case '23502':
      return 'Preencha todos os campos obrigatórios.';
    case '23514':
      return 'Valor inválido para um dos campos (regra de validação do banco).';
    case '22P02':
      return 'Formato de dado inválido.';
    case '42501':
      // Mensagens próprias (raise exception com errcode 42501) já são pt-BR.
      if (msg && !/row-level security|permission denied/i.test(msg)) return msg;
      return 'Você não tem permissão para realizar esta operação.';
    case 'PGRST116':
      return 'Registro não encontrado.';
    case 'PGRST301':
    case '401':
      return 'Sessão expirada. Entre novamente.';
    default:
      break;
  }
  if (/invalid login credentials/i.test(msg)) return 'E-mail ou senha incorretos.';
  if (/email not confirmed/i.test(msg)) return 'E-mail ainda não confirmado.';
  if (/user already registered/i.test(msg)) return 'Já existe um usuário com este e-mail.';
  if (/password should be at least/i.test(msg)) return 'A senha deve ter pelo menos 6 caracteres.';
  if (/rate limit/i.test(msg)) return 'Muitas tentativas. Aguarde alguns instantes e tente novamente.';
  if (/failed to fetch|network/i.test(msg)) return 'Falha de conexão com o servidor. Verifique sua internet.';
  if (/row-level security/i.test(msg)) return 'Você não tem permissão para realizar esta operação.';
  return msg || 'Erro inesperado. Tente novamente.';
}

export function toApiError(err: unknown): ApiError {
  if (err instanceof ApiError) return err;
  if (err && typeof err === 'object') {
    const e = err as ErroLike;
    return new ApiError(mensagemErro(e), e.code ?? (e.status ? String(e.status) : undefined), e.details ?? undefined);
  }
  return new ApiError(typeof err === 'string' ? err : 'Erro inesperado. Tente novamente.');
}

/** Retorna `data` ou lança `ApiError` com mensagem pt-BR. */
export function unwrap<T>(res: { data: T | null; error: PostgrestError | null }): T {
  if (res.error) throw toApiError(res.error);
  return res.data as T;
}
