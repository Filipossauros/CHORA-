import { describe, it, expect } from 'vitest';
import { AgenteCCPStub } from '../src/ccp/agente.js';
import { CATALOGO_ALERTAS, definicaoAlerta } from '../src/alertas/catalogo.js';

const agente = new AgenteCCPStub();

describe('AgenteCCP — minutas', () => {
  it('gera minuta de prorrogação com reprogramação financeira e exceção aos 36 meses', () => {
    const m = agente.gerarMinuta({
      tipo: 'PRORROGACAO', numeroContrato: 'C-1', objeto: 'Serviços',
      dataTerminoAtual: '2026-01-01', novaDataTermino: '2028-06-01',
      vigenciaProjetadaMeses: 41, reprogramacaoFinanceira: true, fundamentacao: 'Necessidade fundamentada.',
    });
    expect(m.titulo).toContain('C-1');
    expect(m.corpo).toContain('2028-06-01');
    expect(m.corpo).toContain('reprogramação financeira');
    expect(m.corpo).toContain('36 meses');
    expect(m.corpo).toContain('Necessidade fundamentada.');
    expect(m.referencia.length).toBeGreaterThan(0);
  });

  it('gera minuta de reprogramação de portaria', () => {
    const m = agente.gerarMinuta({
      tipo: 'PORTARIA_REPROGRAMACAO', numeroContrato: 'C-2', objeto: 'Bolsa de horas',
      numeroPortaria: 'P-123', anoFinalPortaria: 2026, anoTermino: 2027,
    });
    expect(m.titulo).toContain('reprogramação');
    expect(m.corpo).toContain('P-123');
    expect(m.corpo).toContain('2026');
    expect(m.corpo).toContain('2027');
  });

  it('gera minuta de exceção por suspensão', () => {
    const m = agente.gerarMinuta({ tipo: 'SUSPENSAO_EXCECAO', numeroContrato: 'C-3', objeto: 'Serviços', vigenciaProjetadaMeses: 40 });
    expect(m.corpo).toContain('C-3');
    expect(m.corpo).toContain('36 meses');
    expect(m.corpo).toContain('[fundamentação a completar pelo gestor]');
  });
});

describe('catálogo de alertas', () => {
  it('códigos únicos', () => {
    const codigos = CATALOGO_ALERTAS.map((a) => a.codigo);
    expect(new Set(codigos).size).toBe(codigos.length);
  });
  it('inclui os alertas novos e resolve por código', () => {
    expect(definicaoAlerta('AL-PORTARIA-REPROGRAMAR')).toBeDefined();
    expect(definicaoAlerta('AL-SUSPENSAO-VIGENCIA')?.regraRelacionada).toBe('RN-204');
    expect(definicaoAlerta('INEXISTENTE')).toBeUndefined();
  });
  it('cada definição tem título e descrição', () => {
    for (const a of CATALOGO_ALERTAS) {
      expect(a.titulo.length).toBeGreaterThan(0);
      expect(a.descricao.length).toBeGreaterThan(0);
    }
  });
});
