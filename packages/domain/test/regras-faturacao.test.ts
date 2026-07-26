import { describe, it, expect } from 'vitest';
import {
  RN_601, RN_602, RN_602_A, RN_603, RN_604, RN_605, RN_606, RN_607, RN_608, RN_609,
  type LinhaConferencia,
} from '../src/rules/faturacao.js';

describe('RN-601 fatura com compromisso e saldo', () => {
  it('positivo', () => expect(RN_601.avaliar({ temCompromisso: true, saldoCompromisso: 1000, montanteFatura: 800 }).ok).toBe(true));
  it('negativo — sem compromisso', () => expect(RN_601.avaliar({ temCompromisso: false, saldoCompromisso: 1000, montanteFatura: 800 }).ok).toBe(false));
  it('negativo — saldo insuficiente', () => expect(RN_601.avaliar({ temCompromisso: true, saldoCompromisso: 500, montanteFatura: 800 }).ok).toBe(false));
});

describe('RN-602 documentos obrigatórios em PDF', () => {
  it('positivo', () => expect(RN_602.avaliar({ tiposDocumentosPresentes: ['FATURA', 'RELATORIO_HORAS_FORNECEDOR'] }).ok).toBe(true));
  it('negativo — sem relatório de horas', () => expect(RN_602.avaliar({ tiposDocumentosPresentes: ['FATURA'] }).ok).toBe(false));
  it('negativo — sem fatura', () => expect(RN_602.avaliar({ tiposDocumentosPresentes: ['RELATORIO_HORAS_FORNECEDOR'] }).ok).toBe(false));
});

describe('RN-602-A hash imutável após decisão', () => {
  it('positivo — em conferência pode mudar', () => expect(RN_602_A.avaliar({ estadoFatura: 'EM_CONFERENCIA', hashAntes: 'a', hashDepois: 'b' }).ok).toBe(true));
  it('positivo — validada, hash igual', () => expect(RN_602_A.avaliar({ estadoFatura: 'VALIDADA', hashAntes: 'a', hashDepois: 'a' }).ok).toBe(true));
  it('negativo — validada, hash diferente', () => expect(RN_602_A.avaliar({ estadoFatura: 'VALIDADA', hashAntes: 'a', hashDepois: 'b' }).ok).toBe(false));
});

describe('RN-603 conferência determinística', () => {
  const conforme: LinhaConferencia[] = [
    { perfilId: 'p1', recursoId: 'r1', quantidadeFatura: 600, valorFatura: 5000, quantidadeAprovada: 600, valorAprovado: 5000 },
  ];
  const divergente: LinhaConferencia[] = [
    { perfilId: 'p1', recursoId: 'r1', quantidadeFatura: 700, valorFatura: 5000, quantidadeAprovada: 600, valorAprovado: 5000 },
  ];
  it('positivo — sem divergências', () => expect(RN_603.avaliar({ linhas: conforme }).ok).toBe(true));
  it('negativo — divergência de quantidade', () => {
    const r = RN_603.avaliar({ linhas: divergente });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.dados?.divergencias).toBeDefined();
  });
});

describe('RN-604 relatório de evidência obrigatório', () => {
  it('positivo', () => expect(RN_604.avaliar({ temRelatorioEvidencia: true }).ok).toBe(true));
  it('negativo', () => expect(RN_604.avaliar({ temRelatorioEvidencia: false }).ok).toBe(false));
});

describe('RN-605 prazo de pagamento (aviso)', () => {
  it('consultiva', () => expect(RN_605.bloqueia).toBe(false));
  it('positivo — dentro do prazo', () => expect(RN_605.avaliar({ dataLimitePagamento: '2026-08-01', hoje: '2026-07-21' }).ok).toBe(true));
  it('negativo — prazo ultrapassado', () => expect(RN_605.avaliar({ dataLimitePagamento: '2026-07-01', hoje: '2026-07-21' }).ok).toBe(false));
});

describe('RN-606 deduções refletidas no líquido', () => {
  it('positivo', () => expect(RN_606.avaliar({ montanteAprovado: 1000, deducoes: 200, montanteLiquido: 800 }).ok).toBe(true));
  it('negativo', () => expect(RN_606.avaliar({ montanteAprovado: 1000, deducoes: 200, montanteLiquido: 900 }).ok).toBe(false));
});

describe('RN-607 total faturado ≤ preço atual', () => {
  it('positivo', () => expect(RN_607.avaliar({ totalFaturado: 3000, novoMontante: 1000, precoContratualAtual: 5000 }).ok).toBe(true));
  it('negativo', () => expect(RN_607.avaliar({ totalFaturado: 4500, novoMontante: 1000, precoContratualAtual: 5000 }).ok).toBe(false));
});

describe('RN-602 documentos por tipo de faturação', () => {
  it('positivo — entregável com auto de entrega', () => expect(RN_602.avaliar({ tiposDocumentosPresentes: ['FATURA', 'AUTO_ENTREGA'], tipoFaturacao: 'ENTREGAVEL' }).ok).toBe(true));
  it('negativo — entregável com relatório de horas em vez do auto', () => expect(RN_602.avaliar({ tiposDocumentosPresentes: ['FATURA', 'RELATORIO_HORAS_FORNECEDOR'], tipoFaturacao: 'ENTREGAVEL' }).ok).toBe(false));
  it('negativo — bolsa de horas com auto de entrega em vez do relatório', () => expect(RN_602.avaliar({ tiposDocumentosPresentes: ['FATURA', 'AUTO_ENTREGA'], tipoFaturacao: 'BOLSA_HORAS' }).ok).toBe(false));
});

describe('RN-608 faturação de entregável exige entrega', () => {
  it('não se aplica a faturação de bolsa de horas', () => expect(RN_608.avaliar({ tipoFaturacao: 'BOLSA_HORAS', entregavelIdentificado: false, entregue: false }).ok).toBe(true));
  it('positivo — identificado e entregue', () => expect(RN_608.avaliar({ tipoFaturacao: 'ENTREGAVEL', entregavelIdentificado: true, entregue: true }).ok).toBe(true));
  it('negativo — entregável não identificado', () => expect(RN_608.avaliar({ tipoFaturacao: 'ENTREGAVEL', entregavelIdentificado: false, entregue: true }).ok).toBe(false));
  it('negativo — ainda não entregue', () => expect(RN_608.avaliar({ tipoFaturacao: 'ENTREGAVEL', entregavelIdentificado: true, entregue: false }).ok).toBe(false));
});

describe('RN-609 montante da fatura igual ao valor do entregável', () => {
  it('não se aplica a faturação de bolsa de horas', () => expect(RN_609.avaliar({ tipoFaturacao: 'BOLSA_HORAS', montanteFatura: 100, valorEntregavel: 999 }).ok).toBe(true));
  it('positivo — montante exato', () => expect(RN_609.avaliar({ tipoFaturacao: 'ENTREGAVEL', montanteFatura: 30_000_00, valorEntregavel: 30_000_00 }).ok).toBe(true));
  it('negativo — faturação parcial não é admitida', () => {
    const r = RN_609.avaliar({ tipoFaturacao: 'ENTREGAVEL', montanteFatura: 15_000_00, valorEntregavel: 30_000_00 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.dados?.diferenca).toBe(-15_000_00);
  });
  it('negativo — montante superior ao entregável', () => expect(RN_609.avaliar({ tipoFaturacao: 'ENTREGAVEL', montanteFatura: 31_000_00, valorEntregavel: 30_000_00 }).ok).toBe(false));
});
