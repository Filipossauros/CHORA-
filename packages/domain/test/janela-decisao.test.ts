import { describe, it, expect } from 'vitest';
import {
  fimAnoEconomico, inicioAnoSeguinte, severidadePorJanela, janelaDecisao,
  janelaTransicaoAno, janelaReprogramacaoPortaria, janelaNovoProcedimento,
} from '../src/calculos/janela-decisao.js';

describe('janela de decisão', () => {
  it('fim do ano económico coincide com o ano civil', () => {
    expect(fimAnoEconomico('2026-05-10')).toBe('2026-12-31');
    expect(inicioAnoSeguinte('2026-05-10')).toBe('2027-01-01');
  });

  it('severidade escala à medida que a janela se fecha', () => {
    expect(severidadePorJanela(120)).toBe('INFO');
    expect(severidadePorJanela(40)).toBe('AVISO');
    expect(severidadePorJanela(10)).toBe('CRITICO');
    expect(severidadePorJanela(-5)).toBe('CRITICO'); // prazo já passou
  });

  it('a data-limite recua o prazo de instrução a partir do evento', () => {
    const j = janelaDecisao('2026-01-01', '2026-03-31', 30, 'evento');
    expect(j.dataLimiteAcao).toBe('2026-03-01');
    expect(j.diasParaLimite).toBe(59);
    expect(j.eventoAncora).toBe('evento');
  });

  it('transição de ano recua 45 dias a partir de 31/12', () => {
    const j = janelaTransicaoAno('2026-10-01');
    expect(j.dataLimiteAcao).toBe('2026-11-16'); // 31/12 - 45 dias
    expect(j.eventoAncora).toContain('ano económico');
  });

  it('reprogramação de portaria recua 75 dias do início do ano a cobrir', () => {
    const j = janelaReprogramacaoPortaria('2026-06-01', 2027);
    expect(j.dataLimiteAcao).toBe('2026-10-18'); // 2027-01-01 - 75 dias
  });

  it('novo procedimento soma o visto prévio quando exigido', () => {
    const sem = janelaNovoProcedimento('2026-01-01', '2028-01-01', false);
    const com = janelaNovoProcedimento('2026-01-01', '2028-01-01', true);
    // Com visto, é preciso começar mais cedo (3 meses adicionais).
    expect(com.dataLimiteAcao < sem.dataLimiteAcao).toBe(true);
    expect(com.diasParaLimite).toBeLessThan(sem.diasParaLimite);
  });
});
