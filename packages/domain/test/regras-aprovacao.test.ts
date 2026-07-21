import { describe, it, expect } from 'vitest';
import {
  RN_501, RN_502, RN_503, RN_504, RN_505, RN_506, RN_507, RN_508, RN_509,
} from '../src/rules/aprovacao.js';

describe('RN-501 competência de aprovação', () => {
  it('positivo — gestor de contrato', () => expect(RN_501.avaliar({ papel: 'GESTOR_CONTRATO' }).ok).toBe(true));
  it('positivo — gestor técnico', () => expect(RN_501.avaliar({ papel: 'GESTOR_TECNICO' }).ok).toBe(true));
  it('negativo — elemento', () => expect(RN_501.avaliar({ papel: 'ELEMENTO_EQUIPA_TECNICA' }).ok).toBe(false));
});

describe('RN-502 não aprova os próprios', () => {
  it('positivo', () => expect(RN_502.avaliar({ aprovadorId: 'g1', recursoIdRegisto: 'r1' }).ok).toBe(true));
  it('negativo', () => expect(RN_502.avaliar({ aprovadorId: 'g1', recursoIdRegisto: 'g1' }).ok).toBe(false));
});

describe('RN-503 não exceder horas do perfil', () => {
  it('positivo', () => expect(RN_503.avaliar({ minutosDisponiveis: 600, minutosAAprovar: 300 }).ok).toBe(true));
  it('negativo', () => expect(RN_503.avaliar({ minutosDisponiveis: 600, minutosAAprovar: 700 }).ok).toBe(false));
});

describe('RN-504 não exceder valor do perfil/contrato', () => {
  it('positivo', () => expect(RN_504.avaliar({ valorDisponivelPerfil: 1000, valorDisponivelContrato: 5000, valorAAprovar: 800 }).ok).toBe(true));
  it('negativo — perfil', () => expect(RN_504.avaliar({ valorDisponivelPerfil: 500, valorDisponivelContrato: 5000, valorAAprovar: 800 }).ok).toBe(false));
  it('negativo — contrato', () => expect(RN_504.avaliar({ valorDisponivelPerfil: 5000, valorDisponivelContrato: 700, valorAAprovar: 800 }).ok).toBe(false));
});

describe('RN-505 alerta de consumo 80/90 (aviso)', () => {
  it('consultiva', () => expect(RN_505.bloqueia).toBe(false));
  it('positivo — abaixo de 80%', () => expect(RN_505.avaliar({ percentagemHoras: 0.5, percentagemValor: 0.6 }).ok).toBe(true));
  it('negativo — horas ≥ 80%', () => expect(RN_505.avaliar({ percentagemHoras: 0.85, percentagemValor: 0.1 }).ok).toBe(false));
});

describe('RN-506 congelamento de valor na aprovação', () => {
  const base = { valorHoraVigente: 5000, valorHoraAplicado: 5000, valorImputadoEsperado: 2500, valorImputado: 2500 };
  it('positivo', () => expect(RN_506.avaliar(base).ok).toBe(true));
  it('negativo — sem preço vigente', () => expect(RN_506.avaliar({ ...base, valorHoraVigente: null }).ok).toBe(false));
  it('negativo — valor/hora divergente', () => expect(RN_506.avaliar({ ...base, valorHoraAplicado: 4000 }).ok).toBe(false));
  it('negativo — imputado divergente', () => expect(RN_506.avaliar({ ...base, valorImputado: 9999 }).ok).toBe(false));
});

describe('RN-507 aprovado é imutável (só ANULADO)', () => {
  it('positivo — aprovado→anulado', () => expect(RN_507.avaliar({ estadoAtual: 'APROVADO', estadoAlvo: 'ANULADO' }).ok).toBe(true));
  it('positivo — não aprovado', () => expect(RN_507.avaliar({ estadoAtual: 'SUBMETIDO', estadoAlvo: 'APROVADO' }).ok).toBe(true));
  it('negativo — aprovado→rascunho', () => expect(RN_507.avaliar({ estadoAtual: 'APROVADO', estadoAlvo: 'RASCUNHO' }).ok).toBe(false));
});

describe('RN-508 anulação com motivo por gestor', () => {
  it('positivo', () => expect(RN_508.avaliar({ papel: 'GESTOR_CONTRATO', motivo: 'erro de lançamento' }).ok).toBe(true));
  it('negativo — elemento', () => expect(RN_508.avaliar({ papel: 'ELEMENTO_EQUIPA_TECNICA', motivo: 'x' }).ok).toBe(false));
  it('negativo — sem motivo', () => expect(RN_508.avaliar({ papel: 'GESTOR_CONTRATO', motivo: ' ' }).ok).toBe(false));
});

describe('RN-509 visto do TdC necessário', () => {
  it('positivo — visto obtido', () => expect(RN_509.avaliar({ vistoNecessario: true, vistoObtido: true, vistoTacito: false, suportaFaturacao: true }).ok).toBe(true));
  it('positivo — não suporta faturação', () => expect(RN_509.avaliar({ vistoNecessario: true, vistoObtido: false, vistoTacito: false, suportaFaturacao: false }).ok).toBe(true));
  it('positivo — visto tácito', () => expect(RN_509.avaliar({ vistoNecessario: true, vistoObtido: false, vistoTacito: true, suportaFaturacao: true }).ok).toBe(true));
  it('negativo — necessário, não obtido, suporta faturação', () => expect(RN_509.avaliar({ vistoNecessario: true, vistoObtido: false, vistoTacito: false, suportaFaturacao: true }).ok).toBe(false));
});
