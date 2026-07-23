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

export interface EntradaTransicao {
  precoContratualInicial: Cent;
  precoContratualAtual: Cent;
  saldoPorExecutar: Cent;
  temPortariaExtensaoEncargos: boolean;
  montantePretendido: Cent;
}
export interface AvaliacaoTransicao {
  permitido: boolean;
  limiteMontante: Cent;
  base: string; // descrição da base de cálculo aplicada
  motivo?: string; // razão de não permitido
  referencia: string;
}

export interface AgenteCCP {
  /** Avalia se o valor do contrato atinge o limiar de visto prévio do TdC. */
  avaliarVistoPrevio(valorContratoCent: Cent): AvaliacaoVisto | Promise<AvaliacaoVisto>;
  /**
   * Avalia, segundo a legislação em vigor, a transição de encargos por executar
   * para o ano económico seguinte (contratos sem portaria de extensão de encargos).
   */
  avaliarTransicaoAnoEconomico(entrada: EntradaTransicao): AvaliacaoTransicao | Promise<AvaliacaoTransicao>;
}

/** Percentagem (ilustrativa) do valor contratualizado transitável para o ano seguinte. */
export const PERCENTAGEM_TRANSICAO_ANO: number = 0.5;

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

  avaliarTransicaoAnoEconomico(e: EntradaTransicao): AvaliacaoTransicao {
    // Base aplicada segundo a legislação em vigor (stub): até 50% do valor
    // contratualizado (preço contratual inicial). O agente real deve confirmar a
    // base e a percentagem na legislação aplicável (LCPA / DL 127/2012).
    const limiteMontante = Math.floor(e.precoContratualInicial * PERCENTAGEM_TRANSICAO_ANO);
    const base = `Até ${Math.round(PERCENTAGEM_TRANSICAO_ANO * 100)}% do preço contratual inicial`;
    const referencia = 'LCPA (Lei n.º 8/2012) e DL n.º 127/2012 — transição de encargos sem portaria de extensão (valores a confirmar pelo agente CCP com a legislação em vigor).';
    if (e.temPortariaExtensaoEncargos) {
      return { permitido: false, limiteMontante, base, motivo: 'O contrato tem portaria de extensão de encargos: a execução plurianual segue essa autorização, não a transição.', referencia };
    }
    if (e.saldoPorExecutar <= 0) {
      return { permitido: false, limiteMontante, base, motivo: 'Não há saldo por executar para transitar.', referencia };
    }
    if (e.montantePretendido <= 0) {
      return { permitido: false, limiteMontante, base, motivo: 'Indique um montante a transitar (> 0).', referencia };
    }
    if (e.montantePretendido > Math.min(limiteMontante, e.saldoPorExecutar)) {
      return { permitido: false, limiteMontante, base, motivo: `O montante a transitar não pode exceder ${Math.round(PERCENTAGEM_TRANSICAO_ANO * 100)}% do valor contratualizado nem o saldo por executar.`, referencia };
    }
    return { permitido: true, limiteMontante, base, referencia };
  }
}
