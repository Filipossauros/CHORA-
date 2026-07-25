import { describe, it, expect } from 'vitest';
import { CATALOGO_ALERTAS, definicaoAlerta } from '../src/alertas/catalogo.js';

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
