import { createElement } from 'react';
import { createRoot } from 'react-dom/client';
import type { Root } from 'react-dom/client';
import { flushSync } from 'react-dom';
import type { Etiqueta, EtiquetaDetalhe, LabelData, ModeloEtiqueta } from '@/types/database';
import { urlConsultaQr } from '@/lib/format';
import { getModelo, getModeloPadrao, registrarReimpressao } from '@/lib/api';
import { LabelPrintSheet } from '@/components/label/LabelPrintSheet';
import type { LabelPreviewProps } from '@/components/label/LabelPreview';
import { gerarQrSvg } from '@/components/label/QrCode';

const STYLE_ID = 'macaw-page-size';

/** Modelo usado quando nenhum modelo foi encontrado (60×40 padrão). */
export const MODELO_FALLBACK: LabelPreviewProps['modelo'] = {
  largura_mm: 60,
  altura_mm: 40,
  campos: ['produto', 'tipo', 'metodo', 'data_manipulacao', 'validade', 'responsavel', 'codigo', 'qr'],
  fonte_base_pt: 7,
  mostrar_logo: false,
};

let limpezaAtual: (() => void) | null = null;

function proximoFrame(): Promise<void> {
  return new Promise((resolve) => {
    if (typeof requestAnimationFrame !== 'function') {
      setTimeout(resolve, 16);
      return;
    }
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  });
}

/**
 * Imprime etiquetas no tamanho exato do modelo:
 * monta LabelPrintSheet em #print-root, injeta @page em mm, aguarda QR e 2 frames, chama window.print()
 * e desmonta no 'afterprint'.
 */
export async function imprimirEtiquetas(itens: LabelData[], modelo: LabelPreviewProps['modelo']): Promise<void> {
  if (!itens.length) return;
  if (limpezaAtual) limpezaAtual();

  let host = document.getElementById('print-root');
  if (!host) {
    host = document.createElement('div');
    host.id = 'print-root';
    document.body.appendChild(host);
  }

  if (modelo.campos.includes('qr')) {
    await Promise.all(itens.map((i) => gerarQrSvg(urlConsultaQr(i.codigo)).catch(() => '')));
  }

  const largura = Number(modelo.largura_mm);
  const altura = Number(modelo.altura_mm);
  let style = document.getElementById(STYLE_ID) as HTMLStyleElement | null;
  if (!style) {
    style = document.createElement('style');
    style.id = STYLE_ID;
    document.head.appendChild(style);
  }
  style.textContent =
    `@page { size: ${largura}mm ${altura}mm; margin: 0 }\n` +
    `@media print { html, body { width: ${largura}mm; } #print-root .label { width: ${largura}mm; height: ${altura}mm; } }`;

  const root: Root = createRoot(host);
  flushSync(() => {
    root.render(createElement(LabelPrintSheet, { itens, modelo }));
  });

  await proximoFrame();

  await new Promise<void>((resolve) => {
    let feito = false;
    const limpar = () => {
      if (feito) return;
      feito = true;
      window.removeEventListener('afterprint', limpar);
      limpezaAtual = null;
      try {
        root.unmount();
      } catch {
        /* já desmontado */
      }
      document.getElementById(STYLE_ID)?.remove();
      resolve();
    };
    limpezaAtual = limpar;
    window.addEventListener('afterprint', limpar);
    try {
      window.print();
    } catch {
      limpar();
      return;
    }
    // Fallback para navegadores que não disparam 'afterprint'.
    setTimeout(limpar, 1500);
  });
}

export function etiquetaParaLabelData(e: Etiqueta | EtiquetaDetalhe, unidadeNome?: string): LabelData {
  const nomeUnidade = unidadeNome ?? ('unidade_nome' in e ? e.unidade_nome : null) ?? null;
  return {
    codigo: e.codigo,
    produto_nome: e.produto_nome,
    tipo: e.tipo,
    metodo: e.metodo,
    data_manipulacao: e.data_manipulacao,
    data_validade: e.data_validade,
    data_validade_fabricante: e.data_validade_fabricante,
    responsavel_nome: e.responsavel_nome,
    lote: e.lote,
    fornecedor_nome: e.fornecedor_nome,
    sif: e.sif,
    quantidade: e.quantidade,
    unidade_medida: e.unidade_medida,
    alergenicos: e.alergenicos ?? [],
    observacoes: e.observacoes,
    unidade_nome: nomeUnidade,
  };
}

/** Resolve o modelo de impressão: o da etiqueta, senão o padrão da unidade/global, senão 60×40. */
export async function resolverModelo(
  modeloId: string | null | undefined,
  unidadeId: string | null,
): Promise<ModeloEtiqueta | LabelPreviewProps['modelo']> {
  if (modeloId) {
    try {
      return await getModelo(modeloId);
    } catch {
      /* segue para o padrão */
    }
  }
  try {
    const padrao = await getModeloPadrao(unidadeId);
    if (padrao) return padrao;
  } catch {
    /* usa fallback */
  }
  return MODELO_FALLBACK;
}

/** Reimprime uma etiqueta existente e registra a reimpressão. Retorna o novo total de impressões. */
export async function reimprimirEtiqueta(e: Etiqueta | EtiquetaDetalhe, unidadeNome?: string): Promise<number> {
  const modelo = await resolverModelo(e.modelo_id, e.unidade_id);
  await imprimirEtiquetas([etiquetaParaLabelData(e, unidadeNome)], modelo);
  return registrarReimpressao(e.id);
}
