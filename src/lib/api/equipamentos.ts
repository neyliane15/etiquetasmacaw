import { supabase, unwrap } from '@/lib/supabase';
import type { Equipamento, Insert, UUID } from '@/types/database';
import { numOrNull } from './_shared';

function norm(e: Equipamento): Equipamento {
  return { ...e, temp_min_c: numOrNull(e.temp_min_c), temp_max_c: numOrNull(e.temp_max_c) };
}

export async function listEquipamentos(
  unidadeId: UUID | null,
  opts?: { incluirInativos?: boolean },
): Promise<Equipamento[]> {
  let q = supabase.from('equipamentos').select('*').order('nome');
  if (unidadeId) q = q.eq('unidade_id', unidadeId);
  if (!opts?.incluirInativos) q = q.eq('ativo', true);
  const res = await q;
  return ((unwrap(res) ?? []) as Equipamento[]).map(norm);
}

export async function createEquipamento(input: Insert<Equipamento>): Promise<Equipamento> {
  const res = await supabase.from('equipamentos').insert(input).select('*').single();
  return norm(unwrap(res) as Equipamento);
}

export async function updateEquipamento(id: UUID, patch: Partial<Insert<Equipamento>>): Promise<Equipamento> {
  const res = await supabase.from('equipamentos').update(patch).eq('id', id).select('*').single();
  return norm(unwrap(res) as Equipamento);
}

export async function deleteEquipamento(id: UUID): Promise<void> {
  const res = await supabase.from('equipamentos').delete().eq('id', id);
  unwrap(res);
}
