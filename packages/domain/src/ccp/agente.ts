import type { Cent, DataISO } from '../tipos/primitivos.js';
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

/**
 * Minutas (peças escritas) geráveis pelo agente para instruir procedimentos de
 * modificação/execução. No protótipo o agente produz texto determinístico a
 * partir de modelos; em produção um agente com RAG sobre a legislação em vigor
 * redige a peça mantendo a mesma interface. A minuta é sempre indicativa — o
 * gestor revê, funda e assume a decisão (não é vinculativa).
 */
export type TipoMinuta = 'PRORROGACAO' | 'SUSPENSAO_EXCECAO' | 'PORTARIA_REPROGRAMACAO';

export interface EntradaMinuta {
  tipo: TipoMinuta;
  numeroContrato: string;
  objeto: string;
  dataTerminoAtual?: DataISO;
  novaDataTermino?: DataISO;
  vigenciaProjetadaMeses?: number;
  numeroPortaria?: string;
  anoFinalPortaria?: number;
  anoTermino?: number;
  reprogramacaoFinanceira?: boolean;
  fundamentacao?: string;
}

export interface Minuta {
  titulo: string;
  corpo: string; // texto da minuta (pt-PT, pós-AO90)
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
  /** Gera uma minuta (peça escrita) para instruir a modificação/execução. */
  gerarMinuta(entrada: EntradaMinuta): Minuta | Promise<Minuta>;
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

  gerarMinuta(e: EntradaMinuta): Minuta {
    const fund = e.fundamentacao?.trim() ? e.fundamentacao.trim() : '[fundamentação a completar pelo gestor]';
    if (e.tipo === 'PRORROGACAO') {
      const referencia = 'CCP, art. 311.º e ss. (modificação objetiva) e art. 440.º/48.º (prazo).';
      const linhaReprog = e.reprogramacaoFinanceira
        ? 'A prorrogação implica reprogramação financeira dos encargos plurianuais, a refletir na portaria de extensão de encargos.'
        : 'A prorrogação não altera a repartição de encargos aprovada.';
      return {
        titulo: `Minuta — prorrogação do contrato ${e.numeroContrato}`,
        corpo:
          `Proposta de prorrogação do prazo de vigência do contrato ${e.numeroContrato} ` +
          `(${e.objeto})${e.dataTerminoAtual ? `, cujo termo se encontra fixado em ${e.dataTerminoAtual}` : ''}` +
          `${e.novaDataTermino ? `, para o novo termo de ${e.novaDataTermino}` : ''}.\n\n` +
          `Fundamento: ${fund}\n\n` +
          `A prorrogação constitui modificação objetiva autónoma, com fundamento próprio, não decorrendo ` +
          `automaticamente do registo de serviços complementares (RN-206). ${linhaReprog}\n\n` +
          `${e.vigenciaProjetadaMeses !== undefined && e.vigenciaProjetadaMeses > 36
            ? `A vigência resultante (${e.vigenciaProjetadaMeses.toFixed(0)} meses) excede o limite indicativo de 36 meses, ` +
              `pelo que se propõe o registo de exceção fundamentada (RN-202).\n\n`
            : ''}` +
          `Propõe-se a autorização da modificação e o respetivo registo no histórico do contrato e, sendo o caso, ` +
          `a publicitação legalmente devida.`,
        referencia,
      };
    }
    if (e.tipo === 'SUSPENSAO_EXCECAO') {
      return {
        titulo: `Minuta — exceção ao limite de vigência por suspensão (${e.numeroContrato})`,
        corpo:
          `As suspensões registadas no contrato ${e.numeroContrato} (${e.objeto}) deslocam o prazo de execução ` +
          `e projetam a vigência para ${e.vigenciaProjetadaMeses !== undefined ? `${e.vigenciaProjetadaMeses.toFixed(0)} meses` : 'além do previsto'}, ` +
          `ultrapassando o limite indicativo de 36 meses.\n\n` +
          `O prazo de vigência e o prazo de execução são grandezas distintas: a suspensão que suspende a execução ` +
          `desloca o termo de execução sem, por si, alterar a vigência (RN-204). Ainda assim, projetando-se a vigência ` +
          `para além dos 36 meses, propõe-se o registo de exceção fundamentada.\n\n` +
          `Fundamento: ${fund}`,
        referencia: 'CCP — suspensão da execução; separação prazo de vigência/execução (RN-204).',
      };
    }
    // PORTARIA_REPROGRAMACAO
    return {
      titulo: `Minuta — pedido de reprogramação da portaria de extensão de encargos (${e.numeroContrato})`,
      corpo:
        `O contrato ${e.numeroContrato} (${e.objeto}) mantém execução plurianual ao abrigo da portaria de extensão ` +
        `de encargos ${e.numeroPortaria ?? '[n.º da portaria]'}, cuja repartição cobre até ao ano de ` +
        `${e.anoFinalPortaria ?? '[ano]'}. Estando o termo do contrato fixado no ano de ${e.anoTermino ?? '[ano]'}, ` +
        `a cobertura orçamental plurianual é insuficiente para o período remanescente.\n\n` +
        `Propõe-se, assim, promover a reprogramação da portaria de extensão de encargos, ajustando a repartição anual ` +
        `aos anos económicos ainda por executar, em cumprimento da LCPA e do DL n.º 127/2012.\n\n` +
        `Fundamento: ${fund}`,
      referencia: 'LCPA (Lei n.º 8/2012) e DL n.º 127/2012 — repartição plurianual de encargos.',
    };
  }
}
