import { describe, it, expect } from 'vitest';
import type { Contrato } from '../src/entidades/contrato.js';
import type { PerfilContratual } from '../src/entidades/estrutura.js';
import type { RegistoTempo } from '../src/entidades/registo-tempo.js';
import { alternativasParaPerfil, folgaInterna, escadaOpcoesPerfil } from '../src/calculos/opcoes.js';

const audit = { criadoEm: '2026-01-01T00:00:00.000Z', criadoPor: 'u', atualizadoEm: '2026-01-01T00:00:00.000Z', atualizadoPor: 'u' };

function contrato(id: string, numero: string, nipc: string, precoInicial = 100_000_00): Contrato {
  return {
    id, numero, objeto: 'Serviços', estado: 'EM_VIGOR',
    precoContratualInicial: precoInicial, precoContratualAtual: precoInicial,
    prestador: { nome: `Prestador ${nipc}`, nipc },
    dataAssinaturaCA: '2025-12-01', dataInicioVigencia: '2026-01-01', dataTerminoContratual: '2027-12-31',
    vistoTribunalContasNecessario: false, gestores: [{ utilizadorId: 'g1', principal: true }], excecoes: [],
    ...audit,
  } as Contrato;
}

function perfil(id: string, contratoId: string, nome: string, minutos: number, valorHora: number): PerfilContratual {
  return {
    id, contratoId, nome, quantidadePrevista: minutos,
    consomeBolsaValor: false, consomeTrabalhosComplementares: false, perfilDeGestao: false,
    precos: [{ valorHora, vigenteDe: '2026-01-01' }], ...audit,
  };
}

const HOJE = '2026-06-01';
const semRegistos: RegistoTempo[] = [];

describe('alternativas para um perfil', () => {
  const cA = contrato('c1', 'C-1', '500000001');
  const cMesma = contrato('c2', 'C-2', '500000001'); // mesma entidade
  const cOutra = contrato('c3', 'C-3', '999999999'); // entidade diferente
  const pRisco = perfil('p1', 'c1', 'Programador Sénior', 6000, 50_00);
  const pMesma = perfil('p2', 'c2', 'Programador Sénior', 12000, 45_00);
  const pOutra = perfil('p3', 'c3', 'Programador Sénior', 12000, 70_00); // mais caro
  const perfis = [pRisco, pMesma, pOutra];
  const contratos = [cA, cMesma, cOutra];

  it('distingue mesma entidade de entidade diferente e calcula o diferencial de rate', () => {
    const alts = alternativasParaPerfil(pRisco, cA, contratos, perfis, semRegistos, HOJE);
    expect(alts).toHaveLength(2);
    // Mesma entidade vem primeiro.
    expect(alts[0]!.contratoNumero).toBe('C-2');
    expect(alts[0]!.mesmaEntidade).toBe(true);
    expect(alts[0]!.diferencaValorHora).toBe(-5_00); // 45 € vs 50 € = mais barato
    expect(alts[1]!.mesmaEntidade).toBe(false);
    expect(alts[1]!.diferencaValorHora).toBe(20_00); // 70 € vs 50 € = mais caro
  });

  it('ignora contratos que não estão em vigor e perfis sem saldo', () => {
    const terminado = { ...cMesma, estado: 'TERMINADO' as const };
    expect(alternativasParaPerfil(pRisco, cA, [cA, terminado], [pRisco, pMesma], semRegistos, HOJE)).toHaveLength(0);
    const semSaldo = perfil('p9', 'c2', 'Programador Sénior', 0, 45_00);
    expect(alternativasParaPerfil(pRisco, cA, [cA, cMesma], [pRisco, semSaldo], semRegistos, HOJE)).toHaveLength(0);
  });

  it('folgaInterna devolve os outros perfis do mesmo contrato com saldo', () => {
    const outro = perfil('p4', 'c1', 'Analista', 3000, 40_00);
    const f = folgaInterna(pRisco, [pRisco, outro], semRegistos);
    expect(f).toHaveLength(1);
    expect(f[0]!.perfilNome).toBe('Analista');
  });
});

describe('escada de opções', () => {
  const cA = contrato('c1', 'C-1', '500000001');
  const pRisco = perfil('p1', 'c1', 'Programador Sénior', 6000, 50_00);

  it('ordena por atrito jurídico e termina sempre em novo procedimento', () => {
    const cMesma = contrato('c2', 'C-2', '500000001');
    const cOutra = contrato('c3', 'C-3', '999999999');
    const opcoes = escadaOpcoesPerfil({
      perfilEmRisco: pRisco, contrato: cA,
      contratos: [cA, cMesma, cOutra],
      perfis: [pRisco, perfil('p0', 'c1', 'Analista', 3000, 40_00), perfil('p2', 'c2', 'Programador Sénior', 12000, 45_00), perfil('p3', 'c3', 'Programador Sénior', 12000, 70_00)],
      alteracoes: [], aprovados: semRegistos, recursos: [], hoje: HOJE,
    });
    const titulos = opcoes.map((o) => o.titulo);
    expect(titulos[0]).toContain('Reafectar dentro do contrato');
    expect(titulos.some((t) => t.includes('C-2') && t.includes('mesma entidade'))).toBe(true);
    expect(titulos.some((t) => t.includes('C-3') && t.includes('entidade diferente'))).toBe(true);
    expect(titulos[titulos.length - 1]).toBe('Preparar novo procedimento');
    // A ordem é estritamente crescente.
    expect(opcoes.map((o) => o.ordem)).toEqual(opcoes.map((_, i) => i + 1));
  });

  it('a entidade diferente é CONDICIONADA, com fundamento e custo do diferencial', () => {
    const cOutra = contrato('c3', 'C-3', '999999999');
    const opcoes = escadaOpcoesPerfil({
      perfilEmRisco: pRisco, contrato: cA, contratos: [cA, cOutra],
      perfis: [pRisco, perfil('p3', 'c3', 'Programador Sénior', 6000, 70_00)],
      alteracoes: [], aprovados: semRegistos, recursos: [], hoje: HOJE,
    });
    const subcontrato = opcoes.find((o) => o.titulo.includes('C-3'))!;
    expect(subcontrato.viabilidade).toBe('CONDICIONADA');
    expect(subcontrato.fundamento).toContain('RN-702');
    expect(subcontrato.detalhe).toContain('subcontratação');
    // 20 €/h × 100 h = 2 000 €
    expect(subcontrato.impactoValor).toBe(2_000_00);
  });

  it('sem alternativas nem folga, o novo procedimento passa a VIAVEL', () => {
    const opcoes = escadaOpcoesPerfil({
      perfilEmRisco: pRisco, contrato: cA, contratos: [cA], perfis: [pRisco],
      alteracoes: [], aprovados: semRegistos, recursos: [], hoje: HOJE,
    });
    const ultimo = opcoes[opcoes.length - 1]!;
    expect(ultimo.titulo).toBe('Preparar novo procedimento');
    expect(ultimo.viabilidade).toBe('VIAVEL');
  });

  it('marca os complementares INVIÁVEL quando o teto de 50% está esgotado', () => {
    const opcoes = escadaOpcoesPerfil({
      perfilEmRisco: pRisco, contrato: cA, contratos: [cA], perfis: [pRisco],
      alteracoes: [{
        id: 'a1', contratoId: 'c1', tipo: 'SERVICOS_COMPLEMENTARES', dataEfeito: '2026-03-01',
        descricao: 'x', fundamentacao: 'y', valorAcrescido: 50_000_00,
        registadoEm: '2026-03-01T00:00:00.000Z', registadoPor: 'u', atualizadoEm: '2026-03-01T00:00:00.000Z', atualizadoPor: 'u',
      }],
      aprovados: semRegistos, recursos: [], hoje: HOJE,
    });
    const compl = opcoes.find((o) => o.titulo.includes('Reforçar'))!;
    expect(compl.viabilidade).toBe('INVIAVEL');
    expect(compl.fundamento).toContain('RN-301');
  });
});
