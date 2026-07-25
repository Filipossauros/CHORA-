import { describe, it, expect } from 'vitest';
import { chaveAlerta, agravou, reconciliarAlertas, decisoesPendentes, saudeContrato, type AlertaCalculado } from '../src/alertas/reconciliacao.js';
import type { Alerta } from '../src/entidades/auditoria-alerta.js';

const AGORA = '2026-07-25T10:00:00.000Z';
const HOJE = '2026-07-25';
let n = 0;
const novoId = (): string => `alr-${++n}`;

function calc(over: Partial<AlertaCalculado> = {}): AlertaCalculado {
  return {
    contratoId: 'c1', codigo: 'AL-FOLGA-SEM-TEMPO', chave: chaveAlerta('c1', 'AL-FOLGA-SEM-TEMPO'),
    severidade: 'AVISO', titulo: 'Folga', detalhe: 'x', destinatarioId: 'g1', ...over,
  };
}
function existente(over: Partial<Alerta> = {}): Alerta {
  return {
    id: 'alr-0', contratoId: 'c1', codigo: 'AL-FOLGA-SEM-TEMPO', chave: chaveAlerta('c1', 'AL-FOLGA-SEM-TEMPO'),
    estado: 'ABERTA', severidade: 'AVISO', titulo: 'Folga', detalhe: 'x', destinatarioId: 'g1',
    geradoEm: '2026-06-01T09:00:00.000Z', ...over,
  };
}

describe('identidade estável', () => {
  it('a chave inclui contrato, código e referência', () => {
    expect(chaveAlerta('c1', 'AL-PERFIL-90', 'p3')).toBe('c1|AL-PERFIL-90|p3');
    expect(chaveAlerta('c1', 'AL-FOLGA-SEM-TEMPO')).toBe('c1|AL-FOLGA-SEM-TEMPO');
  });
  it('o mesmo código em perfis diferentes são decisões diferentes', () => {
    expect(chaveAlerta('c1', 'AL-PERFIL-90', 'p1')).not.toBe(chaveAlerta('c1', 'AL-PERFIL-90', 'p2'));
  });
  it('agravou compara severidades', () => {
    expect(agravou('AVISO', 'CRITICO')).toBe(true);
    expect(agravou('CRITICO', 'AVISO')).toBe(false);
    expect(agravou('AVISO', 'AVISO')).toBe(false);
  });
});

describe('reconciliação', () => {
  it('duas execuções sobre a mesma situação não duplicam', () => {
    const r1 = reconciliarAlertas([], [calc()], AGORA, HOJE, novoId);
    expect(r1.alertas).toHaveLength(1);
    expect(r1.novas).toHaveLength(1);
    const r2 = reconciliarAlertas(r1.alertas, [calc()], AGORA, HOJE, novoId);
    expect(r2.alertas).toHaveLength(1);
    expect(r2.novas).toHaveLength(0);
    expect(r2.alertas[0]!.id).toBe(r1.alertas[0]!.id); // mesma identidade
  });

  it('conserva a primeira deteção e atualiza o conteúdo', () => {
    const antiga = existente({ detalhe: 'antigo', impactoValor: 100 });
    const r = reconciliarAlertas([antiga], [calc({ detalhe: 'novo', impactoValor: 500 })], AGORA, HOJE, novoId);
    expect(r.alertas[0]!.geradoEm).toBe('2026-06-01T09:00:00.000Z'); // não muda
    expect(r.alertas[0]!.detalhe).toBe('novo');
    expect(r.alertas[0]!.impactoValor).toBe(500);
    expect(r.alertas[0]!.atualizadoEm).toBe(AGORA);
  });

  it('conserva a decisão do gestor (EM_CURSO não volta a ABERTA)', () => {
    const r = reconciliarAlertas([existente({ estado: 'EM_CURSO' })], [calc()], AGORA, HOJE, novoId);
    expect(r.alertas[0]!.estado).toBe('EM_CURSO');
  });

  it('resolve o que deixou de se verificar, sem passo manual', () => {
    const r = reconciliarAlertas([existente()], [], AGORA, HOJE, novoId);
    expect(r.alertas[0]!.estado).toBe('RESOLVIDA');
    expect(r.alertas[0]!.motivoResolucao).toContain('deixou de se verificar');
    expect(r.resolvidas).toHaveLength(1);
  });

  it('uma decisão dispensada não reaparece enquanto a dispensa durar', () => {
    const disp = existente({ estado: 'DISPENSADA', dispensadaAte: '2026-09-30', motivoDispensa: 'tratado fora' });
    const r = reconciliarAlertas([disp], [calc()], AGORA, HOJE, novoId);
    expect(r.alertas[0]!.estado).toBe('DISPENSADA');
    expect(r.reabertas).toHaveLength(0);
  });

  it('a dispensa caduca e a decisão reabre', () => {
    const disp = existente({ estado: 'DISPENSADA', dispensadaAte: '2026-07-01' }); // antes de HOJE
    const r = reconciliarAlertas([disp], [calc()], AGORA, HOJE, novoId);
    expect(r.alertas[0]!.estado).toBe('ABERTA');
    expect(r.alertas[0]!.dispensadaAte).toBeUndefined();
    expect(r.reabertas).toHaveLength(1);
  });

  it('o agravamento reabre uma decisão dispensada', () => {
    const disp = existente({ estado: 'DISPENSADA', dispensadaAte: '2026-12-31', severidade: 'AVISO' });
    const r = reconciliarAlertas([disp], [calc({ severidade: 'CRITICO' })], AGORA, HOJE, novoId);
    expect(r.alertas[0]!.estado).toBe('ABERTA');
    expect(r.reabertas).toHaveLength(1);
  });

  it('uma decisão resolvida reabre se a condição voltar', () => {
    const res = existente({ estado: 'RESOLVIDA', resolvidaEm: '2026-07-01T00:00:00.000Z' });
    const r = reconciliarAlertas([res], [calc()], AGORA, HOJE, novoId);
    expect(r.alertas[0]!.estado).toBe('ABERTA');
    expect(r.alertas[0]!.resolvidaEm).toBeUndefined();
  });

  it('decisões já resolvidas que continuam ausentes ficam como estão', () => {
    const res = existente({ estado: 'RESOLVIDA' });
    const r = reconciliarAlertas([res], [], AGORA, HOJE, novoId);
    expect(r.alertas[0]!.estado).toBe('RESOLVIDA');
    expect(r.resolvidas).toHaveLength(0);
  });
});

describe('decisões pendentes e saúde do contrato', () => {
  it('pendentes são as abertas e em curso', () => {
    const lista = [
      existente({ id: 'a', estado: 'ABERTA' }),
      existente({ id: 'b', estado: 'EM_CURSO' }),
      existente({ id: 'c', estado: 'RESOLVIDA' }),
      existente({ id: 'd', estado: 'DISPENSADA' }),
    ];
    expect(decisoesPendentes(lista).map((a) => a.id)).toEqual(['a', 'b']);
  });

  it('a saúde é a severidade mais grave entre as pendentes', () => {
    expect(saudeContrato([existente({ severidade: 'AVISO' }), existente({ severidade: 'CRITICO' })])).toBe('CRITICO');
    expect(saudeContrato([existente({ severidade: 'INFO' })])).toBe('INFO');
    expect(saudeContrato([existente({ estado: 'RESOLVIDA', severidade: 'CRITICO' })])).toBeNull();
    expect(saudeContrato([])).toBeNull();
  });
});
