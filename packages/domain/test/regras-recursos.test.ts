import { describe, it, expect } from 'vitest';
import { RN_701, RN_702, RN_703, RN_704 } from '../src/rules/recursos.js';

describe('RN-701 substituição de recurso', () => {
  const base = { perfilAntigo: 'p1', perfilNovo: 'p1', entidadeAntiga: 'E1', entidadeNova: 'E1', encerraAnterior: true };
  it('positivo', () => expect(RN_701.avaliar(base).ok).toBe(true));
  it('negativo — perfil diferente', () => expect(RN_701.avaliar({ ...base, perfilNovo: 'p2' }).ok).toBe(false));
  it('negativo — entidade diferente', () => expect(RN_701.avaliar({ ...base, entidadeNova: 'E2' }).ok).toBe(false));
  it('negativo — não encerra anterior', () => expect(RN_701.avaliar({ ...base, encerraAnterior: false }).ok).toBe(false));
});

describe('RN-702 entidade executante identificada', () => {
  it('positivo', () => expect(RN_702.avaliar({ entidadeExecutanteNipc: '500000000' }).ok).toBe(true));
  it('negativo', () => expect(RN_702.avaliar({ entidadeExecutanteNipc: ' ' }).ok).toBe(false));
});

describe('RN-703 habilitação a expirar (aviso)', () => {
  it('consultiva', () => expect(RN_703.bloqueia).toBe(false));
  it('positivo — válida por muito tempo', () => expect(RN_703.avaliar({ validoAte: '2026-12-31', hoje: '2026-07-21' }).ok).toBe(true));
  it('negativo — expira em menos de 30 dias', () => expect(RN_703.avaliar({ validoAte: '2026-08-10', hoje: '2026-07-21' }).ok).toBe(false));
});

describe('RN-704 sem tempo sobreposto', () => {
  const existentes = [{ data: '2026-07-21', inicioMin: 540, fimMin: 600 }]; // 09:00–10:00
  it('positivo — sem sobreposição', () => expect(RN_704.avaliar({ existentes, novo: { data: '2026-07-21', inicioMin: 600, fimMin: 660 } }).ok).toBe(true));
  it('positivo — dia diferente', () => expect(RN_704.avaliar({ existentes, novo: { data: '2026-07-22', inicioMin: 540, fimMin: 600 } }).ok).toBe(true));
  it('negativo — sobreposto', () => expect(RN_704.avaliar({ existentes, novo: { data: '2026-07-21', inicioMin: 570, fimMin: 630 } }).ok).toBe(false));
});
