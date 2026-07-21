import { describe, it, expect } from 'vitest';
import { maquinaRegistoTempo } from '../src/maquinas-estado/registo-tempo.js';
import { maquinaContrato } from '../src/maquinas-estado/contrato.js';
import { maquinaFatura } from '../src/maquinas-estado/fatura.js';

describe('máquina do registo de tempo (secção 7.1)', () => {
  it('próprio submete rascunho', () =>
    expect(maquinaRegistoTempo.transicaoPermitida('RASCUNHO', 'SUBMETIDO', 'PROPRIO').permitida).toBe(true));
  it('gestor aprova submetido', () =>
    expect(maquinaRegistoTempo.transicaoPermitida('SUBMETIDO', 'APROVADO', 'GESTOR').permitida).toBe(true));
  it('próprio NÃO aprova', () =>
    expect(maquinaRegistoTempo.transicaoPermitida('SUBMETIDO', 'APROVADO', 'PROPRIO').permitida).toBe(false));
  it('gestor anula aprovado', () =>
    expect(maquinaRegistoTempo.transicaoPermitida('APROVADO', 'ANULADO', 'GESTOR').permitida).toBe(true));
  it('próprio NÃO anula aprovado', () =>
    expect(maquinaRegistoTempo.transicaoPermitida('APROVADO', 'ANULADO', 'PROPRIO').permitida).toBe(false));
  it('aprovado NÃO volta a rascunho (RN-507)', () =>
    expect(maquinaRegistoTempo.transicaoPermitida('APROVADO', 'RASCUNHO', 'GESTOR').permitida).toBe(false));
  it('rejeitado corrige para rascunho (próprio)', () =>
    expect(maquinaRegistoTempo.transicaoPermitida('REJEITADO', 'RASCUNHO', 'PROPRIO').permitida).toBe(true));
  it('devolução: gestor devolve submetido a rascunho', () =>
    expect(maquinaRegistoTempo.transicaoPermitida('SUBMETIDO', 'RASCUNHO', 'GESTOR').permitida).toBe(true));
  it('transições possíveis a partir de SUBMETIDO para o gestor', () => {
    const destinos = maquinaRegistoTempo.transicoesPossiveis('SUBMETIDO', 'GESTOR');
    expect(destinos).toEqual(expect.arrayContaining(['APROVADO', 'REJEITADO', 'RASCUNHO', 'ANULADO']));
  });
});

describe('máquina do contrato (secção 7.2)', () => {
  it('preparação → aguarda visto', () =>
    expect(maquinaContrato.transicaoPermitida('EM_PREPARACAO', 'AGUARDA_VISTO', 'GESTOR').permitida).toBe(true));
  it('vigor ↔ suspenso', () => {
    expect(maquinaContrato.transicaoPermitida('EM_VIGOR', 'SUSPENSO', 'GESTOR').permitida).toBe(true);
    expect(maquinaContrato.transicaoPermitida('SUSPENSO', 'EM_VIGOR', 'GESTOR').permitida).toBe(true);
  });
  it('terminado é terminal', () =>
    expect(maquinaContrato.transicoesPossiveis('TERMINADO', 'GESTOR')).toEqual([]));
});

describe('máquina da fatura (secção 7.3)', () => {
  it('recebida → em conferência', () =>
    expect(maquinaFatura.transicaoPermitida('RECEBIDA', 'EM_CONFERENCIA', 'GESTOR_CONTRATO').permitida).toBe(true));
  it('conferência → validada/invalidada/devolvida', () => {
    expect(maquinaFatura.transicaoPermitida('EM_CONFERENCIA', 'VALIDADA', 'GESTOR_CONTRATO').permitida).toBe(true);
    expect(maquinaFatura.transicaoPermitida('EM_CONFERENCIA', 'INVALIDADA', 'GESTOR_CONTRATO').permitida).toBe(true);
    expect(maquinaFatura.transicaoPermitida('EM_CONFERENCIA', 'DEVOLVIDA', 'GESTOR_CONTRATO').permitida).toBe(true);
  });
  it('validada → paga', () =>
    expect(maquinaFatura.transicaoPermitida('VALIDADA', 'PAGA', 'GESTOR_CONTRATO').permitida).toBe(true));
  it('recebida NÃO salta para validada', () =>
    expect(maquinaFatura.transicaoPermitida('RECEBIDA', 'VALIDADA', 'GESTOR_CONTRATO').permitida).toBe(false));
});
