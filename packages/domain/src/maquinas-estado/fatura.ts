import type { EstadoFatura } from '../enums/index.js';
import { criarMaquina, type Transicao } from './tipos.js';

/** Gestão de faturas é competência do gestor de contrato (secção 9.3). */
export type AtorFatura = 'GESTOR_CONTRATO';

/** Tabela de transições da fatura (secção 7.3). */
export const TRANSICOES_FATURA: ReadonlyArray<Transicao<EstadoFatura, AtorFatura>> = [
  { de: 'RECEBIDA', para: 'EM_CONFERENCIA', atores: ['GESTOR_CONTRATO'], regras: ['RN-602'] },
  { de: 'EM_CONFERENCIA', para: 'VALIDADA', atores: ['GESTOR_CONTRATO'], regras: ['RN-603', 'RN-604', 'RN-607'] },
  { de: 'EM_CONFERENCIA', para: 'INVALIDADA', atores: ['GESTOR_CONTRATO'], regras: ['RN-604'] },
  { de: 'EM_CONFERENCIA', para: 'DEVOLVIDA', atores: ['GESTOR_CONTRATO'] },
  { de: 'DEVOLVIDA', para: 'RECEBIDA', atores: ['GESTOR_CONTRATO'] },
  { de: 'VALIDADA', para: 'PAGA', atores: ['GESTOR_CONTRATO'] },
];

export const maquinaFatura = criarMaquina(TRANSICOES_FATURA);
