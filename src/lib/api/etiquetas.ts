import { ApiError, supabase, unwrap } from '@/lib/supabase';
import { normalizarCodigo } from '@/lib/format';
import type {
  BaixaInput,
  Etiqueta,
  EtiquetaDetalhe,
  EtiquetaMovimentacao,
  EtiquetaPublica,
  FiltroEtiquetas,
  MetodoConservacao,
  NovaEtiquetaInput,
  Paginado,
  TipoEtiqueta,
  UUID,
} from '@/types/database';
import { fimExclusivoISO, inicioDoDiaISO, num, numOrNull, sanitizarBusca, semUndefined } from './_shared';

function normEtiqueta<T extends Etiqueta>(e: T): T {
  return {
    ...e,
    quantidade: numOrNull(e.quantidade),
    validade_horas: numOrNull(e.validade_horas),
    impressoes: num(e.impressoes),
    alergenicos: e.alergenicos ?? [],
  };
}

function normDetalhe(e: EtiquetaDetalhe): EtiquetaDetalhe {
  return { ...normEtiqueta(e), horas_restantes: num(e.horas_restantes) };
}

/** RPC que retorna um registro composto pode vir como objeto ou array de 1. */
function primeiro<T>(v: T | T[] | null): T | null {
  if (Array.isArray(v)) return v[0] ?? null;
  return v ?? null;
}

export async function listEtiquetas(f: FiltroEtiquetas): Promise<Paginado<EtiquetaDetalhe>> {
  const limit = f.limit ?? 50;
  const offset = f.offset ?? 0;
  const ordenarPor = f.ordenarPor ?? 'data_validade';

  let q = supabase.from('vw_etiquetas').select('*', { count: 'exact' });
  if (f.unidadeId) q = q.eq('unidade_id', f.unidadeId);
  if (f.status && f.status !== 'todas') q = q.eq('status', f.status);
  if (f.situacao) q = q.eq('situacao', f.situacao);
  if (f.produtoId) q = q.eq('produto_id', f.produtoId);
  if (f.tipo) q = q.eq('tipo', f.tipo);
  if (f.metodo) q = q.eq('metodo', f.metodo);
  if (f.de) q = q.gte('created_at', inicioDoDiaISO(f.de));
  if (f.ate) q = q.lt('created_at', fimExclusivoISO(f.ate));
  const busca = f.busca ? sanitizarBusca(f.busca) : '';
  if (busca) q = q.or(`produto_nome.ilike.*${busca}*,codigo.ilike.*${busca}*,lote.ilike.*${busca}*`);

  q = q.order(ordenarPor, { ascending: ordenarPor === 'data_validade' }).range(offset, offset + limit - 1);

  const { data, error, count } = await q;
  if (error) unwrap({ data: null, error });
  return { data: ((data ?? []) as EtiquetaDetalhe[]).map(normDetalhe), total: count ?? 0 };
}

export async function getEtiqueta(id: UUID): Promise<EtiquetaDetalhe> {
  const res = await supabase.from('vw_etiquetas').select('*').eq('id', id).single();
  return normDetalhe(unwrap(res) as EtiquetaDetalhe);
}

export async function getEtiquetaPorCodigo(codigo: string): Promise<EtiquetaDetalhe | null> {
  const c = normalizarCodigo(codigo);
  if (!c) return null;
  const res = await supabase.from('vw_etiquetas').select('*').eq('codigo', c).maybeSingle();
  const e = unwrap(res) as EtiquetaDetalhe | null;
  return e ? normDetalhe(e) : null;
}

/** Emite `copias` etiquetas idênticas (1..100), cada uma com código único. */
export async function emitirEtiquetas(input: NovaEtiquetaInput, copias = 1): Promise<Etiqueta[]> {
  const n = Math.trunc(Number(copias));
  if (!Number.isFinite(n) || n < 1 || n > 100) {
    throw new ApiError('Informe de 1 a 100 cópias.');
  }
  const linha = semUndefined({
    ...input,
    // array vazio → deixa o trigger copiar os alergênicos do produto
    alergenicos: input.alergenicos && input.alergenicos.length > 0 ? input.alergenicos : undefined,
    produto_nome: input.produto_nome?.trim() || undefined,
  });
  const rows = Array.from({ length: n }, () => ({ ...linha }));
  const res = await supabase.from('etiquetas').insert(rows).select('*');
  return ((unwrap(res) ?? []) as Etiqueta[]).map(normEtiqueta);
}

/**
 * Emite `copias` etiquetas derivadas (porcionar/descongelar) numa única chamada:
 * a origem congelada só é baixada depois de criar todas as cópias.
 */
export async function emitirEtiquetaDerivada(
  origemId: UUID,
  tipo: TipoEtiqueta,
  metodo: MetodoConservacao,
  opts?: { quantidade?: number; validadeHoras?: number; copias?: number; dataManipulacao?: string },
): Promise<Etiqueta[]> {
  const copias = Math.trunc(Number(opts?.copias ?? 1));
  if (!Number.isFinite(copias) || copias < 1 || copias > 100) {
    throw new ApiError('Informe de 1 a 100 cópias.');
  }
  const res = await supabase.rpc('emitir_etiqueta_derivada', {
    p_origem_id: origemId,
    p_tipo: tipo,
    p_metodo: metodo,
    p_quantidade: opts?.quantidade ?? null,
    p_validade_horas: opts?.validadeHoras ?? null,
    p_copias: copias,
    p_data_manipulacao: opts?.dataManipulacao ?? null,
  });
  const v = unwrap(res) as Etiqueta | Etiqueta[] | null;
  const lista = Array.isArray(v) ? v : v ? [v] : [];
  if (!lista.length) throw new ApiError('Não foi possível emitir a etiqueta derivada.');
  return lista.map(normEtiqueta);
}

export async function registrarImpressao(ids: UUID[]): Promise<void> {
  if (!ids.length) return;
  const res = await supabase.rpc('registrar_impressao', { p_etiqueta_ids: ids });
  unwrap(res);
}

export async function registrarReimpressao(id: UUID): Promise<number> {
  const res = await supabase.rpc('registrar_reimpressao', { p_etiqueta_id: id });
  return num(unwrap(res));
}

export async function darBaixa(id: UUID, input: BaixaInput): Promise<Etiqueta> {
  const res = await supabase.rpc('dar_baixa_etiqueta', {
    p_etiqueta_id: id,
    p_status: input.status,
    p_motivo: input.motivo ?? null,
    p_quantidade: input.quantidade ?? null,
    p_observacao: input.observacao?.trim() || null,
  });
  const e = primeiro(unwrap(res) as Etiqueta | Etiqueta[] | null);
  if (!e) throw new ApiError('Não foi possível dar baixa na etiqueta.');
  return normEtiqueta(e);
}

export async function listMovimentacoes(etiquetaId: UUID): Promise<EtiquetaMovimentacao[]> {
  const res = await supabase
    .from('etiqueta_movimentacoes')
    .select('*, usuario:perfis!usuario_id(id,nome)')
    .eq('etiqueta_id', etiquetaId)
    .order('created_at', { ascending: true })
    .order('id', { ascending: true });
  return (unwrap(res) ?? []) as EtiquetaMovimentacao[];
}

/** PVPS: ativas vencendo em até 72 h (inclui vencidas ainda ativas). */
export async function listAVencer(unidadeId: UUID | null, limite = 50): Promise<EtiquetaDetalhe[]> {
  let q = supabase.from('vw_etiquetas_a_vencer').select('*');
  if (unidadeId) q = q.eq('unidade_id', unidadeId);
  const res = await q.order('data_validade', { ascending: true }).limit(limite);
  return ((unwrap(res) ?? []) as EtiquetaDetalhe[]).map(normDetalhe);
}

export async function marcarVencidas(unidadeId?: UUID | null): Promise<number> {
  const res = await supabase.rpc('marcar_etiquetas_vencidas', { p_unidade_id: unidadeId ?? null });
  return num(unwrap(res));
}

export async function consultarEtiquetaPublica(codigo: string): Promise<EtiquetaPublica | null> {
  const c = normalizarCodigo(codigo);
  if (!c) return null;
  const res = await supabase.rpc('consultar_etiqueta_publica', { p_codigo: c });
  const e = primeiro(unwrap(res) as EtiquetaPublica | EtiquetaPublica[] | null);
  return e ? { ...e, alergenicos: e.alergenicos ?? [] } : null;
}
