import { describe, it, expect } from 'vitest';
import {
  proporOrcamento, recalcularLinha, resumirOrcamento, competenciaCA, totalLinha, variarMinutos,
  type LinhaOrcamento,
} from '../src/calculos/orcamento.js';
import { RN_115, LIMITE_ANUAL_PORTARIA_CA } from '../src/rules/contratos.js';
import type { Contrato } from '../src/entidades/contrato.js';
import type { PerfilContratual } from '../src/entidades/estrutura.js';

const audit = { criadoEm: '2026-01-01T00:00:00.000Z', criadoPor: 'u', atualizadoEm: '2026-01-01T00:00:00.000Z', atualizadoPor: 'u' };

function contrato(over: Partial<Contrato> & Pick<Contrato, 'id' | 'numero'>): Contrato {
  return {
    objeto: 'Prestação de serviços', estado: 'EM_VIGOR', tipologia: 'BOLSA_HORAS',
    precoContratualInicial: 100_000_00, precoContratualAtual: 100_000_00,
    prestador: { nome: 'Alfa', nipc: '500000001' },
    dataAssinaturaCA: '2026-01-01', dataInicioVigencia: '2026-01-01',
    dataTerminoContratual: '2027-12-31', dataTerminoOriginal: '2027-12-31',
    vistoTribunalContasNecessario: false, gestores: [], excecoes: [], ...audit, ...over,
  } as Contrato;
}

function perfil(over: Partial<PerfilContratual> & Pick<PerfilContratual, 'id' | 'contratoId' | 'nome'>): PerfilContratual {
  return {
    quantidadePrevista: 120_000, consomeBolsaValor: false, consomeTrabalhosComplementares: false,
    perfilDeGestao: false, precos: [{ valorHora: 50_00, vigenteDe: '2026-01-01' }], ...audit, ...over,
  } as PerfilContratual;
}

const semProjetos = (): string[] => [];

describe('RN-115 competência do CA para extensão de encargos', () => {
  it('o ano em curso não conta: tem cabimento próprio', () => {
    const r = RN_115.avaliar({ anoBase: 2027, reparticaoAnual: [{ ano: 2027, montante: 900_000_00 }] });
    expect(r.ok).toBe(true);
  });
  it('um ano futuro dentro do limite passa', () => {
    const r = RN_115.avaliar({ anoBase: 2027, reparticaoAnual: [{ ano: 2028, montante: LIMITE_ANUAL_PORTARIA_CA }] });
    expect(r.ok).toBe(true);
  });
  it('o limite é ANUAL, não sobre o total dos anos futuros', () => {
    // 3 × 400 000 € = 1 200 000 € no conjunto, mas nenhum ano isolado excede.
    const r = RN_115.avaliar({ anoBase: 2027, reparticaoAnual: [
      { ano: 2028, montante: 400_000_00 }, { ano: 2029, montante: 400_000_00 }, { ano: 2030, montante: 400_000_00 },
    ] });
    expect(r.ok).toBe(true);
  });
  it('basta um ano futuro acima do limite', () => {
    const r = RN_115.avaliar({ anoBase: 2027, reparticaoAnual: [
      { ano: 2028, montante: 100_000_00 }, { ano: 2029, montante: 640_000_00 },
    ] });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      const anos = r.dados?.anosAcimaDoLimite as Array<{ ano: number; excesso: number }>;
      expect(anos).toHaveLength(1);
      expect(anos[0]?.ano).toBe(2029);
      expect(anos[0]?.excesso).toBe(140_000_00);
    }
  });
});

describe('proposta de orçamento a partir da carteira', () => {
  const hoje = '2026-09-30';
  it('contrato que atravessa o ano é continuidade', () => {
    const c = contrato({ id: 'c1', numero: 'C-1', dataTerminoContratual: '2027-12-31' });
    const [l] = proporOrcamento(2027, [c], [], [], [], semProjetos, hoje);
    expect(l?.origem).toBe('CONTINUIDADE');
  });
  it('contrato que termina durante o ano exige substituição', () => {
    const c = contrato({ id: 'c1', numero: 'C-1', dataTerminoContratual: '2027-06-30' });
    const [l] = proporOrcamento(2027, [c], [], [], [], semProjetos, hoje);
    expect(l?.origem).toBe('SUBSTITUICAO');
    expect(l?.motivo).toContain('novo procedimento');
  });
  it('licenciamento é sempre renovação, e o valor é o do contrato', () => {
    const c = contrato({ id: 'c1', numero: 'C-1', tipologia: 'LICENCIAMENTO', precoContratualAtual: 48_000_00, vigenciaLicenciamento: { de: '2026-01-01', ate: '2027-01-01' } });
    const [l] = proporOrcamento(2027, [c], [], [], [], semProjetos, hoje);
    expect(l?.origem).toBe('RENOVACAO');
    expect(l?.licencas?.valorUnitario).toBe(48_000_00);
    expect(totalLinha(l!)).toBe(48_000_00);
  });
  it('contrato já terminado antes do ano não entra', () => {
    const c = contrato({ id: 'c1', numero: 'C-1', dataTerminoContratual: '2026-11-30' });
    expect(proporOrcamento(2027, [c], [], [], [], semProjetos, hoje)).toHaveLength(0);
  });
  it('a referência do perfil é o consumo real; sem consumo, o previsto', () => {
    const c = contrato({ id: 'c1', numero: 'C-1' });
    const p = perfil({ id: 'p1', contratoId: 'c1', nome: 'Arquiteto', quantidadePrevista: 120_000 });
    const [l] = proporOrcamento(2027, [c], [p], [], [], semProjetos, hoje);
    expect(l?.perfis[0]?.minutosReferencia).toBe(120_000);
    // 2 000 h × 50 € = 100 000 €
    expect(l?.perfis[0]?.valor).toBe(100_000_00);
  });
  it('a portaria em vigor entra como cobertura, não como encargo', () => {
    const c = contrato({ id: 'c1', numero: 'C-1', portariaExtensaoEncargos: {
      numero: 'P-1', data: '2026-02-01', reparticaoAnual: [{ ano: 2026, montante: 40_000_00 }, { ano: 2027, montante: 60_000_00 }],
    } });
    const [l] = proporOrcamento(2027, [c], [], [], [], semProjetos, hoje);
    // Só os anos ≥ ao orçamentado interessam: 2026 já passou.
    expect(l?.cobertoPorPortaria).toEqual([{ ano: 2027, montante: 60_000_00 }]);
  });
});

describe('recálculo e agregação', () => {
  const base: LinhaOrcamento = {
    id: 'l1', projetoId: 'P1', origem: 'CONTINUIDADE', tipologia: 'BOLSA_HORAS',
    designacao: 'Serviços', motivo: '—', variacao: 'MANUTENCAO',
    perfis: [{ nome: 'Arquiteto', minutosReferencia: 120_000, minutosPropostos: 120_000, valorHora: 50_00, valor: 0 }],
    entregaveis: [], reparticaoAnual: [], cobertoPorPortaria: [],
  };

  it('variar minutos arredonda à hora', () => {
    expect(variarMinutos(120_000, 50)).toBe(180_000);
    expect(variarMinutos(120_000, -20)).toBe(96_000);
    expect(variarMinutos(101, 0) % 60).toBe(0);
  });

  it('recalcular reflete a variação no valor e na repartição', () => {
    const l = recalcularLinha({ ...base, perfis: [{ ...base.perfis[0]!, minutosPropostos: variarMinutos(120_000, 50) }] }, 2027);
    expect(l.perfis[0]?.valor).toBe(150_000_00);
    expect(l.reparticaoAnual).toEqual([{ ano: 2027, montante: 150_000_00 }]);
  });

  it('entregáveis levam o encargo para o ano que lhes foi atribuído', () => {
    const l = recalcularLinha({
      ...base, tipologia: 'CHAVE_NA_MAO', perfis: [],
      entregaveis: [{ designacao: 'Desenho', valor: 60_000_00, ano: 2027 }, { designacao: 'Desenvolvimento', valor: 280_000_00, ano: 2028 }],
    }, 2027);
    expect(l.reparticaoAnual).toEqual([{ ano: 2027, montante: 60_000_00 }, { ano: 2028, montante: 280_000_00 }]);
  });

  it('o resumo separa o encargo do que falta autorizar', () => {
    const l = recalcularLinha({ ...base, cobertoPorPortaria: [{ ano: 2027, montante: 60_000_00 }] }, 2027);
    const r = resumirOrcamento(2027, [l]);
    expect(r.total).toBe(100_000_00);
    expect(r.cobertura[0]).toMatchObject({ ano: 2027, encargo: 100_000_00, coberto: 60_000_00, aCobrir: 40_000_00 });
    expect(r.totalACobrir).toBe(40_000_00);
  });

  it('a competência do CA afere-se sobre o que falta autorizar nos anos futuros', () => {
    const l = recalcularLinha({
      ...base, perfis: [], tipologia: 'CHAVE_NA_MAO',
      entregaveis: [{ designacao: 'Fase 2', valor: 640_000_00, ano: 2028 }],
      cobertoPorPortaria: [{ ano: 2028, montante: 200_000_00 }],
    }, 2027);
    const r = resumirOrcamento(2027, [l]);
    // 640 000 − 200 000 = 440 000 € por autorizar: dentro da competência.
    expect(r.anosAcimaDaCompetenciaCA).toEqual([]);
    expect(competenciaCA(2027, r.cobertura).ok).toBe(true);
  });

  it('sinaliza o ano futuro acima do limite', () => {
    const l = recalcularLinha({
      ...base, perfis: [], tipologia: 'CHAVE_NA_MAO',
      entregaveis: [{ designacao: 'Fase 2', valor: 640_000_00, ano: 2028 }],
    }, 2027);
    const r = resumirOrcamento(2027, [l]);
    expect(r.anosAcimaDaCompetenciaCA).toEqual([2028]);
    expect(competenciaCA(2027, r.cobertura).ok).toBe(false);
  });

  it('agrega por projeto, separando o ano orçamentado do plurianual', () => {
    const a = recalcularLinha({ ...base, id: 'a', projetoId: 'P1' }, 2027);
    const b = recalcularLinha({ ...base, id: 'b', projetoId: 'P2', perfis: [], tipologia: 'CHAVE_NA_MAO', entregaveis: [{ designacao: 'X', valor: 300_000_00, ano: 2028 }] }, 2027);
    const r = resumirOrcamento(2027, [a, b]);
    expect(r.projetos.map((p) => p.projetoId)).toEqual(['P1', 'P2']);
    expect(r.projetos[0]?.totalAnoOrcamentado).toBe(100_000_00);
    expect(r.projetos[0]?.totalPlurianual).toBe(0);
    expect(r.projetos[1]?.totalAnoOrcamentado).toBe(0);
    expect(r.projetos[1]?.totalPlurianual).toBe(300_000_00);
  });
});
