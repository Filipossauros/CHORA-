import type { EstadoFatura } from '../enums/index.js';
import { criarMaquina, type Transicao } from './tipos.js';

/** Gestão de faturas é competência do gestor de contrato (secção 9.3). */
export type AtorFatura = 'GESTOR_CONTRATO';

/** Tabela de transições da fatura (secção 7.3). */
export const TRANSICOES_FATURA: ReadonlyArray<Transicao<EstadoFatura, AtorFatura>> = [
  { de: 'RECEBIDA', para: 'EM_CONFERENCIA', atores: ['GESTOR_CONTRATO'], regras: ['RN-602'] },
  { de: 'EM_CONFERENCIA', para: 'VALIDADA', atores: ['GESTOR_CONTRATO'], regras: ['RN-603', 'RN-604', 'RN-607', 'RN-612'] },
  { de: 'EM_CONFERENCIA', para: 'INVALIDADA', atores: ['GESTOR_CONTRATO'], regras: ['RN-604'] },
  // Espera pela nota de crédito: a fatura fica por conferir, e volta à
  // conferência quando a nota chega — para se decidirem em conjunto (RN-612).
  { de: 'EM_CONFERENCIA', para: 'AGUARDA_NOTA_CREDITO', atores: ['GESTOR_CONTRATO'] },
  { de: 'AGUARDA_NOTA_CREDITO', para: 'EM_CONFERENCIA', atores: ['GESTOR_CONTRATO'] },
  { de: 'AGUARDA_NOTA_CREDITO', para: 'INVALIDADA', atores: ['GESTOR_CONTRATO'], regras: ['RN-604'] },
];

export const maquinaFatura = criarMaquina(TRANSICOES_FATURA);
