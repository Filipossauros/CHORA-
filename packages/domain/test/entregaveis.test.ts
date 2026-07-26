import { describe, it, expect } from 'vitest';
import { RN_111, RN_112 } from '../src/rules/contratos.js';
import { repartirChaveNaMao, valorDaPercentagem, percentagemDoValor } from '../src/calculos/financeira.js';
import { estadoEntregavel, type Entregavel } from '../src/entidades/entregavel.js';

function ent(over: Partial<Entregavel>): Entregavel {
  return {
    id: 'e1', contratoId: 'c1', ordem: 1, designacao: 'E1', valor: 30_000_00, percentagemContrato: 0.15,
    entregue: false, criadoEm: '2026-01-01T00:00:00.000Z', criadoPor: 'u1', atualizadoEm: '2026-01-01T00:00:00.000Z', atualizadoPor: 'u1',
    ...over,
  };
}

describe('RN-111 entregáveis obrigatórios no chave-na-mão', () => {
  it('não se aplica à bolsa de horas', () => expect(RN_111.avaliar({ tipologia: 'BOLSA_HORAS', numeroEntregaveis: 0, entregaveisSemValor: 0 }).ok).toBe(true));
  it('positivo — pelo menos um entregável, todos com valor', () => expect(RN_111.avaliar({ tipologia: 'CHAVE_NA_MAO', numeroEntregaveis: 3, entregaveisSemValor: 0 }).ok).toBe(true));
  it('negativo — sem entregáveis', () => expect(RN_111.avaliar({ tipologia: 'CHAVE_NA_MAO', numeroEntregaveis: 0, entregaveisSemValor: 0 }).ok).toBe(false));
  it('negativo — entregável sem valor', () => expect(RN_111.avaliar({ tipologia: 'CHAVE_NA_MAO', numeroEntregaveis: 3, entregaveisSemValor: 1 }).ok).toBe(false));
});

describe('RN-112 teto do preço contratual', () => {
  it('positivo — cabe no preço', () => expect(RN_112.avaliar({ precoContratualAtual: 200_000_00, totalEntregaveis: 150_000_00, bolsaHorasValor: 30_000_00 }).ok).toBe(true));
  it('positivo — reparte exatamente o preço', () => expect(RN_112.avaliar({ precoContratualAtual: 200_000_00, totalEntregaveis: 170_000_00, bolsaHorasValor: 30_000_00 }).ok).toBe(true));
  it('negativo — excede com a bolsa incluída', () => {
    const r = RN_112.avaliar({ precoContratualAtual: 200_000_00, totalEntregaveis: 190_000_00, bolsaHorasValor: 30_000_00 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.dados?.excesso).toBe(20_000_00);
  });
});

describe('estadoEntregavel', () => {
  it('previsto enquanto não entregue', () => expect(estadoEntregavel(ent({}))).toBe('PREVISTO'));
  it('entregue depois de assinalada a entrega', () => expect(estadoEntregavel(ent({ entregue: true, entregueEm: '2026-03-01' }))).toBe('ENTREGUE'));
  it('faturado assim que ligado a uma fatura', () => expect(estadoEntregavel(ent({ entregue: true, faturaId: 'f1' }))).toBe('FATURADO'));
});

describe('repartirChaveNaMao', () => {
  const entregaveis = [
    ent({ id: 'e1', valor: 30_000_00, entregue: true, faturaId: 'f1' }),
    ent({ id: 'e2', valor: 60_000_00, entregue: true }),
    ent({ id: 'e3', valor: 50_000_00 }),
  ];
  const r = repartirChaveNaMao(200_000_00, entregaveis, 30_000_00);

  it('soma o valor dos entregáveis', () => expect(r.totalEntregaveis).toBe(140_000_00));
  it('conta como por atribuir o que sobra do preço', () => expect(r.porAtribuir).toBe(30_000_00));
  it('separa entregues de faturados', () => { expect(r.entregues).toBe(90_000_00); expect(r.faturados).toBe(30_000_00); });
  it('faturável agora é o entregue por faturar', () => expect(r.faturavelAgora).toBe(60_000_00));
  it('não devolve por atribuir negativo quando a repartição excede o preço', () => {
    expect(repartirChaveNaMao(100_000_00, entregaveis, 30_000_00).porAtribuir).toBe(0);
  });
});

describe('conversão valor ⇄ percentagem', () => {
  it('percentagem para valor', () => expect(valorDaPercentagem(200_000_00, 0.15)).toBe(30_000_00));
  it('valor para percentagem', () => expect(percentagemDoValor(200_000_00, 30_000_00)).toBe(0.15));
  it('preço nulo não gera divisão por zero', () => expect(percentagemDoValor(0, 30_000_00)).toBe(0));
});
