import { describe, expect, it } from 'vitest';
import type { CampoEtiqueta, LabelData } from '@/types/database';
import { linhasEtiqueta, tamanhoQrMm, textoAlergenicos } from '@/components/label/labelFields';

const base: LabelData = {
  codigo: 'K7P2X9QA',
  produto_nome: 'Filé mignon porcionado',
  tipo: 'manipulacao',
  metodo: 'resfriado',
  data_manipulacao: new Date(2026, 5, 15, 9, 30).toISOString(),
  data_validade: new Date(2026, 5, 18, 9, 30).toISOString(),
  responsavel_nome: 'Carlos Silva',
  lote: null,
  fornecedor_nome: '',
  sif: null,
  quantidade: 1.5,
  unidade_medida: 'kg',
  alergenicos: ['leite', 'gluten'],
  observacoes: '   ',
  unidade_nome: 'Macaw Camboinhas',
};

describe('linhasEtiqueta', () => {
  it('respeita a ordem do modelo', () => {
    const campos: CampoEtiqueta[] = ['responsavel', 'validade', 'produto', 'quantidade', 'unidade'];
    expect(linhasEtiqueta(base, campos).map((l) => l.campo)).toEqual(campos);
  });
  it('ignora qr/logo e campos duplicados', () => {
    const out = linhasEtiqueta(base, ['qr', 'produto', 'logo', 'produto', 'codigo']);
    expect(out.map((l) => l.campo)).toEqual(['produto', 'codigo']);
  });
  it('omite campos vazios (null, "", espaços)', () => {
    const out = linhasEtiqueta(base, ['lote', 'fornecedor', 'sif', 'observacoes', 'validade_fabricante', 'responsavel']);
    expect(out.map((l) => l.campo)).toEqual(['responsavel']);
  });
  it('produto e validade são obrigatórios: aparecem com — se vazios', () => {
    const out = linhasEtiqueta({ ...base, produto_nome: '', data_validade: '' }, ['produto', 'validade']);
    expect(out).toEqual([
      { campo: 'produto', rotulo: 'Produto', valor: '—' },
      { campo: 'validade', rotulo: 'Val.', valor: '—' },
    ]);
  });
  it('formata valores', () => {
    const out = Object.fromEntries(
      linhasEtiqueta(base, ['metodo', 'tipo', 'validade', 'data_manipulacao', 'quantidade', 'alergenicos']).map((l) => [l.campo, l.valor]),
    );
    expect(out.metodo).toBe('RESFRIADO · 0 a 5 °C');
    expect(out.tipo).toBe('Manipulação');
    expect(out.validade).toBe('18/06 09:30');
    expect(out.data_manipulacao).toBe('15/06 09:30');
    expect(out.quantidade).toBe('1,5 kg');
    expect(out.alergenicos).toBe('Contém: Leite, Glúten');
  });
  it('alergênicos vazios são omitidos', () => {
    expect(linhasEtiqueta({ ...base, alergenicos: [] }, ['alergenicos'])).toEqual([]);
    expect(textoAlergenicos(undefined)).toBe('');
    expect(textoAlergenicos(['xyz'])).toBe('Contém: xyz');
  });
  it('quantidade 0 é exibida', () => {
    expect(linhasEtiqueta({ ...base, quantidade: 0 }, ['quantidade'])[0]?.valor).toBe('0 kg');
  });
});

describe('tamanhoQrMm', () => {
  it.each([
    [60, 40, 22],   // min(22, 24)
    [60, 60, 24],   // min(33, 24)
    [50, 30, 16.5], // min(16.5, 20)
    [40, 40, 16],   // min(22, 16)
    [100, 50, 27.5],
    [20, 15, 10],   // limite inferior
    [150, 200, 30], // limite superior
  ])('%sx%s mm → %s mm', (l, a, esperado) => {
    expect(tamanhoQrMm({ largura_mm: l, altura_mm: a })).toBe(esperado);
  });
  it('aceita numeric em string (vindo do Postgres) e valores inválidos', () => {
    expect(tamanhoQrMm({ largura_mm: '60' as unknown as number, altura_mm: '40' as unknown as number })).toBe(22);
    expect(tamanhoQrMm({ largura_mm: Number.NaN, altura_mm: 40 })).toBe(10);
  });
  it('QR cabe na altura útil da etiqueta 60×40', () => {
    expect(tamanhoQrMm({ largura_mm: 60, altura_mm: 40 })).toBeLessThan(40 - 2.4);
  });
});
