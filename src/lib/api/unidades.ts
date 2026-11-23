import { supabase, unwrap } from '@/lib/supabase';
import type { Insert, Unidade, UUID } from '@/types/database';

export async function listUnidades(): Promise<Unidade[]> {
  const res = await supabase.from('unidades').select('*').order('nome');
  return (unwrap(res) ?? []) as Unidade[];
}

export async function getUnidade(id: UUID): Promise<Unidade> {
  const res = await supabase.from('unidades').select('*').eq('id', id).single();
  return unwrap(res) as Unidade;
}

export async function updateUnidade(id: UUID, patch: Partial<Insert<Unidade>>): Promise<Unidade> {
  const res = await supabase.from('unidades').update(patch).eq('id', id).select('*').single();
  return unwrap(res) as Unidade;
}
