import type { EstadoRegistoTempo } from '../enums/index.js';
import { criarMaquina, type Transicao } from './tipos.js';

/**
 * Ator da máquina de estado do registo de tempo. `PROPRIO` é o elemento que criou
 * o registo; `GESTOR` é o gestor de contrato ou técnico.
 */
export type AtorRegisto = 'PROPRIO' | 'GESTOR';

/** Tabela de transições (secção 7.1). */
export const TRANSICOES_REGISTO_TEMPO: ReadonlyArray<
  Transicao<EstadoRegistoTempo, AtorRegisto>
> = [
  { de: 'RASCUNHO', para: 'SUBMETIDO', atores: ['PROPRIO'], regras: ['RN-401', 'RN-403', 'RN-405', 'RN-408', 'RN-409', 'RN-410', 'RN-411'] },
  { de: 'SUBMETIDO', para: 'APROVADO', atores: ['GESTOR'], regras: ['RN-501', 'RN-502', 'RN-503', 'RN-504', 'RN-506', 'RN-509'] },
  { de: 'SUBMETIDO', para: 'REJEITADO', atores: ['GESTOR'] },
  { de: 'SUBMETIDO', para: 'RASCUNHO', atores: ['GESTOR'] }, // devolução
  { de: 'REJEITADO', para: 'RASCUNHO', atores: ['PROPRIO'] },
  { de: 'RASCUNHO', para: 'ANULADO', atores: ['PROPRIO', 'GESTOR'], regras: ['RN-406'] },
  { de: 'SUBMETIDO', para: 'ANULADO', atores: ['PROPRIO', 'GESTOR'], regras: ['RN-406'] },
  { de: 'APROVADO', para: 'ANULADO', atores: ['GESTOR'], regras: ['RN-508'] },
];

export const maquinaRegistoTempo = criarMaquina(TRANSICOES_REGISTO_TEMPO);
