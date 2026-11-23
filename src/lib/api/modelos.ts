import { supabase, unwrap } from '@/lib/supabase';
import type { Insert, ModeloEtiqueta, UUID } from '@/types/database';
import { num } from './_shared';

function norm(m: ModeloEtiqueta): ModeloEtiqueta {
  return {
    ...m,
    largura_mm: num(m.largura_mm),
    altura_mm: num(m.altura_mm),
    fonte_base_pt: num(m.fonte_base_pt),
    campos: (m.campos ?? []) as ModeloEtiqueta['campos'],
  };
}

/** Lista modelos globais + da unidade. Por padrão só os ativos. */
export async function listModelos(
  unidadeId?: UUID | null,
  opts?: { incluirInativos?: boolean },
): Promise<ModeloEtiqueta[]> {
  let q = supabase.from('modelos_etiqueta').select('*').order('padrao', { ascending: false }).order('nome');
  if (unidadeId) q = q.or(`unidade_id.is.null,unidade_id.eq.${unidadeId}`);
  if (!opts?.incluirInativos) q = q.eq('ativo', true);
  const res = await q;
  return ((unwrap(res) ?? []) as ModeloEtiqueta[]).map(norm);
}

export async function getModelo(id: UUID): Promise<ModeloEtiqueta> {
  const res = await supabase.from('modelos_etiqueta').select('*').eq('id', id).single();
  return norm(unwrap(res) as ModeloEtiqueta);
}

/** Padrão da unidade; senão o padrão global; senão o primeiro modelo ativo. */
export async function getModeloPadrao(unidadeId: UUID | null): Promise<ModeloEtiqueta | null> {
  if (unidadeId) {
    const res = await supabase
      .from('modelos_etiqueta')
      .select('*')
      .eq('unidade_id', unidadeId)
      .eq('padrao', true)
      .eq('ativo', true)
      .limit(1)
      .maybeSingle();
    const m = unwrap(res) as ModeloEtiqueta | null;
    if (m) return norm(m);
  }
  const global = await supabase
    .from('modelos_etiqueta')
    .select('*')
    .is('unidade_id', null)
    .eq('padrao', true)
    .eq('ativo', true)
    .limit(1)
    .maybeSingle();
  const g = unwrap(global) as ModeloEtiqueta | null;
  if (g) return norm(g);

  const lista = await listModelos(unidadeId);
  return lista[0] ?? null;
}

/** Garante um único padrão por escopo (unidade ou global). */
async function limparPadrao(unidadeId: UUID | null, excetoId?: UUID): Promise<void> {
  let q = supabase.from('modelos_etiqueta').update({ padrao: false }).eq('padrao', true);
  q = unidadeId ? q.eq('unidade_id', unidadeId) : q.is('unidade_id', null);
  if (excetoId) q = q.neq('id', excetoId);
  unwrap(await q);
}

export async function createModelo(input: Insert<ModeloEtiqueta>): Promise<ModeloEtiqueta> {
  if (input.padrao) await limparPadrao(input.unidade_id ?? null);
  const res = await supabase.from('modelos_etiqueta').insert(input).select('*').single();
  return norm(unwrap(res) as ModeloEtiqueta);
}

export async function updateModelo(id: UUID, patch: Partial<Insert<ModeloEtiqueta>>): Promise<ModeloEtiqueta> {
  if (patch.padrao) {
    const escopo = 'unidade_id' in patch ? patch.unidade_id ?? null : (await getModelo(id)).unidade_id;
    await limparPadrao(escopo, id);
  }
  const res = await supabase.from('modelos_etiqueta').update(patch).eq('id', id).select('*').single();
  return norm(unwrap(res) as ModeloEtiqueta);
}

export async function deleteModelo(id: UUID): Promise<void> {
  const res = await supabase.from('modelos_etiqueta').delete().eq('id', id);
  unwrap(res);
}
