import { ApiError, supabase, unwrap } from '@/lib/supabase';
import type {
  ISODate,
  NovoRecebimentoInput,
  Paginado,
  Recebimento,
  RecebimentoComItens,
  RecebimentoItem,
  UUID,
} from '@/types/database';
import { fimExclusivoISO, inicioDoDiaISO, num, numOrNull, semUndefined } from './_shared';

function normRec<T extends Recebimento>(r: T): T {
  return { ...r, temperatura_veiculo_c: numOrNull(r.temperatura_veiculo_c) };
}

function normItem(i: RecebimentoItem): RecebimentoItem {
  return { ...i, quantidade: num(i.quantidade), temperatura_c: numOrNull(i.temperatura_c) };
}

export async function listRecebimentos(f: {
  unidadeId: UUID | null;
  de?: ISODate;
  ate?: ISODate;
  fornecedorId?: UUID;
  limit?: number;
  offset?: number;
}): Promise<Paginado<Recebimento>> {
  const limit = f.limit ?? 50;
  const offset = f.offset ?? 0;
  let q = supabase.from('recebimentos').select('*, fornecedor:fornecedores(id,nome)', { count: 'exact' });
  if (f.unidadeId) q = q.eq('unidade_id', f.unidadeId);
  if (f.fornecedorId) q = q.eq('fornecedor_id', f.fornecedorId);
  if (f.de) q = q.gte('recebido_em', inicioDoDiaISO(f.de));
  if (f.ate) q = q.lt('recebido_em', fimExclusivoISO(f.ate));
  const { data, error, count } = await q
    .order('recebido_em', { ascending: false })
    .range(offset, offset + limit - 1);
  if (error) unwrap({ data: null, error });
  return { data: ((data ?? []) as Recebimento[]).map(normRec), total: count ?? 0 };
}

export async function getRecebimento(id: UUID): Promise<RecebimentoComItens> {
  const res = await supabase
    .from('recebimentos')
    .select('*, fornecedor:fornecedores(id,nome), itens:recebimento_itens(*)')
    .eq('id', id)
    .single();
  const r = unwrap(res) as RecebimentoComItens;
  const itens = (r.itens ?? []).map(normItem).sort((a, b) => a.created_at.localeCompare(b.created_at));
  return { ...normRec(r), itens };
}

/** Insere o cabeçalho e depois os itens. */
export async function criarRecebimento(input: NovoRecebimentoInput): Promise<RecebimentoComItens> {
  const { itens, ...cabecalho } = input;
  const resCab = await supabase.from('recebimentos').insert(semUndefined(cabecalho)).select('*').single();
  const rec = unwrap(resCab) as Recebimento;

  if (itens.length > 0) {
    const rows = itens.map((i) => ({ ...semUndefined(i), recebimento_id: rec.id }));
    const resItens = await supabase.from('recebimento_itens').insert(rows);
    if (resItens.error) {
      // Melhor esforço para não deixar cabeçalho órfão (só admin pode excluir).
      await supabase.from('recebimentos').delete().eq('id', rec.id);
      unwrap(resItens);
    }
  }

  const completo = await getRecebimento(rec.id);
  if (!completo) throw new ApiError('Recebimento criado, mas não foi possível carregá-lo.');
  return completo;
}
