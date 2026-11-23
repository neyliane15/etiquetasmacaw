import { supabase, unwrap } from '@/lib/supabase';
import type {
  ISODate,
  NovoRegistroTemperaturaInput,
  Paginado,
  RegistroTemperatura,
  TemperaturaUltima,
  UUID,
} from '@/types/database';
import { fimExclusivoISO, inicioDoDiaISO, num, numOrNull, semUndefined } from './_shared';

const SELECT = '*, equipamento:equipamentos(id,nome,tipo), responsavel:perfis!responsavel_id(id,nome)';

function norm(r: RegistroTemperatura): RegistroTemperatura {
  return { ...r, temperatura_c: num(r.temperatura_c) };
}

export async function listRegistrosTemperatura(f: {
  unidadeId: UUID | null;
  equipamentoId?: UUID;
  de?: ISODate;
  ate?: ISODate;
  somenteNaoConformes?: boolean;
  limit?: number;
  offset?: number;
}): Promise<Paginado<RegistroTemperatura>> {
  const limit = f.limit ?? 50;
  const offset = f.offset ?? 0;
  let q = supabase.from('registros_temperatura').select(SELECT, { count: 'exact' });
  if (f.unidadeId) q = q.eq('unidade_id', f.unidadeId);
  if (f.equipamentoId) q = q.eq('equipamento_id', f.equipamentoId);
  if (f.somenteNaoConformes) q = q.eq('conforme', false);
  if (f.de) q = q.gte('registrado_em', inicioDoDiaISO(f.de));
  if (f.ate) q = q.lt('registrado_em', fimExclusivoISO(f.ate));
  const { data, error, count } = await q
    .order('registrado_em', { ascending: false })
    .range(offset, offset + limit - 1);
  if (error) unwrap({ data: null, error });
  return { data: ((data ?? []) as RegistroTemperatura[]).map(norm), total: count ?? 0 };
}

/** `unidade_id` e `conforme` são preenchidos pelo trigger do banco. */
export async function registrarTemperatura(input: NovoRegistroTemperaturaInput): Promise<RegistroTemperatura> {
  const row = semUndefined({ ...input, acao_corretiva: input.acao_corretiva?.trim() || null });
  const res = await supabase.from('registros_temperatura').insert(row).select(SELECT).single();
  return norm(unwrap(res) as RegistroTemperatura);
}

export async function listUltimasTemperaturas(unidadeId: UUID | null): Promise<TemperaturaUltima[]> {
  let q = supabase.from('vw_temperaturas_ultimas').select('*');
  if (unidadeId) q = q.eq('unidade_id', unidadeId);
  const res = await q.order('equipamento_nome');
  return ((unwrap(res) ?? []) as TemperaturaUltima[]).map((t) => ({
    ...t,
    temp_min_c: numOrNull(t.temp_min_c),
    temp_max_c: numOrNull(t.temp_max_c),
    temperatura_c: numOrNull(t.temperatura_c),
    horas_desde_registro: numOrNull(t.horas_desde_registro),
  }));
}
