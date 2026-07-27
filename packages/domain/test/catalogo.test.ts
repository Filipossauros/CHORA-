import { describe, it, expect } from 'vitest';
import { CATALOGO_REGRAS, regraPorCodigo } from '../src/rules/index.js';

describe('catálogo de regras (secção 6, normativa)', () => {
  it('todos os códigos são únicos', () => {
    const codigos = CATALOGO_REGRAS.map((r) => r.codigo);
    expect(new Set(codigos).size).toBe(codigos.length);
  });

  it('inclui todas as famílias RN esperadas', () => {
    const esperadas = [
      'RN-101', 'RN-102', 'RN-103', 'RN-104', 'RN-105', 'RN-106', 'RN-107', 'RN-110', 'RN-111', 'RN-112', 'RN-113', 'RN-114',
      'RN-201', 'RN-202', 'RN-203', 'RN-204', 'RN-205', 'RN-207', 'RN-208',
      'RN-301', 'RN-302', 'RN-303', 'RN-304', 'RN-305',
      'RN-401', 'RN-402', 'RN-403', 'RN-404', 'RN-405', 'RN-406', 'RN-407', 'RN-408', 'RN-409', 'RN-410', 'RN-411',
      'RN-501', 'RN-502', 'RN-503', 'RN-504', 'RN-505', 'RN-506', 'RN-507', 'RN-508', 'RN-509',
      'RN-601', 'RN-602', 'RN-602-A', 'RN-603', 'RN-604', 'RN-607', 'RN-608', 'RN-609', 'RN-610', 'RN-611', 'RN-612',
      'RN-701', 'RN-702', 'RN-703', 'RN-704',
    ];
    for (const codigo of esperadas) {
      expect(regraPorCodigo(codigo), `falta a regra ${codigo}`).toBeDefined();
    }
    expect(CATALOGO_REGRAS.length).toBe(esperadas.length);
  });

  it('cada regra tem descrição, requisito e base preenchidos', () => {
    for (const r of CATALOGO_REGRAS) {
      expect(r.descricao.length, r.codigo).toBeGreaterThan(0);
      expect(r.requisito.length, r.codigo).toBeGreaterThan(0);
      expect(r.base.length, r.codigo).toBeGreaterThan(0);
    }
  });
});
