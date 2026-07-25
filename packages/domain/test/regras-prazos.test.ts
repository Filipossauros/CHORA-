import { describe, it, expect } from 'vitest';
import {
  RN_201, RN_202, RN_203, RN_204, RN_205, RN_207, RN_208,
} from '../src/rules/prazos.js';

describe('RN-201 início antes do término', () => {
  it('positivo', () => expect(RN_201.avaliar({ dataInicioVigencia: '2026-01-01', dataTerminoContratual: '2027-01-01' }).ok).toBe(true));
  it('negativo', () => expect(RN_201.avaliar({ dataInicioVigencia: '2027-01-01', dataTerminoContratual: '2026-01-01' }).ok).toBe(false));
});

describe('RN-202 limite de 36 meses (exceção fundamentável)', () => {
  it('positivo — dentro do limite', () =>
    expect(RN_202.avaliar({ dataInicioVigencia: '2024-01-01', dataTerminoContratual: '2026-06-01', temExcecao: false }).ok).toBe(true));
  it('negativo — excede sem exceção', () =>
    expect(RN_202.avaliar({ dataInicioVigencia: '2024-01-01', dataTerminoContratual: '2027-06-01', temExcecao: false }).ok).toBe(false));
  it('positivo — excede com exceção', () =>
    expect(RN_202.avaliar({ dataInicioVigencia: '2024-01-01', dataTerminoContratual: '2027-06-01', temExcecao: true }).ok).toBe(true));
  it('é fundamentável', () => expect(RN_202.excecaoFundamentavel).toBe(true));
});

describe('RN-203 fim efetivo não posterior ao término', () => {
  it('positivo', () => expect(RN_203.avaliar({ dataTerminoContratual: '2027-01-01', fimEfetivoDeclarado: '2026-06-01' }).ok).toBe(true));
  it('negativo', () => expect(RN_203.avaliar({ dataTerminoContratual: '2027-01-01', fimEfetivoDeclarado: '2027-06-01' }).ok).toBe(false));
});

describe('RN-204 deslocação por suspensão (aviso)', () => {
  it('consultiva', () => expect(RN_204.bloqueia).toBe(false));
  it('positivo', () => expect(RN_204.avaliar({ vigenciaProjetadaMeses: 30, temExcecao: false }).ok).toBe(true));
  it('negativo', () => expect(RN_204.avaliar({ vigenciaProjetadaMeses: 40, temExcecao: false }).ok).toBe(false));
  it('positivo com exceção', () => expect(RN_204.avaliar({ vigenciaProjetadaMeses: 40, temExcecao: true }).ok).toBe(true));
});

describe('RN-205 suspensões não sobrepostas', () => {
  it('positivo', () =>
    expect(RN_205.avaliar({ suspensoes: [
      { dataInicio: '2026-01-01', dataFim: '2026-01-31', suspendePrazoExecucao: true },
      { dataInicio: '2026-02-01', dataFim: '2026-02-28', suspendePrazoExecucao: true },
    ] }).ok).toBe(true));
  it('negativo', () =>
    expect(RN_205.avaliar({ suspensoes: [
      { dataInicio: '2026-01-01', dataFim: '2026-02-15', suspendePrazoExecucao: true },
      { dataInicio: '2026-02-01', dataFim: '2026-02-28', suspendePrazoExecucao: true },
    ] }).ok).toBe(false));
});

describe('RN-207 saldo não estende vigência', () => {
  it('positivo', () => expect(RN_207.avaliar({ tentaEstenderVigenciaPorSaldo: false }).ok).toBe(true));
  it('negativo', () => expect(RN_207.avaliar({ tentaEstenderVigenciaPorSaldo: true }).ok).toBe(false));
});

describe('RN-208 estados terminais bloqueiam registo', () => {
  it('positivo — em vigor', () => expect(RN_208.avaliar({ estado: 'EM_VIGOR' }).ok).toBe(true));
  it('negativo — resolvido', () => expect(RN_208.avaliar({ estado: 'RESOLVIDO' }).ok).toBe(false));
  it('negativo — terminado', () => expect(RN_208.avaliar({ estado: 'TERMINADO' }).ok).toBe(false));
});
