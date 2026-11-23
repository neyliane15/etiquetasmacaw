import { supabase, unwrap } from '@/lib/supabase';
import type { Categoria, Insert, UUID } from '@/types/database';
import { numOrNull } from './_shared';

function norm(c: Categoria): Categoria {
  return { ...c, temp_recebimento_max_c: numOrNull(c.temp_recebimento_max_c) };
}

export async function listCategorias(opts?: { incluirInativas?: boolean }): Promise<Categoria[]> {
  let q = supabase.from('categorias').select('*').order('ordem').order('nome');
  if (!opts?.incluirInativas) q = q.eq('ativo', true);
  const res = await q;
  return ((unwrap(res) ?? []) as Categoria[]).map(norm);
}

export async function createCategoria(input: Insert<Categoria>): Promise<Categoria> {
  const res = await supabase.from('categorias').insert(input).select('*').single();
  return norm(unwrap(res) as Categoria);
}

export async function updateCategoria(id: UUID, patch: Partial<Insert<Categoria>>): Promise<Categoria> {
  const res = await supabase.from('categorias').update(patch).eq('id', id).select('*').single();
  return norm(unwrap(res) as Categoria);
}

export async function deleteCategoria(id: UUID): Promise<void> {
  const res = await supabase.from('categorias').delete().eq('id', id);
  unwrap(res);
}
