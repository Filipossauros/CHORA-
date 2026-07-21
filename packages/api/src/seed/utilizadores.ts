import type { UtilizadorDev } from '../auth/fake-token-validator.js';

/**
 * Utilizadores de demonstração (oid fictício). Nenhuma referência a pessoas
 * reais (secção 15). Usados pelo FakeTokenValidator via cabeçalho X-Dev-User.
 */
export const UTILIZADORES_DEV: UtilizadorDev[] = [
  { utilizadorId: 'oid-gestor-contrato', papeis: ['GESTOR_CONTRATO'] },
  { utilizadorId: 'oid-gestor-tecnico', papeis: ['GESTOR_TECNICO'] },
  { utilizadorId: 'oid-recurso-01', papeis: ['ELEMENTO_EQUIPA_TECNICA'] },
  { utilizadorId: 'oid-recurso-02', papeis: ['ELEMENTO_EQUIPA_TECNICA'] },
  { utilizadorId: 'oid-recurso-03', papeis: ['ELEMENTO_EQUIPA_TECNICA'] },
];
