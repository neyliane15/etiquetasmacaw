import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  corSituacao,
  formatarData,
  formatarDataCurta,
  formatarDataHora,
  formatarMoeda,
  formatarQuantidade,
  formatarRelativo,
  formatarTemperatura,
  normalizarCodigo,
  rotuloSituacao,
  urlConsultaQr,
} from '@/lib/format';

describe('datas pt-BR', () => {
  const d = new Date(2026, 0, 5, 7, 3); // 05/01/2026 07:03 local
  it('formatarDataHora', () => expect(formatarDataHora(d)).toBe('05/01/26 07:03'));
  it('formatarData', () => expect(formatarData(d)).toBe('05/01/2026'));
  it('formatarDataCurta', () => expect(formatarDataCurta(d)).toBe('05/01 07:03'));
  it('data ISO só dia é local (sem deslocar o dia)', () => expect(formatarData('2026-03-01')).toBe('01/03/2026'));
  it.each([null, undefined, '', 'lixo'])('vazio/ inválido → — (%s)', (v) => {
    expect(formatarDataHora(v as string | null)).toBe('—');
    expect(formatarData(v as string | null)).toBe('—');
    expect(formatarDataCurta(v as string | null)).toBe('—');
  });
});

describe('formatarRelativo', () => {
  afterEach(() => vi.useRealTimers());
  it('futuro / passado / agora', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-15T12:00:00Z'));
    expect(formatarRelativo('2026-06-15T15:00:00Z')).toBe('em 3 h');
    expect(formatarRelativo('2026-06-13T12:00:00Z')).toBe('há 2 dias');
    expect(formatarRelativo('2026-06-15T12:15:00Z')).toBe('em 15 min');
    expect(formatarRelativo('2026-06-15T12:00:10Z')).toBe('agora');
    expect(formatarRelativo('2026-06-16T12:00:00Z')).toBe('em 24 h');
  });
});

describe('números', () => {
  it('moeda', () => {
    expect(formatarMoeda(12.3)).toBe('R$ 12,30');
    expect(formatarMoeda(1234.5)).toBe('R$ 1.234,50');
    expect(formatarMoeda(null)).toBe('—');
    expect(formatarMoeda(Number.NaN)).toBe('—');
  });
  it('moeda usa espaço comum (sem NBSP)', () => {
    expect(formatarMoeda(1)).not.toMatch(/[  ]/);
  });
  it('quantidade', () => {
    expect(formatarQuantidade(1.5, 'kg')).toBe('1,5 kg');
    expect(formatarQuantidade(0.125, 'l')).toBe('0,125 L');
    expect(formatarQuantidade(2, 'porcao')).toBe('2 porções');
    expect(formatarQuantidade(1, 'porcao')).toBe('1 porção');
    expect(formatarQuantidade(3)).toBe('3');
    expect(formatarQuantidade(null, 'kg')).toBe('—');
    expect(formatarQuantidade(1500, 'g')).toBe('1.500 g');
  });
  it('temperatura', () => {
    expect(formatarTemperatura(-18)).toBe('-18,0 °C');
    expect(formatarTemperatura(4.25)).toMatch(/^4,[23] °C$/);
    expect(formatarTemperatura(undefined)).toBe('—');
  });
});

describe('situação', () => {
  it('rótulos e cores', () => {
    expect(rotuloSituacao('vence_hoje')).toBe('Vence hoje');
    expect(corSituacao('vencida')).toBe('danger');
    expect(corSituacao('vence_72h')).toBe('warning');
    expect(corSituacao('ok')).toBe('success');
    expect(corSituacao('consumida')).toBe('neutral');
  });
});

describe('códigos / QR', () => {
  it('normalizarCodigo: minúsculas e espaços', () => {
    expect(normalizarCodigo('  ab cd 2345 ')).toBe('ABCD2345');
  });
  it('normalizarCodigo: URL → código', () => {
    expect(normalizarCodigo('https://etiquetas.macaw.com.br/q/k7p2x9qa')).toBe('K7P2X9QA');
    expect(normalizarCodigo('https://x.com/q/K7P2X9QA?utm=1#a')).toBe('K7P2X9QA');
    expect(normalizarCodigo('HTTP://X.COM/Q/abc23456/')).toBe('ABC23456');
  });
  it('normalizarCodigo: vazio', () => {
    expect(normalizarCodigo('')).toBe('');
  });
  it('urlConsultaQr', () => {
    expect(urlConsultaQr('K7P2X9QA', 'https://app.test/')).toBe('https://app.test/q/K7P2X9QA');
    expect(urlConsultaQr('A B', 'https://app.test')).toBe('https://app.test/q/A%20B');
    expect(urlConsultaQr('K7P2X9QA')).toBe(`${window.location.origin}/q/K7P2X9QA`);
  });
  it('urlConsultaQr ↔ normalizarCodigo ida e volta', () => {
    expect(normalizarCodigo(urlConsultaQr('K7P2X9QA', 'https://a.b'))).toBe('K7P2X9QA');
  });
});
