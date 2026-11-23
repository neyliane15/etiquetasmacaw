import { supabase, unwrap } from '@/lib/supabase';
import type { DashboardResumo, DesperdicioLinha, ISODate, RelatorioEtiquetaLinha, UUID } from '@/types/database';
import { num } from './_shared';

const CHAVES_DASHBOARD: (keyof DashboardResumo)[] = [
  'ativas',
  'vencidas',
  'vence_hoje',
  'vence_24h',
  'vence_72h',
  'emitidas_hoje',
  'descartes_7d_kg',
  'descartes_7d_custo',
  'temperaturas_nao_conformes_24h',
  'equipamentos_sem_registro_12h',
  'recebimentos_hoje',
];

export async function getDashboardResumo(unidadeId: UUID | null): Promise<DashboardResumo> {
  const res = await supabase.rpc('dashboard_resumo', { p_unidade_id: unidadeId });
  const raw = (unwrap(res) ?? {}) as Record<string, unknown>;
  const out = {} as DashboardResumo;
  for (const k of CHAVES_DASHBOARD) out[k] = num(raw[k]);
  return out;
}

export async function relatorioDesperdicio(
  unidadeId: UUID | null,
  de: ISODate,
  ate: ISODate,
): Promise<DesperdicioLinha[]> {
  const res = await supabase.rpc('relatorio_desperdicio', { p_unidade_id: unidadeId, p_inicio: de, p_fim: ate });
  return ((unwrap(res) ?? []) as DesperdicioLinha[]).map((l) => ({
    ...l,
    total_peso_kg: num(l.total_peso_kg),
    total_custo: num(l.total_custo),
    registros: num(l.registros),
  }));
}

export async function relatorioEtiquetas(
  unidadeId: UUID | null,
  de: ISODate,
  ate: ISODate,
): Promise<RelatorioEtiquetaLinha[]> {
  const res = await supabase.rpc('relatorio_etiquetas', { p_unidade_id: unidadeId, p_inicio: de, p_fim: ate });
  return ((unwrap(res) ?? []) as RelatorioEtiquetaLinha[]).map((l) => ({
    produto_nome: l.produto_nome,
    emitidas: num(l.emitidas),
    consumidas: num(l.consumidas),
    descartadas: num(l.descartadas),
    vencidas: num(l.vencidas),
    ativas: num(l.ativas),
  }));
}

function celulaCsv(v: unknown): string {
  if (v === null || v === undefined) return '';
  let s: string;
  if (typeof v === 'number') s = Number.isFinite(v) ? String(v).replace('.', ',') : '';
  else if (typeof v === 'boolean') s = v ? 'Sim' : 'Não';
  else if (v instanceof Date) s = v.toISOString();
  else if (Array.isArray(v)) s = v.join(', ');
  else if (typeof v === 'object') s = JSON.stringify(v);
  else s = String(v);
  return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** CSV separado por ';' (padrão do Excel pt-BR), decimais com vírgula. */
export function toCsv(rows: Record<string, unknown>[], colunas?: { chave: string; titulo: string }[]): string {
  const cols = colunas ?? Object.keys(rows[0] ?? {}).map((k) => ({ chave: k, titulo: k }));
  const linhas = [cols.map((c) => celulaCsv(c.titulo)).join(';')];
  for (const r of rows) linhas.push(cols.map((c) => celulaCsv(r[c.chave])).join(';'));
  return linhas.join('\r\n');
}

/** Baixa o CSV no navegador (com BOM UTF-8 para acentos no Excel). */
export function baixarCsv(nome: string, csv: string): void {
  const arquivo = nome.toLowerCase().endsWith('.csv') ? nome : `${nome}.csv`;
  const blob = new Blob(['﻿', csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = arquivo;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
