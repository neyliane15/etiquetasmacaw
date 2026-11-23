import { supabase, unwrap } from '@/lib/supabase';
import type { Fornecedor, Insert, UUID } from '@/types/database';
import { sanitizarBusca } from './_shared';

export async function listFornecedores(opts?: { busca?: string; incluirInativos?: boolean }): Promise<Fornecedor[]> {
  let q = supabase.from('fornecedores').select('*').order('nome');
  if (!opts?.incluirInativos) q = q.eq('ativo', true);
  const busca = opts?.busca ? sanitizarBusca(opts.busca) : '';
  if (busca) q = q.or(`nome.ilike.*${busca}*,razao_social.ilike.*${busca}*,cnpj.ilike.*${busca}*`);
  const res = await q;
  return (unwrap(res) ?? []) as Fornecedor[];
}

export async function createFornecedor(input: Insert<Fornecedor>): Promise<Fornecedor> {
  const res = await supabase.from('fornecedores').insert(input).select('*').single();
  return unwrap(res) as Fornecedor;
}

export async function updateFornecedor(id: UUID, patch: Partial<Insert<Fornecedor>>): Promise<Fornecedor> {
  const res = await supabase.from('fornecedores').update(patch).eq('id', id).select('*').single();
  return unwrap(res) as Fornecedor;
}

export async function deleteFornecedor(id: UUID): Promise<void> {
  const res = await supabase.from('fornecedores').delete().eq('id', id);
  unwrap(res);
}
