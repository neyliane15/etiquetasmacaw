import { supabase, unwrap } from '@/lib/supabase';
import type { Descarte, MotivoDescarte, NovoDescarteInput, Paginado, UUID, ISODate } from '@/types/database';
import { fimExclusivoISO, inicioDoDiaISO, num, numOrNull, semUndefined } from './_shared';

const SELECT = '*, responsavel:perfis!responsavel_id(id,nome)';

function norm(d: Descarte): Descarte {
  return {
    ...d,
    quantidade: num(d.quantidade),
    peso_kg: numOrNull(d.peso_kg),
    custo_estimado: numOrNull(d.custo_estimado),
  };
}

export async function listDescartes(f: {
  unidadeId: UUID | null;
  de?: ISODate;
  ate?: ISODate;
  motivo?: MotivoDescarte;
  limit?: number;
  offset?: number;
}): Promise<Paginado<Descarte>> {
  const limit = f.limit ?? 50;
  const offset = f.offset ?? 0;
  let q = supabase.from('descartes').select(SELECT, { count: 'exact' });
  if (f.unidadeId) q = q.eq('unidade_id', f.unidadeId);
  if (f.motivo) q = q.eq('motivo', f.motivo);
  if (f.de) q = q.gte('descartado_em', inicioDoDiaISO(f.de));
  if (f.ate) q = q.lt('descartado_em', fimExclusivoISO(f.ate));
  const { data, error, count } = await q
    .order('descartado_em', { ascending: false })
    .range(offset, offset + limit - 1);
  if (error) unwrap({ data: null, error });
  return { data: ((data ?? []) as Descarte[]).map(norm), total: count ?? 0 };
}

export async function registrarDescarte(input: NovoDescarteInput): Promise<Descarte> {
  const row = semUndefined({ ...input, produto_nome: input.produto_nome?.trim() || undefined });
  const res = await supabase.from('descartes').insert(row).select(SELECT).single();
  return norm(unwrap(res) as Descarte);
}

export async function deleteDescarte(id: UUID): Promise<void> {
  const res = await supabase.from('descartes').delete().eq('id', id);
  unwrap(res);
}
