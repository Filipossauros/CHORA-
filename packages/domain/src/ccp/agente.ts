import type { Cent } from '../tipos/primitivos.js';
import { parametroLegal, valorLegal } from '../legal/base-legal.js';

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

/** Limiar (ILUSTRATIVO) do visto prévio — obtido da base legal versionada. */
export const LIMIAR_VISTO_PREVIO_CENT: Cent = valorLegal('VISTO_PREVIO_LIMIAR_CENT', 750_000_00);

export class AgenteCCPStub implements AgenteCCP {
  constructor(private readonly limiar: Cent = valorLegal('VISTO_PREVIO_LIMIAR_CENT', 750_000_00)) {}
  avaliarVistoPrevio(valorContratoCent: Cent): AvaliacaoVisto {
    return {
      obrigatorio: valorContratoCent >= this.limiar,
      limiar: this.limiar,
      referencia: parametroLegal('VISTO_PREVIO_LIMIAR_CENT')?.referencia ?? 'LOPTC (Lei n.º 98/97) — limiar de fiscalização prévia.',
    };
  }

  avaliarTransicaoAnoEconomico(e: EntradaTransicao): AvaliacaoTransicao {
    // Base e percentagem obtidas da base legal versionada (o agente real
    // confirma-as na legislação em vigor: LCPA / DL 127/2012).
    const pct = valorLegal('TRANSICAO_ANO_PCT', PERCENTAGEM_TRANSICAO_ANO);
    const limiteMontante = Math.floor(e.precoContratualInicial * pct);
    const base = `Até ${Math.round(pct * 100)}% do preço contratual inicial`;
    const referencia = parametroLegal('TRANSICAO_ANO_PCT')?.referencia ?? 'LCPA (Lei n.º 8/2012) e DL n.º 127/2012.';
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
      return { permitido: false, limiteMontante, base, motivo: `O montante a transitar não pode exceder ${Math.round(pct * 100)}% do valor contratualizado nem o saldo por executar.`, referencia };
    }
    return { permitido: true, limiteMontante, base, referencia };
  }
}
