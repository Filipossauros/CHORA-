import { describe, it, expect } from 'vitest';
import { zDataISO, zInstanteISO, zMesISO, zCent, zMinutos } from '../src/tipos/primitivos.js';

describe('esquemas primitivos (secção 5.3.1)', () => {
  it('rejeita instante sem desvio de fuso com erro (400 na API)', () => {
    expect(zInstanteISO.safeParse('2026-03-14T09:21:07').success).toBe(false);
  });

  it('normaliza instante com fuso para UTC', () => {
    const r = zInstanteISO.parse('2026-03-14T09:21:07+01:00');
    expect(r).toBe('2026-03-14T08:21:07.000Z');
  });

  it('aceita DataISO válida e rejeita datas inexistentes', () => {
    expect(zDataISO.parse('2026-07-21')).toBe('2026-07-21');
    expect(zDataISO.safeParse('2026-02-30').success).toBe(false);
    expect(zDataISO.safeParse('2026-13-01').success).toBe(false);
    expect(zDataISO.safeParse('21-07-2026').success).toBe(false);
  });

  it('valida MesISO', () => {
    expect(zMesISO.parse('2026-07')).toBe('2026-07');
    expect(zMesISO.safeParse('2026-13').success).toBe(false);
    expect(zMesISO.safeParse('2026-7').success).toBe(false);
  });

  it('Cent e Minutos rejeitam não inteiros', () => {
    expect(zCent.safeParse(1050).success).toBe(true);
    expect(zCent.safeParse(10.5).success).toBe(false);
    expect(zMinutos.safeParse(-5).success).toBe(false);
    expect(zMinutos.safeParse(15).success).toBe(true);
  });
});
