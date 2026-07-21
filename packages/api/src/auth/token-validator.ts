import type { InstanteISO, PapelAplicacional } from '@chora/domain';

/**
 * Contexto do utilizador resolvido a partir do token (secção 9).
 * O `utilizadorId` é o oid do Entra ID; o nome nunca circula nem é persistido.
 */
export interface ContextoUtilizador {
  utilizadorId: string;
  projetoId?: string;
  organizacao?: string;
  validoAte: InstanteISO;
  /** Papéis aplicacionais do utilizador (secção 9.3). */
  papeis: PapelAplicacional[];
}

export interface TokenValidator {
  validar(token: string, contextoProjeto?: string): Promise<ContextoUtilizador>;
}

/** Erro de autenticação — mapeado para 401 na fronteira HTTP. */
export class ErroAutenticacao extends Error {
  constructor(mensagem: string) {
    super(mensagem);
    this.name = 'ErroAutenticacao';
  }
}
