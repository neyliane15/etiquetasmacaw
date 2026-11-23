import { supabase, unwrap } from '@/lib/supabase';
import type { Insert, Produto, ProdutoComCategoria, UUID } from '@/types/database';
import { numOrNull } from './_shared';

const SELECT = '*, categoria:categorias(id,nome,cor)';

function norm<T extends Produto>(p: T): T {
  return {
    ...p,
    custo_unitario: numOrNull(p.custo_unitario),
    alergenicos: p.alergenicos ?? [],
  };
}

export async function listProdutos(opts?: {
  busca?: string;
  categoriaId?: UUID;
  unidadeId?: UUID | null;
  incluirInativos?: boolean;
}): Promise<ProdutoComCategoria[]> {
  let q = supabase.from('produtos').select(SELECT).order('nome');
  if (!opts?.incluirInativos) q = q.eq('ativo', true);
  if (opts?.categoriaId) q = q.eq('categoria_id', opts.categoriaId);
  if (opts?.unidadeId) q = q.or(`unidade_id.is.null,unidade_id.eq.${opts.unidadeId}`);
  const busca = opts?.busca?.trim();
  if (busca) q = q.ilike('nome', `%${busca.replace(/[%_\\]/g, (c) => `\\${c}`)}%`);
  const res = await q;
  return ((unwrap(res) ?? []) as ProdutoComCategoria[]).map(norm);
}

export async function getProduto(id: UUID): Promise<ProdutoComCategoria> {
  const res = await supabase.from('produtos').select(SELECT).eq('id', id).single();
  return norm(unwrap(res) as ProdutoComCategoria);
}

export async function createProduto(input: Insert<Produto>): Promise<Produto> {
  const res = await supabase.from('produtos').insert(input).select('*').single();
  return norm(unwrap(res) as Produto);
}

export async function updateProduto(id: UUID, patch: Partial<Insert<Produto>>): Promise<Produto> {
  const res = await supabase.from('produtos').update(patch).eq('id', id).select('*').single();
  return norm(unwrap(res) as Produto);
}

/** Exclusão lógica (ativo = false), preservando o histórico de etiquetas. */
export async function deleteProduto(id: UUID): Promise<void> {
  const res = await supabase.from('produtos').update({ ativo: false }).eq('id', id);
  unwrap(res);
}
