import type { MetodoConservacao, Produto, SituacaoValidade } from '@/types/database';

type ProdutoValidades = Pick<
  Produto,
  'validade_resfriado_horas' | 'validade_congelado_horas' | 'validade_ambiente_horas' | 'validade_descongelando_horas'
>;

const ORDEM_METODOS: MetodoConservacao[] = ['resfriado', 'congelado', 'ambiente', 'descongelando'];
const HORA_MS = 3_600_000;

function toDate(d: Date | string): Date {
  const dt = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(dt.getTime())) throw new Error(`Data inválida: ${String(d)}`);
  return dt;
}

/** Horas de validade do produto para o método (null = método não permitido). */
export function horasValidadeProduto(produto: ProdutoValidades, metodo: MetodoConservacao): number | null {
  const mapa: Record<MetodoConservacao, number | null> = {
    resfriado: produto.validade_resfriado_horas,
    congelado: produto.validade_congelado_horas,
    ambiente: produto.validade_ambiente_horas,
    descongelando: produto.validade_descongelando_horas,
  };
  const h = mapa[metodo];
  return typeof h === 'number' && Number.isFinite(h) && h > 0 ? h : null;
}

/** Métodos com validade definida, na ordem resfriado, congelado, ambiente, descongelando. */
export function metodosDisponiveis(produto: Parameters<typeof horasValidadeProduto>[0]): MetodoConservacao[] {
  return ORDEM_METODOS.filter((m) => horasValidadeProduto(produto, m) !== null);
}

/** dataManipulacao + horas. Lança Error se horas <= 0 ou não finito. */
export function calcularValidade(dataManipulacao: Date | string, horas: number): Date {
  if (typeof horas !== 'number' || !Number.isFinite(horas) || horas <= 0) {
    throw new Error('A validade deve ser um número de horas maior que zero.');
  }
  const base = toDate(dataManipulacao);
  return new Date(base.getTime() + horas * HORA_MS);
}

function mesmoDiaLocal(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

/** Mesmas regras da view vw_etiquetas (hoje = mesmo dia civil no fuso local). */
export function situacaoValidade(dataValidade: Date | string, agora: Date = new Date()): SituacaoValidade {
  const v = toDate(dataValidade);
  const diff = v.getTime() - agora.getTime();
  if (diff <= 0) return 'vencida';
  if (mesmoDiaLocal(v, agora)) return 'vence_hoje';
  if (diff <= 24 * HORA_MS) return 'vence_24h';
  if (diff <= 72 * HORA_MS) return 'vence_72h';
  return 'ok';
}

/** Horas até a validade (negativo se vencida), arredondado a 1 casa. */
export function horasRestantes(dataValidade: Date | string, agora: Date = new Date()): number {
  const v = toDate(dataValidade);
  const h = (v.getTime() - agora.getTime()) / HORA_MS;
  const r = Math.round(h * 10) / 10;
  return Object.is(r, -0) ? 0 : r;
}

export function horasParaDiasHoras(horas: number): { dias: number; horas: number } {
  const total = Math.max(0, Math.round(horas));
  return { dias: Math.floor(total / 24), horas: total % 24 };
}

export function diasHorasParaHoras(dias: number, horas: number): number {
  return (Number(dias) || 0) * 24 + (Number(horas) || 0);
}

/** 72 → '3 dias'; 30 → '1 dia e 6 h'; 12 → '12 h'; 720 → '30 dias'. */
export function descreverPrazo(horas: number): string {
  const { dias, horas: h } = horasParaDiasHoras(horas);
  const parteDias = dias === 1 ? '1 dia' : `${dias} dias`;
  if (dias === 0) return `${h} h`;
  if (h === 0) return parteDias;
  return `${parteDias} e ${h} h`;
}

/** PVPS: ordena por validade ascendente, sem mutar o array original. */
export function ordenarPVPS<T extends { data_validade: string }>(itens: T[]): T[] {
  return [...itens].sort((a, b) => new Date(a.data_validade).getTime() - new Date(b.data_validade).getTime());
}
