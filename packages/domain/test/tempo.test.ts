import { describe, it, expect } from 'vitest';
import {
  adicionarDias,
  adicionarMeses,
  anoDeData,
  compararDatas,
  dentroDoIntervalo,
  diaDeInstante,
  diasEntre,
  ehDiaUtil,
  ehFeriado,
  ehFimDeSemana,
  mesDeData,
  mesesEntre,
  relogioFixo,
  relogioSistema,
} from '../src/tipos/tempo.js';

describe('tempo — convenções temporais (secção 5.3.1)', () => {
  it('DataISO de 1 de janeiro é imputada ao ano correto (não recua para dezembro)', () => {
    // Um instante UTC de 1 de janeiro às 00:30 continua a ser 1 de janeiro em Lisboa.
    expect(diaDeInstante('2026-01-01T00:30:00.000Z')).toBe('2026-01-01');
    expect(anoDeData('2026-01-01')).toBe(2026);
  });

  it('31 de janeiro + 1 mês = 28 de fevereiro (ano não bissexto)', () => {
    expect(adicionarMeses('2025-01-31', 1)).toBe('2025-02-28');
  });

  it('31 de janeiro + 1 mês = 29 de fevereiro (ano bissexto)', () => {
    expect(adicionarMeses('2024-01-31', 1)).toBe('2024-02-29');
  });

  it('vigência de 36 meses calculada corretamente', () => {
    expect(mesesEntre('2024-01-01', '2027-01-01')).toBeCloseTo(36, 5);
  });

  it('agregação mensal correta em março e outubro (mudanças de hora)', () => {
    // Em Lisboa a hora muda no último domingo de março e de outubro.
    expect(mesDeData('2026-03-29')).toBe('2026-03');
    expect(mesDeData('2026-10-25')).toBe('2026-10');
    expect(diaDeInstante('2026-03-29T01:30:00.000Z')).toBe('2026-03-29');
  });

  it('deteta fins de semana e feriados nacionais', () => {
    expect(ehFimDeSemana('2026-07-25')).toBe(true); // sábado
    expect(ehFimDeSemana('2026-07-24')).toBe(false); // sexta
    expect(ehFeriado('2026-12-25')).toBe(true);
    expect(ehFeriado('2026-04-25')).toBe(true);
    expect(ehFeriado('2026-07-24')).toBe(false);
    expect(ehDiaUtil('2026-07-24')).toBe(true);
    expect(ehDiaUtil('2026-12-25')).toBe(false);
  });

  it('feriados móveis configuráveis', () => {
    expect(ehFeriado('2026-04-03', ['2026-04-03'])).toBe(true); // Sexta-feira Santa 2026
    expect(ehFeriado('2026-04-03')).toBe(false);
  });

  it('aritmética e comparação de datas', () => {
    expect(adicionarDias('2026-07-21', 30)).toBe('2026-08-20');
    expect(diasEntre('2026-07-21', '2026-08-20')).toBe(30);
    expect(compararDatas('2026-01-01', '2026-02-01')).toBeLessThan(0);
    expect(compararDatas('2026-02-01', '2026-02-01')).toBe(0);
    expect(dentroDoIntervalo('2026-07-21', '2026-01-01', '2026-12-31')).toBe(true);
    expect(dentroDoIntervalo('2026-07-21', '2026-08-01')).toBe(false);
    expect(dentroDoIntervalo('2026-07-21', '2026-01-01')).toBe(true); // intervalo aberto
  });

  it('relógio fixo devolve sempre o mesmo instante (UTC)', () => {
    const r = relogioFixo('2026-07-21T10:00:00+01:00');
    expect(r.agora()).toBe('2026-07-21T09:00:00.000Z');
    expect(r.agora()).toBe('2026-07-21T09:00:00.000Z');
  });

  it('relógio de sistema devolve um instante válido em UTC', () => {
    expect(relogioSistema.agora()).toMatch(/Z$/);
  });
});
