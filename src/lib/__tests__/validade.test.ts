import { describe, expect, it } from 'vitest';
import {
  VALIDADE_MAXIMA_HORAS,
  diaOperacao,
  validarPrazoEmissao,
  calcularValidade,
  descreverPrazo,
  diasHorasParaHoras,
  horasParaDiasHoras,
  horasRestantes,
  horasValidadeProduto,
  metodosDisponiveis,
  ordenarPVPS,
  situacaoValidade,
} from '@/lib/validade';

const H = 3_600_000;
const produto = {
  validade_resfriado_horas: 72,
  validade_congelado_horas: 720,
  validade_ambiente_horas: null,
  validade_descongelando_horas: 24,
};

describe('calcularValidade', () => {
  it('soma 72 h', () => {
    const base = new Date('2026-03-10T10:00:00Z');
    expect(calcularValidade(base, 72).toISOString()).toBe('2026-03-13T10:00:00.000Z');
  });
  it('aceita string ISO', () => {
    expect(calcularValidade('2026-03-10T10:00:00Z', 1).toISOString()).toBe('2026-03-10T11:00:00.000Z');
  });
  it('vira o mês (31/01 + 48 h → 02/02)', () => {
    expect(calcularValidade('2026-01-31T12:00:00Z', 48).toISOString()).toBe('2026-02-02T12:00:00.000Z');
  });
  it('vira o ano e fevereiro bissexto', () => {
    expect(calcularValidade('2026-12-31T23:00:00Z', 2).toISOString()).toBe('2027-01-01T01:00:00.000Z');
    expect(calcularValidade('2028-02-28T12:00:00Z', 24).toISOString()).toBe('2028-02-29T12:00:00.000Z');
  });
  it('não muta a data de entrada', () => {
    const base = new Date('2026-03-10T10:00:00Z');
    calcularValidade(base, 5);
    expect(base.toISOString()).toBe('2026-03-10T10:00:00.000Z');
  });
  it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY])('lança para horas inválidas (%s)', (h) => {
    expect(() => calcularValidade(new Date(), h)).toThrow();
  });
  it('lança para data inválida', () => {
    expect(() => calcularValidade('não é data', 5)).toThrow(/Data inválida/);
  });
});

describe('situacaoValidade', () => {
  // agora fixo: 10:00 em São Paulo (13:00 UTC) — independe do fuso da máquina
  const agora = new Date('2026-06-15T13:00:00Z');
  const em = (horas: number) => new Date(agora.getTime() + horas * H);
  it('vencida (passado e exatamente agora)', () => {
    expect(situacaoValidade(em(-1), agora)).toBe('vencida');
    expect(situacaoValidade(agora, agora)).toBe('vencida');
  });
  it('vence_hoje (mesmo dia civil)', () => {
    expect(situacaoValidade(em(5), agora)).toBe('vence_hoje');
    expect(situacaoValidade(new Date('2026-06-16T02:59:00Z'), agora)).toBe('vence_hoje'); // 23:59 SP
  });
  it('vence_hoje usa America/Sao_Paulo, não o fuso do navegador (bug #10)', () => {
    // 22:00 SP = 01:00 UTC do dia seguinte: para um navegador em UTC seria "amanhã"
    expect(situacaoValidade(new Date('2026-06-16T01:00:00Z'), agora)).toBe('vence_hoje');
    // 00:30 SP do dia seguinte = 03:30 UTC: não é mais hoje em SP
    expect(situacaoValidade(new Date('2026-06-16T03:30:00Z'), agora)).toBe('vence_24h');
    expect(diaOperacao(new Date('2026-06-16T02:59:00Z'))).toBe('2026-06-15');
  });
  it('vence_24h (amanhã, dentro de 24 h)', () => {
    expect(situacaoValidade(em(20), agora)).toBe('vence_24h');
    expect(situacaoValidade(em(24), agora)).toBe('vence_24h');
  });
  it('vence_72h', () => {
    expect(situacaoValidade(em(25), agora)).toBe('vence_72h');
    expect(situacaoValidade(em(72), agora)).toBe('vence_72h');
  });
  it('ok (> 72 h)', () => {
    expect(situacaoValidade(em(73), agora)).toBe('ok');
  });
  it('aceita string', () => {
    expect(situacaoValidade(em(100).toISOString(), agora)).toBe('ok');
  });
});

describe('horasRestantes', () => {
  const agora = new Date('2026-06-15T10:00:00Z');
  it('arredonda a 1 casa e é negativo se vencida', () => {
    expect(horasRestantes(new Date(agora.getTime() + 1.26 * H), agora)).toBe(1.3);
    expect(horasRestantes(new Date(agora.getTime() - 2 * H), agora)).toBe(-2);
  });
  it('não retorna -0', () => {
    expect(Object.is(horasRestantes(new Date(agora.getTime() - 1000), agora), -0)).toBe(false);
  });
});

describe('dias/horas', () => {
  it('horasParaDiasHoras', () => {
    expect(horasParaDiasHoras(72)).toEqual({ dias: 3, horas: 0 });
    expect(horasParaDiasHoras(30)).toEqual({ dias: 1, horas: 6 });
    expect(horasParaDiasHoras(0)).toEqual({ dias: 0, horas: 0 });
    expect(horasParaDiasHoras(-5)).toEqual({ dias: 0, horas: 0 });
  });
  it('ida e volta', () => {
    for (const h of [1, 12, 23, 24, 25, 48, 72, 100, 720, 2160]) {
      const { dias, horas } = horasParaDiasHoras(h);
      expect(diasHorasParaHoras(dias, horas)).toBe(h);
    }
  });
  it('diasHorasParaHoras tolera NaN', () => {
    expect(diasHorasParaHoras(Number.NaN, 5)).toBe(5);
  });
});

describe('descreverPrazo', () => {
  it.each([
    [72, '3 dias'],
    [30, '1 dia e 6 h'],
    [12, '12 h'],
    [720, '30 dias'],
    [24, '1 dia'],
    [49, '2 dias e 1 h'],
  ])('%s h → %s', (h, txt) => {
    expect(descreverPrazo(h)).toBe(txt);
  });
});

describe('metodosDisponiveis / horasValidadeProduto', () => {
  it('só métodos com horas > 0, na ordem fixa', () => {
    expect(metodosDisponiveis(produto)).toEqual(['resfriado', 'congelado', 'descongelando']);
  });
  it('nenhum método', () => {
    expect(
      metodosDisponiveis({
        validade_resfriado_horas: null,
        validade_congelado_horas: 0,
        validade_ambiente_horas: null,
        validade_descongelando_horas: null,
      }),
    ).toEqual([]);
  });
  it('horasValidadeProduto', () => {
    expect(horasValidadeProduto(produto, 'congelado')).toBe(720);
    expect(horasValidadeProduto(produto, 'ambiente')).toBeNull();
  });
});

describe('ordenarPVPS', () => {
  it('ordena por validade ascendente sem mutar', () => {
    const itens = [
      { id: 'b', data_validade: '2026-06-03T00:00:00Z' },
      { id: 'a', data_validade: '2026-06-01T00:00:00Z' },
      { id: 'c', data_validade: '2026-06-02T00:00:00Z' },
    ];
    const copia = itens.map((i) => i.id);
    const ord = ordenarPVPS(itens);
    expect(ord.map((i) => i.id)).toEqual(['a', 'c', 'b']);
    expect(itens.map((i) => i.id)).toEqual(copia);
    expect(ord).not.toBe(itens);
  });
});

describe('validarPrazoEmissao (espelha validar_prazo_etiqueta, bug #8)', () => {
  const agora = new Date('2026-06-15T13:00:00Z');
  const base = { horasPadrao: 72, manipulacao: agora, agora };
  it('cozinheiro: até o padrão ok, acima do padrão bloqueia', () => {
    expect(validarPrazoEmissao({ ...base, horas: 72, gestor: false })).toEqual([]);
    expect(validarPrazoEmissao({ ...base, horas: 48, gestor: false })).toEqual([]);
    expect(validarPrazoEmissao({ ...base, horas: 73, gestor: false })[0]).toMatch(/acima do padrão/);
  });
  it('gestor pode estender até 365 dias', () => {
    expect(validarPrazoEmissao({ ...base, horas: 500, gestor: true })).toEqual([]);
    expect(validarPrazoEmissao({ ...base, horas: VALIDADE_MAXIMA_HORAS + 1, gestor: true })[0]).toMatch(/365 dias/);
  });
  it('produto avulso (sem padrão) só respeita o máximo', () => {
    expect(validarPrazoEmissao({ ...base, horasPadrao: null, horas: 1000, gestor: false })).toEqual([]);
    expect(validarPrazoEmissao({ ...base, horasPadrao: null, horas: 9000, gestor: false })).toHaveLength(1);
  });
  it('manipulação no futuro (> 1 h) e retroativa > 7 dias para cozinheiro', () => {
    const futuro = new Date(agora.getTime() + 2 * H);
    expect(validarPrazoEmissao({ ...base, manipulacao: futuro, horas: 10, gestor: true })[0]).toMatch(/futuro/);
    const antiga = new Date(agora.getTime() - 8 * 24 * H);
    expect(validarPrazoEmissao({ ...base, manipulacao: antiga, horas: 10, gestor: false })[0]).toMatch(/7 dias/);
    expect(validarPrazoEmissao({ ...base, manipulacao: antiga, horas: 10, gestor: true })).toEqual([]);
  });
  it('derivada: manipulação não pode ser anterior à da origem', () => {
    const origem = new Date(agora.getTime() + 0);
    const antes = new Date(agora.getTime() - H);
    expect(
      validarPrazoEmissao({ ...base, manipulacao: antes, manipulacaoMinima: origem, horas: 10, gestor: true })[0],
    ).toMatch(/origem/);
  });
  it('data inválida', () => {
    expect(validarPrazoEmissao({ ...base, manipulacao: new Date('x'), horas: 10, gestor: true })).toEqual([
      'Data de manipulação inválida.',
    ]);
  });
});
