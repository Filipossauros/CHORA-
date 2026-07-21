import type { EstadoContrato } from '../enums/index.js';
import { criarMaquina, type Transicao } from './tipos.js';

/** Gestão de contrato é ato do contraente público. */
export type AtorContrato = 'GESTOR';

/** Tabela de transições do contrato (secção 7.2). */
export const TRANSICOES_CONTRATO: ReadonlyArray<Transicao<EstadoContrato, AtorContrato>> = [
  { de: 'EM_PREPARACAO', para: 'AGUARDA_VISTO', atores: ['GESTOR'] },
  { de: 'EM_PREPARACAO', para: 'EM_VIGOR', atores: ['GESTOR'] },
  { de: 'AGUARDA_VISTO', para: 'EM_VIGOR', atores: ['GESTOR'] },
  { de: 'EM_VIGOR', para: 'SUSPENSO', atores: ['GESTOR'] },
  { de: 'SUSPENSO', para: 'EM_VIGOR', atores: ['GESTOR'] },
  { de: 'EM_VIGOR', para: 'TERMINADO', atores: ['GESTOR'] },
  { de: 'EM_VIGOR', para: 'RESOLVIDO', atores: ['GESTOR'] },
  { de: 'EM_VIGOR', para: 'CADUCADO', atores: ['GESTOR'] },
  { de: 'EM_VIGOR', para: 'REVOGADO', atores: ['GESTOR'] },
];

export const maquinaContrato = criarMaquina(TRANSICOES_CONTRATO);
