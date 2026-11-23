import { format, isValid, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { UNIDADE_MEDIDA_ROTULO } from '@/types/database';
import type { BadgeVariant, SituacaoEtiqueta, UnidadeMedida } from '@/types/database';

const VAZIO = '—';

function toDate(d: Date | string | null | undefined): Date | null {
  if (d === null || d === undefined || d === '') return null;
  const dt = d instanceof Date ? d : parseISO(d); // 'yyyy-MM-dd' é interpretado no fuso local
  return isValid(dt) ? dt : null;
}

/** Troca espaços não separáveis do Intl por espaço comum. */
function espacoSimples(s: string): string {
  return s.replace(/[  ]/g, ' ');
}

/** 'dd/MM/yy HH:mm'; '—' se vazio. */
export function formatarDataHora(d: Date | string | null | undefined): string {
  const dt = toDate(d);
  return dt ? format(dt, 'dd/MM/yy HH:mm', { locale: ptBR }) : VAZIO;
}

/** 'dd/MM/yyyy'; '—' se vazio. */
export function formatarData(d: Date | string | null | undefined): string {
  const dt = toDate(d);
  return dt ? format(dt, 'dd/MM/yyyy', { locale: ptBR }) : VAZIO;
}

/** 'dd/MM HH:mm' (usado na etiqueta); '—' se vazio. */
export function formatarDataCurta(d: Date | string | null | undefined): string {
  const dt = toDate(d);
  return dt ? format(dt, 'dd/MM HH:mm', { locale: ptBR }) : VAZIO;
}

/** 'em 3 h', 'há 2 dias', 'em 15 min', 'agora'. */
export function formatarRelativo(d: Date | string): string {
  const dt = toDate(d);
  if (!dt) return VAZIO;
  const diffMs = dt.getTime() - Date.now();
  const futuro = diffMs > 0;
  const min = Math.round(Math.abs(diffMs) / 60_000);
  let texto: string;
  if (min < 1) return 'agora';
  if (min < 60) texto = `${min} min`;
  else if (min < 48 * 60) texto = `${Math.round(min / 60)} h`;
  else {
    const dias = Math.round(min / (24 * 60));
    texto = dias === 1 ? '1 dia' : `${dias} dias`;
  }
  return futuro ? `em ${texto}` : `há ${texto}`;
}

const numFmt = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 3 });
const moedaFmt = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const tempFmt = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

/** '1,5 kg'; '—' se vazio. */
export function formatarQuantidade(q: number | null | undefined, um?: UnidadeMedida | null): string {
  if (q === null || q === undefined || !Number.isFinite(Number(q))) return VAZIO;
  const n = Number(q);
  const num = espacoSimples(numFmt.format(n));
  if (!um) return num;
  const rotulo = um === 'porcao' && n !== 1 ? 'porções' : UNIDADE_MEDIDA_ROTULO[um] ?? um;
  return `${num} ${rotulo}`;
}

/** 'R$ 12,30'; '—' se vazio. */
export function formatarMoeda(v: number | null | undefined): string {
  if (v === null || v === undefined || !Number.isFinite(Number(v))) return VAZIO;
  return espacoSimples(moedaFmt.format(Number(v)));
}

/** '-18,0 °C'; '—' se vazio. */
export function formatarTemperatura(t: number | null | undefined): string {
  if (t === null || t === undefined || !Number.isFinite(Number(t))) return VAZIO;
  return `${espacoSimples(tempFmt.format(Number(t)))} °C`;
}

const ROTULO_SITUACAO: Record<SituacaoEtiqueta, string> = {
  vencida: 'Vencida',
  vence_hoje: 'Vence hoje',
  vence_24h: 'Vence em 24 h',
  vence_72h: 'Vence em 72 h',
  ok: 'Dentro do prazo',
  consumida: 'Consumida',
  descartada: 'Descartada',
};

export function rotuloSituacao(s: SituacaoEtiqueta): string {
  return ROTULO_SITUACAO[s] ?? s;
}

const COR_SITUACAO: Record<SituacaoEtiqueta, BadgeVariant> = {
  vencida: 'danger',
  vence_hoje: 'danger',
  vence_24h: 'warning',
  vence_72h: 'warning',
  ok: 'success',
  consumida: 'neutral',
  descartada: 'neutral',
};

export function corSituacao(s: SituacaoEtiqueta): BadgeVariant {
  return COR_SITUACAO[s] ?? 'neutral';
}

/** `${origin}/q/${codigo}` */
export function urlConsultaQr(codigo: string, origin?: string): string {
  const base = (origin ?? (typeof window !== 'undefined' ? window.location.origin : '')).replace(/\/+$/, '');
  return `${base}/q/${encodeURIComponent(codigo)}`;
}

/** Maiúsculas, sem espaços; se for URL contendo '/q/', extrai o código. */
export function normalizarCodigo(input: string): string {
  let s = (input ?? '').trim();
  const idx = s.toLowerCase().lastIndexOf('/q/');
  if (idx >= 0) {
    s = s.slice(idx + 3).split(/[/?#]/)[0] ?? '';
    try {
      s = decodeURIComponent(s);
    } catch {
      /* mantém como veio */
    }
  }
  return s.replace(/\s+/g, '').toUpperCase();
}
