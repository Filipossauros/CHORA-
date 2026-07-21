import type { EstadoContrato } from '../enums/index.js';

/**
 * Predicados partilhados pelas famílias de regras.
 */

/** Estados em que o contrato já entrou (ou passou) em vigor — RN-104. */
export const ESTADOS_ENTROU_EM_VIGOR: ReadonlyArray<EstadoContrato> = [
  'EM_VIGOR',
  'SUSPENSO',
  'TERMINADO',
  'RESOLVIDO',
  'CADUCADO',
  'REVOGADO',
];

export function jaEntrouEmVigor(estado: EstadoContrato): boolean {
  return ESTADOS_ENTROU_EM_VIGOR.includes(estado);
}

/** Estados que bloqueiam qualquer novo registo ou aprovação — RN-208. */
export const ESTADOS_BLOQUEIAM_REGISTO: ReadonlyArray<EstadoContrato> = [
  'RESOLVIDO',
  'CADUCADO',
  'REVOGADO',
  'TERMINADO',
];

export function bloqueiaRegisto(estado: EstadoContrato): boolean {
  return ESTADOS_BLOQUEIAM_REGISTO.includes(estado);
}
