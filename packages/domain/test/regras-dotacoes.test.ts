import { describe, it, expect } from 'vitest';
import { RN_301, RN_302, RN_303, RN_304, RN_305, RN_306 } from '../src/rules/dotacoes.js';

describe('RN-301 complementares ≤ 50% do preço inicial', () => {
  it('positivo — a 42%', () => expect(RN_301.avaliar({ precoContratualInicial: 100, complementaresAcumulados: 42 }).ok).toBe(true));
  it('positivo — exatamente 50%', () => expect(RN_301.avaliar({ precoContratualInicial: 100, complementaresAcumulados: 50 }).ok).toBe(true));
  it('negativo — 51%', () => expect(RN_301.avaliar({ precoContratualInicial: 100, complementaresAcumulados: 51 }).ok).toBe(false));
});

describe('RN-302 alerta aos 40/45% (aviso)', () => {
  it('consultiva', () => expect(RN_302.bloqueia).toBe(false));
  it('positivo — abaixo de 40%', () => expect(RN_302.avaliar({ precoContratualInicial: 100, complementaresAcumulados: 39 }).ok).toBe(true));
  it('negativo — a 42% dispara aviso', () => expect(RN_302.avaliar({ precoContratualInicial: 100, complementaresAcumulados: 42 }).ok).toBe(false));
});

describe('RN-303 bolsa de valor exige perfil habilitado', () => {
  it('positivo', () => expect(RN_303.avaliar({ tipoDotacao: 'BOLSA_VALOR', consomeBolsaValor: true }).ok).toBe(true));
  it('negativo', () => expect(RN_303.avaliar({ tipoDotacao: 'BOLSA_VALOR', consomeBolsaValor: false }).ok).toBe(false));
  it('positivo — horas base indiferente', () => expect(RN_303.avaliar({ tipoDotacao: 'HORAS_BASE', consomeBolsaValor: false }).ok).toBe(true));
});

describe('RN-304 trabalhos complementares exige perfil habilitado', () => {
  it('positivo', () => expect(RN_304.avaliar({ tipoDotacao: 'TRABALHOS_COMPLEMENTARES', consomeTrabalhosComplementares: true }).ok).toBe(true));
  it('negativo', () => expect(RN_304.avaliar({ tipoDotacao: 'TRABALHOS_COMPLEMENTARES', consomeTrabalhosComplementares: false }).ok).toBe(false));
});

describe('RN-305 complementares criam dotação e atualizam preço', () => {
  it('positivo', () => expect(RN_305.avaliar({ criaDotacao: true, atualizaPrecoAtual: true }).ok).toBe(true));
  it('negativo — sem dotação', () => expect(RN_305.avaliar({ criaDotacao: false, atualizaPrecoAtual: true }).ok).toBe(false));
  it('negativo — sem atualizar preço', () => expect(RN_305.avaliar({ criaDotacao: true, atualizaPrecoAtual: false }).ok).toBe(false));
});

describe('RN-306 publicitação Portal BASE (aviso)', () => {
  it('consultiva', () => expect(RN_306.bloqueia).toBe(false));
  it('positivo — publicitada', () => expect(RN_306.avaliar({ obrigatoria: true, efetuadaEm: '2026-01-01' }).ok).toBe(true));
  it('positivo — não obrigatória', () => expect(RN_306.avaliar({ obrigatoria: false, efetuadaEm: undefined }).ok).toBe(true));
  it('negativo — por publicitar', () => expect(RN_306.avaliar({ obrigatoria: true, efetuadaEm: undefined }).ok).toBe(false));
});
