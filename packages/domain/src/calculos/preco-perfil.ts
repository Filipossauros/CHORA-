import type { PerfilContratual, PrecoPerfil } from '../entidades/estrutura.js';
import type { Cent, DataISO } from '../tipos/primitivos.js';
import { dentroDoIntervalo } from '../tipos/tempo.js';

/**
 * Resolve o valor/hora vigente de um perfil numa data (ADR-09, RN-506).
 *
 * A série de preços é uma sequência de vigências `[vigenteDe, vigenteAte?]`.
 * Devolve `null` se não houver preço vigente na data indicada — o chamador
 * decide o tratamento (a aprovação de um registo sem preço vigente é um erro).
 */
export function precoVigente(perfil: PerfilContratual, data: DataISO): PrecoPerfil | null {
  const candidatos = perfil.precos.filter((p) =>
    dentroDoIntervalo(data, p.vigenteDe, p.vigenteAte),
  );
  if (candidatos.length === 0) {
    return null;
  }
  // Em caso de sobreposição (não deveria existir), vence a vigência mais recente.
  return candidatos.reduce((mais, p) => (p.vigenteDe > mais.vigenteDe ? p : mais));
}

/** Valor/hora vigente numa data, ou `null`. */
export function valorHoraVigente(perfil: PerfilContratual, data: DataISO): Cent | null {
  const p = precoVigente(perfil, data);
  return p === null ? null : p.valorHora;
}

/**
 * Valor imputado por um registo, a partir da duração (minutos) e do valor/hora.
 * Aritmética inteira em cêntimos; arredondamento comercial ao cêntimo.
 */
export function valorImputado(duracaoMinutos: number, valorHora: Cent): Cent {
  return Math.round((duracaoMinutos * valorHora) / 60);
}
