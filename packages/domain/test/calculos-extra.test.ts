import { describe, it, expect } from 'vitest';
import type { Dotacao, PerfilContratual, Alteracao } from '../src/entidades/estrutura.js';
import type { Contrato } from '../src/entidades/contrato.js';
import { totalDotacoes, totalPrevistoPerfis, montanteLiquidoFatura } from '../src/calculos/financeira.js';
import {
  periodosSuspensao,
  suspensoesSobrepoem,
  vigenciaEmMeses,
  mesesAteTermino,
  diasSuspensaoExecucao,
} from '../src/calculos/prazos.js';

const audit = {
  criadoEm: '2026-01-01T00:00:00.000Z', criadoPor: 'u1',
  atualizadoEm: '2026-01-01T00:00:00.000Z', atualizadoPor: 'u1',
};

describe('financeira — somatórios', () => {
  it('totalDotacoes soma o valor de todas as dotações', () => {
    const dotacoes: Dotacao[] = [
      { id: 'd1', contratoId: 'c1', tipo: 'HORAS_BASE', valor: 1000, ...audit },
      { id: 'd2', contratoId: 'c1', tipo: 'BOLSA_VALOR', valor: 500, ...audit },
    ];
    expect(totalDotacoes(dotacoes)).toBe(1500);
    expect(totalDotacoes([])).toBe(0);
  });

  it('totalPrevistoPerfis soma o valor previsto de cada perfil', () => {
    const perfis: PerfilContratual[] = [
      {
        id: 'p1', contratoId: 'c1', nome: 'A', quantidadePrevista: 6000,
        consomeBolsaValor: false, consomeTrabalhosComplementares: false, perfilDeGestao: false,
        precos: [{ valorHora: 6000, vigenteDe: '2026-01-01' }], ...audit,
      },
    ];
    expect(totalPrevistoPerfis(perfis)).toBe(Math.round((6000 * 6000) / 60));
  });

  it('montanteLiquidoFatura desconta deduções e trata ausência', () => {
    expect(montanteLiquidoFatura({ montanteAprovado: 1000, deducoes: [{ motivo: 'm', montante: 200 }] } as never)).toBe(800);
    expect(montanteLiquidoFatura({} as never)).toBe(0);
  });
});

describe('prazos — utilitários', () => {
  const contrato = { dataInicioVigencia: '2024-01-01', dataTerminoContratual: '2026-01-01' } as Contrato;

  it('vigenciaEmMeses e mesesAteTermino', () => {
    expect(vigenciaEmMeses(contrato)).toBeCloseTo(24, 5);
    expect(mesesAteTermino(contrato, '2025-01-01')).toBeCloseTo(12, 5);
  });

  it('periodosSuspensao extrai apenas alterações de suspensão', () => {
    const alteracoes: Alteracao[] = [
      {
        id: 'a1', contratoId: 'c1', tipo: 'SUSPENSAO', dataEfeito: '2025-01-01', descricao: 'x', fundamentacao: 'y',
        suspensao: { dataInicio: '2025-01-01', dataFim: '2025-02-01', suspendePrazoExecucao: true },
        registadoEm: '2025-01-01T00:00:00.000Z', registadoPor: 'u1', atualizadoEm: '2025-01-01T00:00:00.000Z', atualizadoPor: 'u1',
      },
      {
        id: 'a2', contratoId: 'c1', tipo: 'PRORROGACAO', dataEfeito: '2025-06-01', descricao: 'x', fundamentacao: 'y',
        registadoEm: '2025-06-01T00:00:00.000Z', registadoPor: 'u1', atualizadoEm: '2025-06-01T00:00:00.000Z', atualizadoPor: 'u1',
      },
    ];
    const ps = periodosSuspensao(alteracoes);
    expect(ps).toHaveLength(1);
    expect(diasSuspensaoExecucao(alteracoes, '2025-12-31')).toBeGreaterThan(0);
  });

  it('suspensoesSobrepoem trata períodos abertos', () => {
    expect(suspensoesSobrepoem(
      { dataInicio: '2026-01-01', dataFim: undefined, suspendePrazoExecucao: false },
      { dataInicio: '2026-06-01', dataFim: undefined, suspendePrazoExecucao: false },
    )).toBe(true);
    expect(suspensoesSobrepoem(
      { dataInicio: '2026-01-01', dataFim: '2026-01-31', suspendePrazoExecucao: false },
      { dataInicio: '2026-06-01', dataFim: '2026-06-30', suspendePrazoExecucao: false },
    )).toBe(false);
  });
});
