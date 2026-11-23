import { describe, expect, it } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { CampoEtiqueta, LabelData } from '@/types/database';
import { LabelPreview } from '@/components/label/LabelPreview';
import { LabelPrintSheet } from '@/components/label/LabelPrintSheet';
import { MODELO_FALLBACK } from '@/components/label/printLabels';

const data: LabelData = {
  codigo: 'K7P2X9QA',
  produto_nome: 'Peito de frango',
  tipo: 'manipulacao',
  metodo: 'resfriado',
  data_manipulacao: new Date(2026, 5, 15, 9, 30).toISOString(),
  data_validade: new Date(2026, 5, 18, 9, 30).toISOString(),
  responsavel_nome: 'Carlos',
  lote: 'L-2026-01',
  alergenicos: [],
};

const modelo6040 = {
  largura_mm: 60,
  altura_mm: 40,
  campos: ['produto', 'tipo', 'metodo', 'data_manipulacao', 'validade', 'responsavel', 'codigo', 'qr'] as CampoEtiqueta[],
  fonte_base_pt: 7,
  mostrar_logo: false,
};

describe('LabelPreview', () => {
  it('renderiza em mm com fonte em pt', () => {
    render(<LabelPreview data={data} modelo={modelo6040} qrOrigin="https://app.test" />);
    const el = screen.getByTestId('label-preview');
    expect(el.style.width).toBe('60mm');
    expect(el.style.height).toBe('40mm');
    expect(el.style.fontSize).toBe('7pt');
  });
  it('mostra produto, método e validade formatada', () => {
    render(<LabelPreview data={data} modelo={modelo6040} />);
    const el = screen.getByTestId('label-preview');
    expect(el).toHaveTextContent('Peito de frango');
    expect(el).toHaveTextContent('RESFRIADO');
    expect(el).toHaveTextContent('0 a 5 °C');
    expect(el).toHaveTextContent('18/06 09:30');
    expect(el).toHaveTextContent('15/06 09:30');
    expect(el).toHaveTextContent('K7P2X9QA');
  });
  it('QR presente com o link /q/CODIGO (SVG monocromático)', async () => {
    render(<LabelPreview data={data} modelo={modelo6040} qrOrigin="https://app.test" />);
    const qr = screen.getByTestId('label-qr');
    expect(qr.style.width).toBe('22mm');
    await waitFor(() => expect(qr.querySelector('svg')).not.toBeNull());
    const svg = qr.innerHTML;
    const cores = new Set((svg.match(/#[0-9a-fA-F]{3,6}\b/g) ?? []).map((c) => c.toLowerCase()));
    for (const c of cores) expect(['#000000', '#ffffff', '#000', '#fff']).toContain(c);
  });
  it('sem "qr" nos campos não renderiza QR', () => {
    render(<LabelPreview data={data} modelo={{ ...modelo6040, campos: ['produto', 'validade'] }} />);
    expect(screen.queryByTestId('label-qr')).toBeNull();
  });
  it('com "lote" mostra o lote; sem "lote" não mostra', () => {
    const { rerender } = render(<LabelPreview data={data} modelo={{ ...modelo6040, campos: ['produto', 'validade', 'lote'] }} />);
    expect(screen.getByTestId('label-preview')).toHaveTextContent('L-2026-01');
    rerender(<LabelPreview data={data} modelo={modelo6040} />);
    expect(screen.getByTestId('label-preview')).not.toHaveTextContent('L-2026-01');
  });
  it('escala aplica transform só na tela (wrapper com tamanho escalado)', () => {
    const { container } = render(<LabelPreview data={data} modelo={modelo6040} escala={2} />);
    const wrap = container.querySelector('.label-scale') as HTMLElement;
    expect(wrap.style.width).toBe('120mm');
    expect(screen.getByTestId('label-preview').style.transform).toBe('scale(2)');
  });
  it('estilos da etiqueta são monocromáticos (só #000/#fff/rgba preto)', () => {
    const css = readFileSync(resolve(__dirname, '../label.css'), 'utf8');
    const hex = new Set((css.match(/#[0-9a-fA-F]{3,8}\b/g) ?? []).map((c) => c.toLowerCase()));
    for (const c of hex) expect(['#000', '#fff', '#000000', '#ffffff']).toContain(c);
    const rgba = css.match(/rgba?\(([^)]+)\)/g) ?? [];
    for (const c of rgba) expect(c.replace(/\s/g, '')).toMatch(/^rgba?\(0,0,0/);
    expect(css).not.toMatch(/var\(--/);
  });
  it('LabelPrintSheet renderiza uma etiqueta por item', () => {
    render(<LabelPrintSheet itens={[data, { ...data, codigo: 'ABCD2345' }]} modelo={MODELO_FALLBACK} />);
    expect(screen.getAllByTestId('label-preview')).toHaveLength(2);
  });
});
