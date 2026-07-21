import { describe, it, expect } from 'vitest';
import {
  RN_101, RN_102, RN_103, RN_104, RN_105, RN_106, RN_107, RN_108, RN_109, RN_110,
} from '../src/rules/contratos.js';
import type { GestorContrato } from '../src/entidades/contrato.js';

function gestor(over: Partial<GestorContrato>): GestorContrato {
  return { utilizadorId: 'g1', principal: true, designadoEm: '2025-12-01', ...over };
}

describe('RN-101 número único e obrigatório', () => {
  it('positivo', () => expect(RN_101.avaliar({ numero: 'C-1', numerosExistentes: [] }).ok).toBe(true));
  it('negativo — vazio', () => expect(RN_101.avaliar({ numero: '  ', numerosExistentes: [] }).ok).toBe(false));
  it('negativo — duplicado', () => expect(RN_101.avaliar({ numero: 'C-1', numerosExistentes: ['C-1'] }).ok).toBe(false));
});

describe('RN-102 um lote / um contrato', () => {
  it('positivo', () => expect(RN_102.avaliar({ loteId: 'L1', contratosNoLote: [] }).ok).toBe(true));
  it('negativo — lote ocupado', () => expect(RN_102.avaliar({ loteId: 'L1', contratosNoLote: ['C9'] }).ok).toBe(false));
  it('negativo — sem lote', () => expect(RN_102.avaliar({ loteId: '', contratosNoLote: [] }).ok).toBe(false));
});

describe('RN-103 N:N sem duplicados', () => {
  it('positivo', () => expect(RN_103.avaliar({ projetoIds: ['a', 'b'] }).ok).toBe(true));
  it('negativo', () => expect(RN_103.avaliar({ projetoIds: ['a', 'a'] }).ok).toBe(false));
});

describe('RN-104 preço inicial imutável após vigência', () => {
  it('positivo — em preparação pode mudar', () =>
    expect(RN_104.avaliar({ estado: 'EM_PREPARACAO', precoInicialAntes: 1, precoInicialDepois: 2 }).ok).toBe(true));
  it('positivo — em vigor sem mudança', () =>
    expect(RN_104.avaliar({ estado: 'EM_VIGOR', precoInicialAntes: 1, precoInicialDepois: 1 }).ok).toBe(true));
  it('negativo — em vigor com mudança', () =>
    expect(RN_104.avaliar({ estado: 'EM_VIGOR', precoInicialAntes: 1, precoInicialDepois: 2 }).ok).toBe(false));
});

describe('RN-105 dotações + perfis ≤ preço atual', () => {
  it('positivo', () => expect(RN_105.avaliar({ precoContratualAtual: 100, totalDotacoes: 40, totalPrevistoPerfis: 60 }).ok).toBe(true));
  it('negativo', () => expect(RN_105.avaliar({ precoContratualAtual: 100, totalDotacoes: 40, totalPrevistoPerfis: 61 }).ok).toBe(false));
});

describe('RN-106 pelo menos uma dotação HORAS_BASE', () => {
  it('positivo', () => expect(RN_106.avaliar({ dotacoes: [{ tipo: 'HORAS_BASE' }] }).ok).toBe(true));
  it('negativo', () => expect(RN_106.avaliar({ dotacoes: [{ tipo: 'BOLSA_VALOR' }] }).ok).toBe(false));
});

describe('RN-107 gestor designado antes da vigência', () => {
  it('positivo', () =>
    expect(RN_107.avaliar({ gestores: [gestor({ designadoEm: '2025-12-01' })], dataInicioVigencia: '2026-01-01' }).ok).toBe(true));
  it('negativo — sem gestores', () =>
    expect(RN_107.avaliar({ gestores: [], dataInicioVigencia: '2026-01-01' }).ok).toBe(false));
  it('negativo — todos designados tarde', () =>
    expect(RN_107.avaliar({ gestores: [gestor({ designadoEm: '2026-02-01' })], dataInicioVigencia: '2026-01-01' }).ok).toBe(false));
});

describe('RN-108 delimitação de funções com múltiplos gestores', () => {
  it('positivo — um só gestor', () =>
    expect(RN_108.avaliar({ gestores: [gestor({})] }).ok).toBe(true));
  it('positivo — dois com funções', () =>
    expect(RN_108.avaliar({ gestores: [gestor({ utilizadorId: 'a', funcoes: 'físico' }), gestor({ utilizadorId: 'b', funcoes: 'financeiro' })] }).ok).toBe(true));
  it('negativo — dois sem funções', () =>
    expect(RN_108.avaliar({ gestores: [gestor({ utilizadorId: 'a' }), gestor({ utilizadorId: 'b' })] }).ok).toBe(false));
});

describe('RN-109 declaração de conflito (aviso)', () => {
  it('é regra consultiva', () => expect(RN_109.bloqueia).toBe(false));
  it('positivo', () =>
    expect(RN_109.avaliar({ gestores: [gestor({ declaracaoConflitoInteressesEm: '2025-12-01' })] }).ok).toBe(true));
  it('negativo (gera aviso)', () =>
    expect(RN_109.avaliar({ gestores: [gestor({})] }).ok).toBe(false));
});

describe('RN-110 alteração com fundamentação e data', () => {
  it('positivo', () => expect(RN_110.avaliar({ fundamentacao: 'x', dataEfeito: '2026-01-01' }).ok).toBe(true));
  it('negativo — sem fundamentação', () => expect(RN_110.avaliar({ fundamentacao: ' ', dataEfeito: '2026-01-01' }).ok).toBe(false));
  it('negativo — sem data', () => expect(RN_110.avaliar({ fundamentacao: 'x', dataEfeito: '' }).ok).toBe(false));
});
