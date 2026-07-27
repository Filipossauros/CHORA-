import { describe, it, expect } from 'vitest';
import type { Dotacao, PerfilContratual, Alteracao } from '../src/entidades/estrutura.js';
import type { Contrato } from '../src/entidades/contrato.js';
import { totalDotacoes, totalPrevistoPerfis } from '../src/calculos/financeira.js';
import { anoFinalPortaria, portariaExigeReprogramacao, reprogramarPortaria, vigenciaLiquidaMeses } from '../src/calculos/prazos.js';
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

  it('vigenciaLiquidaMeses desconta as suspensões que suspendem a execução', () => {
    const susp: Alteracao[] = [{
      id: 's1', contratoId: 'c1', tipo: 'SUSPENSAO', dataEfeito: '2026-01-01', descricao: 'x', fundamentacao: 'y',
      suspensao: { dataInicio: '2026-01-01', dataFim: '2026-04-01', suspendePrazoExecucao: true }, // ~90 dias
      registadoEm: '2026-01-01T00:00:00.000Z', registadoPor: 'u', atualizadoEm: '2026-01-01T00:00:00.000Z', atualizadoPor: 'u',
    }];
    // 36 meses de calendário; com ~3 meses suspensos, a vigência líquida ronda 33.
    expect(vigenciaLiquidaMeses('2025-01-01', '2028-01-01', [])).toBeCloseTo(36, 1);
    expect(vigenciaLiquidaMeses('2025-01-01', '2028-01-01', susp)).toBeCloseTo(33, 0);
    // Uma suspensão que NÃO suspende a execução não desconta.
    const semEfeito: Alteracao[] = [{ ...susp[0]!, suspensao: { dataInicio: '2026-01-01', dataFim: '2026-04-01', suspendePrazoExecucao: false } }];
    expect(vigenciaLiquidaMeses('2025-01-01', '2028-01-01', semEfeito)).toBeCloseTo(36, 1);
  });

  it('anoFinalPortaria e portariaExigeReprogramacao', () => {
    const semPortaria = { dataTerminoContratual: '2027-06-30' } as Contrato;
    expect(anoFinalPortaria(semPortaria)).toBeUndefined();
    expect(portariaExigeReprogramacao(semPortaria)).toBe(false);

    const comPortaria = {
      dataTerminoContratual: '2027-06-30',
      portariaExtensaoEncargos: { numero: 'P-1', data: '2025-01-01', reparticaoAnual: [{ ano: 2025, montante: 100 }, { ano: 2026, montante: 100 }] },
    } as Contrato;
    expect(anoFinalPortaria(comPortaria)).toBe(2026);
    expect(portariaExigeReprogramacao(comPortaria)).toBe(true); // término em 2027 > 2026

    const coberto = {
      dataTerminoContratual: '2026-12-31',
      portariaExtensaoEncargos: { numero: 'P-2', data: '2025-01-01', reparticaoAnual: [{ ano: 2025, montante: 100 }, { ano: 2026, montante: 100 }] },
    } as Contrato;
    expect(portariaExigeReprogramacao(coberto)).toBe(false); // término em 2026 = ano final
  });
});

describe('reprogramarPortaria', () => {
  const portaria = {
    numero: 'P-2026/103', data: '2025-12-20',
    reparticaoAnual: [{ ano: 2026, montante: 30_000_00 }, { ano: 2027, montante: 120_000_00 }],
  };

  it('reparte o acréscimo na proporção do que já está repartido', () => {
    const nova = reprogramarPortaria(portaria, 30_000_00, 2026, 2027);
    // 30 000 : 120 000 = 20% : 80% → 6 000 e 24 000.
    expect(nova.reparticaoAnual).toEqual([
      { ano: 2026, montante: 36_000_00 },
      { ano: 2027, montante: 144_000_00 },
    ]);
  });

  it('acrescenta anos ainda não cobertos pela portaria', () => {
    const nova = reprogramarPortaria(portaria, 40_000_00, 2027, 2028);
    // 2028 não estava coberto: entra na repartição.
    expect(nova.reparticaoAnual.map((r) => r.ano)).toEqual([2026, 2027, 2028]);
    expect(nova.reparticaoAnual.find((r) => r.ano === 2026)!.montante).toBe(30_000_00);
    // Base do período = só 2027 (120 000); 2028 tinha 0, pelo que absorve o resto.
    const total = nova.reparticaoAnual.reduce((s, r) => s + r.montante, 0);
    expect(total).toBe(150_000_00 + 40_000_00);
  });

  it('reparte por igual quando nenhum dos anos tinha cobertura', () => {
    const nova = reprogramarPortaria(portaria, 30_000_00, 2028, 2030);
    expect(nova.reparticaoAnual.filter((r) => r.ano >= 2028).map((r) => r.montante)).toEqual([10_000_00, 10_000_00, 10_000_00]);
  });

  it('fecha ao cêntimo, absorvendo o arredondamento no último ano', () => {
    const nova = reprogramarPortaria(portaria, 10_000_01, 2026, 2027);
    const acrescimo = nova.reparticaoAnual.reduce((s, r) => s + r.montante, 0) - 150_000_00;
    expect(acrescimo).toBe(10_000_01);
  });

  it('não mexe na repartição quando o acréscimo é zero', () => {
    expect(reprogramarPortaria(portaria, 0, 2026, 2027)).toEqual(portaria);
  });
});
