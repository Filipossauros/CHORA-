import type { Cent, Minutos } from '../tipos/primitivos.js';
import type { EstadoFatura, TipoDocumentoFatura, TipoFaturacao } from '../enums/index.js';
import { conforme, violada, type Regra } from '../erros/regra.js';

/** RN-601 — fatura associada a contrato e a compromisso válido, com saldo suficiente. */
export const RN_601: Regra<{
  temCompromisso: boolean;
  saldoCompromisso: Cent;
  montanteFatura: Cent;
}> = {
  codigo: 'RN-601',
  descricao:
    'Uma fatura tem de estar associada a contrato e a compromisso válido, com saldo suficiente.',
  requisito: 'RF32',
  base: 'Lei dos Compromissos e Pagamentos em Atraso (Lei n.º 8/2012).',
  excecaoFundamentavel: false,
  avaliar({ temCompromisso, saldoCompromisso, montanteFatura }) {
    if (!temCompromisso) {
      return violada('A fatura tem de estar associada a um compromisso válido.');
    }
    if (montanteFatura > saldoCompromisso) {
      return violada('O compromisso não tem saldo suficiente para a fatura.', {
        saldoCompromisso,
        montanteFatura,
      });
    }
    return conforme;
  },
};

/**
 * RN-602 — conferência só inicia com os dois documentos em PDF presentes. O
 * segundo documento depende do que se está a liquidar: tempo prestado exige o
 * relatório de horas do fornecedor; um entregável exige o auto de entrega, que é
 * o documento que titula o facto gerador da faturação.
 */
export const RN_602: Regra<{
  tiposDocumentosPresentes: ReadonlyArray<TipoDocumentoFatura>;
  tipoFaturacao?: TipoFaturacao;
}> = {
  codigo: 'RN-602',
  descricao:
    'A conferência só pode iniciar-se estando presentes os dois documentos obrigatórios em PDF: a fatura e, consoante o tipo de faturação, o relatório de horas do fornecedor (bolsa de horas) ou o auto de entrega (entregável).',
  requisito: 'RF26, RF31',
  base: 'O circuito de validação técnica funciona sobre PDF. Ver secção 5.3.2.',
  excecaoFundamentavel: false,
  avaliar({ tiposDocumentosPresentes, tipoFaturacao }) {
    const entregavel = tipoFaturacao === 'ENTREGAVEL';
    const suporte: TipoDocumentoFatura = entregavel ? 'AUTO_ENTREGA' : 'RELATORIO_HORAS_FORNECEDOR';
    const temFatura = tiposDocumentosPresentes.includes('FATURA');
    const temSuporte = tiposDocumentosPresentes.includes(suporte);
    if (!temFatura || !temSuporte) {
      return violada(
        `Faltam documentos obrigatórios: são necessários a fatura e ${entregavel ? 'o auto de entrega' : 'o relatório de horas do fornecedor'}.`,
        { temFatura, temSuporte, suporte },
      );
    }
    return conforme;
  },
};

/** RN-602-A — o hash de documento de fatura já decidida não pode ser alterado. */
export const RN_602_A: Regra<{ estadoFatura: EstadoFatura; hashAntes: string; hashDepois: string }> = {
  codigo: 'RN-602-A',
  descricao:
    'O hash de um documento associado a uma fatura já decidida (VALIDADA ou INVALIDADA) não pode ser alterado. Substituir obriga a reabrir a conferência.',
  requisito: 'novo',
  base: 'Garante que o relatório de evidência se refere sempre ao documento efetivamente conferido.',
  excecaoFundamentavel: false,
  avaliar({ estadoFatura, hashAntes, hashDepois }) {
    const decidida = estadoFatura === 'VALIDADA' || estadoFatura === 'INVALIDADA';
    if (decidida && hashAntes !== hashDepois) {
      return violada(
        'Não é possível alterar o documento de uma fatura já decidida sem reabrir a conferência.',
        { estadoFatura },
      );
    }
    return conforme;
  },
};

/** Linha de conferência: comparação de fatura vs registos aprovados. */
export interface LinhaConferencia {
  perfilId: string | undefined;
  recursoId: string | undefined;
  quantidadeFatura: Minutos;
  valorFatura: Cent;
  quantidadeAprovada: Minutos;
  valorAprovado: Cent;
}

/** RN-603 — conferência determinística; divergência em quantidade ou valor bloqueia a validação. */
export const RN_603: Regra<{ linhas: ReadonlyArray<LinhaConferencia> }> = {
  codigo: 'RN-603',
  descricao:
    'A conferência compara as linhas da fatura com os registos aprovados do período, por perfil e por recurso. Divergência em quantidade ou valor bloqueia a validação.',
  requisito: 'RF26 (parte determinística)',
  base: 'Esta é a conferência que não precisa de IA: comparam-se números, não documentos.',
  excecaoFundamentavel: false,
  avaliar({ linhas }) {
    const divergencias = linhas.filter(
      (l) =>
        l.quantidadeFatura !== l.quantidadeAprovada || l.valorFatura !== l.valorAprovado,
    );
    if (divergencias.length > 0) {
      return violada('Há divergências entre a fatura e os registos aprovados do período.', {
        divergencias: divergencias.map((l) => ({
          perfilId: l.perfilId,
          recursoId: l.recursoId,
          quantidadeFatura: l.quantidadeFatura,
          quantidadeAprovada: l.quantidadeAprovada,
          valorFatura: l.valorFatura,
          valorAprovado: l.valorAprovado,
        })),
      });
    }
    return conforme;
  },
};

/** RN-604 — toda a decisão gera RelatorioEvidencia arquivado e imutável. */
export const RN_604: Regra<{ temRelatorioEvidencia: boolean }> = {
  codigo: 'RN-604',
  descricao: 'Toda a validação (ou invalidação) gera RelatorioEvidencia arquivado e imutável.',
  requisito: 'RF27, RF28',
  base: '—',
  excecaoFundamentavel: false,
  avaliar({ temRelatorioEvidencia }) {
    if (!temRelatorioEvidencia) {
      return violada('A decisão sobre a fatura tem de gerar um relatório de evidência.');
    }
    return conforme;
  },
};

/** RN-605 — registar dataLimitePagamento e sinalizar aproximação/incumprimento (aviso). */
export const RN_605: Regra<{ dataLimitePagamento: string | undefined; hoje: string }> = {
  codigo: 'RN-605',
  descricao: 'Registar dataLimitePagamento e sinalizar aproximação e incumprimento do prazo.',
  requisito: 'novo',
  base: 'Indicador de desempenho da própria entidade.',
  excecaoFundamentavel: false,
  bloqueia: false,
  avaliar({ dataLimitePagamento, hoje }) {
    if (dataLimitePagamento !== undefined && dataLimitePagamento < hoje) {
      return violada('Prazo de pagamento da fatura ultrapassado.', { dataLimitePagamento, hoje });
    }
    return conforme;
  },
};

/** RN-606 — suportar deduções e notas de crédito no montante aprovado (invariante de consistência). */
export const RN_606: Regra<{
  montanteAprovado: Cent;
  deducoes: Cent;
  montanteLiquido: Cent;
}> = {
  codigo: 'RN-606',
  descricao: 'Suportar deduções e notas de crédito, refletidas no montante aprovado.',
  requisito: 'novo',
  base: 'Penalidades contratuais (CCP, art. 329.º) e correções.',
  excecaoFundamentavel: false,
  avaliar({ montanteAprovado, deducoes, montanteLiquido }) {
    if (montanteAprovado - deducoes !== montanteLiquido) {
      return violada('O montante líquido não reflete corretamente as deduções.', {
        montanteAprovado,
        deducoes,
        montanteLiquido,
      });
    }
    return conforme;
  },
};

/** RN-607 — somatório de montantes aprovados ≤ precoContratualAtual. */
export const RN_607: Regra<{ totalFaturado: Cent; novoMontante: Cent; precoContratualAtual: Cent }> = {
  codigo: 'RN-607',
  descricao: 'O somatório de montantes aprovados não pode exceder precoContratualAtual.',
  requisito: 'novo',
  base: '—',
  excecaoFundamentavel: false,
  avaliar({ totalFaturado, novoMontante, precoContratualAtual }) {
    if (totalFaturado + novoMontante > precoContratualAtual) {
      return violada('O somatório de montantes aprovados excederia o preço contratual atual.', {
        totalFaturado,
        novoMontante,
        precoContratualAtual,
      });
    }
    return conforme;
  },
};

/**
 * RN-608 — só se fatura o que está entregue. Num contrato de preço fixo o facto
 * gerador da faturação é a entrega do resultado, não a passagem do tempo.
 */
export const RN_608: Regra<{ tipoFaturacao: string; entregavelIdentificado: boolean; entregue: boolean }> = {
  codigo: 'RN-608',
  descricao:
    'A faturação de um entregável exige que este esteja identificado na fatura e assinalado como entregue.',
  requisito: 'novo',
  base: 'Nos contratos de preço fixo o facto gerador da faturação é a entrega e aceitação do resultado.',
  excecaoFundamentavel: false,
  avaliar({ tipoFaturacao, entregavelIdentificado, entregue }) {
    if (tipoFaturacao !== 'ENTREGAVEL') return conforme;
    if (!entregavelIdentificado) {
      return violada('Uma fatura de entregável tem de identificar o entregável que liquida.');
    }
    if (!entregue) {
      return violada('O entregável ainda não está assinalado como entregue: não pode ser faturado.');
    }
    return conforme;
  },
};

/**
 * RN-609 — o montante faturado tem de corresponder ao valor do entregável.
 * No preço fixo não há faturação parcial nem por medição: ou se entrega e se
 * paga o valor acordado, ou não se fatura.
 */
export const RN_609: Regra<{ tipoFaturacao: string; montanteFatura: Cent; valorEntregavel: Cent }> = {
  codigo: 'RN-609',
  descricao:
    'O montante de uma fatura de entregável tem de corresponder exatamente ao valor do entregável.',
  requisito: 'novo',
  base: 'No preço fixo não há faturação parcial nem por medição do entregável.',
  excecaoFundamentavel: false,
  avaliar({ tipoFaturacao, montanteFatura, valorEntregavel }) {
    if (tipoFaturacao !== 'ENTREGAVEL') return conforme;
    if (montanteFatura !== valorEntregavel) {
      return violada(
        'O montante da fatura não corresponde ao valor do entregável.',
        { montanteFatura, valorEntregavel, diferenca: montanteFatura - valorEntregavel },
      );
    }
    return conforme;
  },
};

export const REGRAS_FATURACAO = [
  RN_601,
  RN_602,
  RN_602_A,
  RN_603,
  RN_604,
  RN_605,
  RN_606,
  RN_607,
  RN_608,
  RN_609,
] as const;
