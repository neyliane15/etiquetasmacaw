// Regressões da revisão (docs/REVISAO.md): camada de API sem backend real.
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  rpc: vi.fn(),
  invoke: vi.fn(),
  signUp: vi.fn(),
  createClient: vi.fn(),
}));

vi.mock('@/lib/supabase', async () => {
  class ApiError extends Error {
    code?: string;
    constructor(message: string, code?: string) {
      super(message);
      this.code = code;
    }
  }
  return {
    ApiError,
    supabaseConfigurado: true,
    SUPABASE_URL: 'http://x',
    SUPABASE_ANON_KEY: 'k',
    supabase: {
      rpc: h.rpc,
      functions: { invoke: h.invoke },
      auth: { signUp: h.signUp },
      from: vi.fn(),
    },
    toApiError: (e: { message?: string }) => new ApiError(e?.message ?? 'erro'),
    unwrap: (r: { data: unknown; error: { message: string } | null }) => {
      if (r.error) throw new ApiError(r.error.message);
      return r.data;
    },
  };
});
vi.mock('@supabase/supabase-js', () => ({ createClient: h.createClient }));

import { adminDefinirPerfil, criarUsuario, perfilPendente } from '@/lib/api/perfis';
import { emitirEtiquetaDerivada } from '@/lib/api/etiquetas';
import { ROTA_REDEFINIR_SENHA, urlDeRecuperacao, validarNovaSenha } from '@/lib/api/auth';

beforeEach(() => {
  h.rpc.mockReset();
  h.invoke.mockReset();
  h.signUp.mockReset();
  h.createClient.mockReset();
});

describe('criarUsuario (bug #1)', () => {
  it('usa a Edge Function e nunca signUp/client anon secundário', async () => {
    h.invoke.mockResolvedValue({ data: { perfil: { id: 'u1', papel: 'gerente' } }, error: null });
    const p = await criarUsuario({ email: ' a@b.com ', nome: 'Ana', papel: 'gerente', unidade_id: 'un1' });
    expect(p.id).toBe('u1');
    expect(h.invoke).toHaveBeenCalledTimes(1);
    const [nome, opts] = h.invoke.mock.calls[0];
    expect(nome).toBe('admin-criar-usuario');
    expect(opts.body).toMatchObject({ email: 'a@b.com', nome: 'Ana', papel: 'gerente', unidade_id: 'un1' });
    expect(opts.body.senha).toBeUndefined(); // sem senha → convite
    expect(opts.body.redirect_to).toMatch(/\/redefinir-senha$/);
    expect(h.signUp).not.toHaveBeenCalled();
    expect(h.createClient).not.toHaveBeenCalled();
  });
  it('mensagem do servidor é repassada', async () => {
    const ctx = new Response(JSON.stringify({ error: 'Somente administradores podem cadastrar usuários.' }), { status: 403 });
    h.invoke.mockResolvedValue({ data: null, error: { message: 'non-2xx', context: ctx } });
    await expect(criarUsuario({ email: 'a@b.com', nome: 'A', papel: 'cozinheiro', unidade_id: 'u' })).rejects.toThrow(
      /Somente administradores/,
    );
  });
  it('função não publicada → orienta convite pelo painel', async () => {
    h.invoke.mockResolvedValue({ data: null, error: { message: 'Failed to send a request to the Edge Function' } });
    await expect(criarUsuario({ email: 'a@b.com', nome: 'A', papel: 'cozinheiro', unidade_id: 'u' })).rejects.toThrow(
      /Invite/,
    );
  });
});

describe('adminDefinirPerfil / perfilPendente', () => {
  it('chama a RPC admin_definir_perfil', async () => {
    h.rpc.mockResolvedValue({ data: { id: 'u1', ativo: true }, error: null });
    await adminDefinirPerfil('u1', { papel: 'cozinheiro', unidade_id: 'un', ativo: true, nome: ' Bia ' });
    expect(h.rpc).toHaveBeenCalledWith('admin_definir_perfil', {
      p_user_id: 'u1',
      p_papel: 'cozinheiro',
      p_unidade_id: 'un',
      p_ativo: true,
      p_nome: 'Bia',
    });
  });
  it('pendente = cozinheiro inativo sem unidade', () => {
    expect(perfilPendente({ ativo: false, papel: 'cozinheiro', unidade_id: null })).toBe(true);
    expect(perfilPendente({ ativo: false, papel: 'cozinheiro', unidade_id: 'x' })).toBe(false);
    expect(perfilPendente({ ativo: true, papel: 'cozinheiro', unidade_id: null })).toBe(false);
  });
});

describe('emitirEtiquetaDerivada (bugs #5/#6)', () => {
  it('uma única RPC com p_copias e p_data_manipulacao; retorna todas', async () => {
    h.rpc.mockResolvedValue({
      data: [
        { id: '1', codigo: 'A', impressoes: 0, alergenicos: null },
        { id: '2', codigo: 'B', impressoes: 0, alergenicos: [] },
        { id: '3', codigo: 'C', impressoes: 0, alergenicos: [] },
      ],
      error: null,
    });
    const r = await emitirEtiquetaDerivada('o1', 'descongelamento', 'descongelando', {
      copias: 3,
      dataManipulacao: '2026-06-15T13:00:00.000Z',
    });
    expect(r.map((e) => e.codigo)).toEqual(['A', 'B', 'C']);
    expect(h.rpc).toHaveBeenCalledTimes(1);
    expect(h.rpc.mock.calls[0][1]).toMatchObject({ p_origem_id: 'o1', p_copias: 3, p_data_manipulacao: '2026-06-15T13:00:00.000Z' });
  });
  it('valida o número de cópias antes de chamar', async () => {
    await expect(emitirEtiquetaDerivada('o1', 'porcionado', 'resfriado', { copias: 0 })).rejects.toThrow(/1 a 100/);
    expect(h.rpc).not.toHaveBeenCalled();
  });
});

describe('redefinição de senha (bug #7)', () => {
  it('detecta links de recuperação/convite', () => {
    expect(ROTA_REDEFINIR_SENHA).toBe('/redefinir-senha');
    expect(urlDeRecuperacao('https://app/login#access_token=x&type=recovery')).toBe(true);
    expect(urlDeRecuperacao('https://app/#access_token=x&type=invite')).toBe(true);
    expect(urlDeRecuperacao('https://app/etiquetas?type=outro')).toBe(false);
  });
  it('valida nova senha', () => {
    expect(validarNovaSenha('1234567', '1234567')).toMatch(/8 caracteres/);
    expect(validarNovaSenha('12345678', '12345679')).toMatch(/não conferem/);
    expect(validarNovaSenha('12345678', '12345678')).toBeNull();
  });
});
