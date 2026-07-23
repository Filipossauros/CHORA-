import type { Cent } from '../tipos/primitivos.js';

/**
 * Ponto de extensão para um AGENTE DE IA com acesso permanente à versão mais
 * atual da legislação de contratação pública (CCP) e da Lei de Organização e
 * Processo do Tribunal de Contas (LOPTC). No protótipo há um stub determinístico;
 * em produção, este contrato pode ser servido por um agente com RAG sobre a
 * legislação em vigor, mantendo a mesma interface.
 */
export interface AvaliacaoVisto {
  obrigatorio: boolean;
  limiar: Cent;
  referencia: string;
}

export interface AgenteCCP {
  /** Avalia se o valor do contrato atinge o limiar de visto prévio do TdC. */
  avaliarVistoPrevio(valorContratoCent: Cent): AvaliacaoVisto | Promise<AvaliacaoVisto>;
}

/**
 * Limiar (ILUSTRATIVO) a partir do qual o visto prévio do Tribunal de Contas se
 * torna, em regra, obrigatório. O valor efetivo é fixado anualmente (Lei do
 * Orçamento do Estado / LOPTC) — o agente de IA deve obtê-lo da fonte legal em
 * vigor. Aqui usa-se um valor de referência para o protótipo.
 */
export const LIMIAR_VISTO_PREVIO_CENT: Cent = 750_000_00;

export class AgenteCCPStub implements AgenteCCP {
  constructor(private readonly limiar: Cent = LIMIAR_VISTO_PREVIO_CENT) {}
  avaliarVistoPrevio(valorContratoCent: Cent): AvaliacaoVisto {
    return {
      obrigatorio: valorContratoCent >= this.limiar,
      limiar: this.limiar,
      referencia: 'LOPTC (Lei n.º 98/97) e Lei do Orçamento do Estado em vigor — limiar de fiscalização prévia (valor ilustrativo no protótipo; a confirmar pelo agente CCP).',
    };
  }
}
