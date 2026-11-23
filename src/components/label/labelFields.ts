import {
  ALERGENICO_ROTULO,
  FAIXA_METODO,
  METODO_ROTULO,
  TIPO_ETIQUETA_ROTULO,
} from '@/types/database';
import type { Alergenico, CampoEtiqueta, LabelData, ModeloEtiqueta } from '@/types/database';
import { formatarData, formatarDataCurta, formatarQuantidade } from '@/lib/format';

/** Rótulos curtos usados na etiqueta impressa (espaço reduzido). */
export const ROTULO_CURTO: Record<CampoEtiqueta, string> = {
  logo: 'Logo',
  unidade: 'Unid.',
  produto: 'Produto',
  tipo: 'Tipo',
  metodo: 'Conserv.',
  data_manipulacao: 'Manip.',
  validade: 'Val.',
  responsavel: 'Resp.',
  lote: 'Lote',
  fornecedor: 'Forn.',
  sif: 'SIF',
  quantidade: 'Qtd.',
  alergenicos: 'Alérg.',
  observacoes: 'Obs.',
  validade_fabricante: 'Val. fab.',
  codigo: 'Cód.',
  qr: 'QR',
};

/** Campos que não geram linha de texto (são elementos gráficos). */
const CAMPOS_GRAFICOS: CampoEtiqueta[] = ['logo', 'qr'];

export function rotuloAlergenico(a: string): string {
  return (ALERGENICO_ROTULO as Record<string, string>)[a as Alergenico] ?? a;
}

export function textoAlergenicos(lista: string[] | null | undefined): string {
  if (!lista || lista.length === 0) return '';
  return `Contém: ${lista.map(rotuloAlergenico).join(', ')}`;
}

function vazio(v: string | null | undefined): boolean {
  return v == null || String(v).trim() === '' || v === '—';
}

function valorCampo(data: LabelData, campo: CampoEtiqueta): string {
  switch (campo) {
    case 'produto':
      return data.produto_nome ?? '';
    case 'tipo':
      return TIPO_ETIQUETA_ROTULO[data.tipo] ?? '';
    case 'metodo':
      return data.metodo ? `${METODO_ROTULO[data.metodo]} · ${FAIXA_METODO[data.metodo]}` : '';
    case 'data_manipulacao':
      return data.data_manipulacao ? formatarDataCurta(data.data_manipulacao) : '';
    case 'validade':
      return data.data_validade ? formatarDataCurta(data.data_validade) : '';
    case 'validade_fabricante':
      return data.data_validade_fabricante ? formatarData(data.data_validade_fabricante) : '';
    case 'responsavel':
      return data.responsavel_nome ?? '';
    case 'lote':
      return data.lote ?? '';
    case 'fornecedor':
      return data.fornecedor_nome ?? '';
    case 'sif':
      return data.sif ?? '';
    case 'quantidade':
      return data.quantidade != null ? formatarQuantidade(data.quantidade, data.unidade_medida ?? null) : '';
    case 'alergenicos':
      return textoAlergenicos(data.alergenicos);
    case 'observacoes':
      return data.observacoes ?? '';
    case 'unidade':
      return data.unidade_nome ?? '';
    case 'codigo':
      return data.codigo ?? '';
    default:
      return '';
  }
}

/**
 * Linhas de texto da etiqueta na ordem do modelo.
 * Campos vazios são omitidos (exceto produto e validade). 'logo' e 'qr' não geram linha.
 */
export function linhasEtiqueta(
  data: LabelData,
  campos: CampoEtiqueta[],
): { campo: CampoEtiqueta; rotulo: string; valor: string }[] {
  const vistos = new Set<CampoEtiqueta>();
  const out: { campo: CampoEtiqueta; rotulo: string; valor: string }[] = [];
  for (const campo of campos) {
    if (vistos.has(campo) || CAMPOS_GRAFICOS.includes(campo)) continue;
    vistos.add(campo);
    const valor = valorCampo(data, campo);
    const obrigatorio = campo === 'produto' || campo === 'validade';
    if (!obrigatorio && vazio(valor)) continue;
    out.push({ campo, rotulo: ROTULO_CURTO[campo], valor: vazio(valor) ? '—' : valor });
  }
  return out;
}

/** Lado do QR em mm: min(altura × 0,55, largura × 0,4), limitado a 10..30 mm. */
export function tamanhoQrMm(modelo: Pick<ModeloEtiqueta, 'largura_mm' | 'altura_mm'>): number {
  const base = Math.min(Number(modelo.altura_mm) * 0.55, Number(modelo.largura_mm) * 0.4);
  const limitado = Math.max(10, Math.min(30, Number.isFinite(base) ? base : 10));
  return Math.round(limitado * 10) / 10;
}
