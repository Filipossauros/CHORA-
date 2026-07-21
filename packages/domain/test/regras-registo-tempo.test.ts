import { describe, it, expect } from 'vitest';
import {
  RN_401, RN_402, RN_403, RN_404, RN_405, RN_406, RN_407, RN_408, RN_409, RN_410, RN_411,
  type AfetacaoContexto,
} from '../src/rules/registo-tempo.js';

const afetacao: AfetacaoContexto = {
  contratoId: 'c1', perfilId: 'p1', recursoId: 'res1',
  projetoIds: ['proj1'], vigenteDe: '2026-01-01', vigenteAte: '2026-12-31', ativa: true,
};

describe('RN-401 afetação ativa exigida', () => {
  const base = { afetacao, recursoId: 'res1', contratoId: 'c1', perfilId: 'p1', projetoId: 'proj1', data: '2026-03-10' };
  it('positivo', () => expect(RN_401.avaliar(base).ok).toBe(true));
  it('negativo — sem afetação', () => expect(RN_401.avaliar({ ...base, afetacao: null }).ok).toBe(false));
  it('negativo — projeto não afeto', () => expect(RN_401.avaliar({ ...base, projetoId: 'outro' }).ok).toBe(false));
  it('negativo — fora da vigência da afetação', () => expect(RN_401.avaliar({ ...base, data: '2027-01-01' }).ok).toBe(false));
});

describe('RN-402 partição livre', () => {
  it('positivo', () => expect(RN_402.avaliar({ duracao: 30 }).ok).toBe(true));
  it('negativo — duração não positiva', () => expect(RN_402.avaliar({ duracao: 0 }).ok).toBe(false));
});

describe('RN-403 máximo diário com justificação', () => {
  it('positivo — abaixo do máximo', () => expect(RN_403.avaliar({ minutosNoDia: 400, novaDuracao: 200 }).ok).toBe(true));
  it('negativo — excede sem justificação', () => expect(RN_403.avaliar({ minutosNoDia: 700, novaDuracao: 60 }).ok).toBe(false));
  it('positivo — excede com justificação', () => expect(RN_403.avaliar({ minutosNoDia: 700, novaDuracao: 60, justificacao: 'plantão' }).ok).toBe(true));
});

describe('RN-404 fim de semana/feriado (aviso)', () => {
  it('consultiva', () => expect(RN_404.bloqueia).toBe(false));
  it('positivo — dia útil', () => expect(RN_404.avaliar({ data: '2026-07-24' }).ok).toBe(true));
  it('negativo — sábado', () => expect(RN_404.avaliar({ data: '2026-07-25' }).ok).toBe(false));
  it('negativo — feriado', () => expect(RN_404.avaliar({ data: '2026-12-25' }).ok).toBe(false));
});

describe('RN-405 duração mínima e múltiplos de 15', () => {
  it('positivo', () => expect(RN_405.avaliar({ duracao: 30 }).ok).toBe(true));
  it('negativo — abaixo do mínimo', () => expect(RN_405.avaliar({ duracao: 10 }).ok).toBe(false));
  it('negativo — não múltiplo', () => expect(RN_405.avaliar({ duracao: 25 }).ok).toBe(false));
});

describe('RN-406 alterar/anular só próprios em rascunho/submetido', () => {
  it('positivo', () => expect(RN_406.avaliar({ estado: 'RASCUNHO', autorId: 'u1', utilizadorId: 'u1' }).ok).toBe(true));
  it('negativo — de terceiro', () => expect(RN_406.avaliar({ estado: 'RASCUNHO', autorId: 'u2', utilizadorId: 'u1' }).ok).toBe(false));
  it('negativo — aprovado', () => expect(RN_406.avaliar({ estado: 'APROVADO', autorId: 'u1', utilizadorId: 'u1' }).ok).toBe(false));
});

describe('RN-407 elemento só vê os próprios', () => {
  it('positivo — próprios', () => expect(RN_407.avaliar({ papel: 'ELEMENTO_EQUIPA_TECNICA', recursoIdRegisto: 'u1', utilizadorId: 'u1' }).ok).toBe(true));
  it('positivo — gestor vê tudo', () => expect(RN_407.avaliar({ papel: 'GESTOR_CONTRATO', recursoIdRegisto: 'u2', utilizadorId: 'u1' }).ok).toBe(true));
  it('negativo — elemento vê terceiros', () => expect(RN_407.avaliar({ papel: 'ELEMENTO_EQUIPA_TECNICA', recursoIdRegisto: 'u2', utilizadorId: 'u1' }).ok).toBe(false));
});

describe('RN-408 data dentro da vigência e da afetação', () => {
  const base = { data: '2026-06-01', vigenciaContratoDe: '2026-01-01', vigenciaContratoAte: '2026-12-31', afetacaoDe: '2026-05-01', afetacaoAte: '2026-08-31' };
  it('positivo', () => expect(RN_408.avaliar(base).ok).toBe(true));
  it('negativo — fora do contrato', () => expect(RN_408.avaliar({ ...base, data: '2027-01-01' }).ok).toBe(false));
  it('negativo — fora da afetação', () => expect(RN_408.avaliar({ ...base, data: '2026-04-01' }).ok).toBe(false));
});

describe('RN-409 data não futura', () => {
  it('positivo', () => expect(RN_409.avaliar({ data: '2026-07-20', agora: '2026-07-21T10:00:00.000Z' }).ok).toBe(true));
  it('negativo', () => expect(RN_409.avaliar({ data: '2026-07-22', agora: '2026-07-21T10:00:00.000Z' }).ok).toBe(false));
});

describe('RN-410 data fora de suspensão', () => {
  const susp = [{ dataInicio: '2026-03-01', dataFim: '2026-03-31', suspendePrazoExecucao: true }];
  it('positivo', () => expect(RN_410.avaliar({ data: '2026-02-15', suspensoes: susp }).ok).toBe(true));
  it('negativo', () => expect(RN_410.avaliar({ data: '2026-03-15', suspensoes: susp }).ok).toBe(false));
});

describe('RN-411 work item pertence ao projeto', () => {
  it('positivo', () => expect(RN_411.avaliar({ projetoIdRegisto: 'proj1', projetoIdWorkItem: 'proj1' }).ok).toBe(true));
  it('negativo — outro projeto', () => expect(RN_411.avaliar({ projetoIdRegisto: 'proj1', projetoIdWorkItem: 'proj2' }).ok).toBe(false));
  it('negativo — inexistente', () => expect(RN_411.avaliar({ projetoIdRegisto: 'proj1', projetoIdWorkItem: null }).ok).toBe(false));
});
