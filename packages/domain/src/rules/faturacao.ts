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
    'A conferência só pode iniciar-se com a evidência documental em PDF: a fatura e, consoante o tipo de faturação, o relatório de horas do fornecedor (bolsa de horas) ou o auto de entrega (entregável). A fatura e o relatório podem vir no mesmo ficheiro. O licenciamento basta-se com a fatura.',
  requisito: 'RF26, RF31',
  base: 'O circuito de validação técnica funciona sobre PDF. Ver secção 5.3.2.',
  excecaoFundamentavel: false,
  avaliar({ tiposDocumentosPresentes, tipoFaturacao }) {
    // Um ficheiro único que contenha fatura e relatório satisfaz ambos: o que a
    // regra exige é a EVIDÊNCIA, não a contagem de ficheiros.
    const combinado = tiposDocumentosPresentes.includes('FATURA_COM_RELATORIO');
    const temFatura = combinado || tiposDocumentosPresentes.includes('FATURA');
    if (tipoFaturacao === 'LICENCIAMENTO') {
      // A licença titula-se pela fatura; não há horas nem entrega a comprovar.
      if (!temFatura) return violada('Falta o documento obrigatório: a fatura.', { temFatura });
      return conforme;
    }
    const entregavel = tipoFaturacao === 'ENTREGAVEL';
    const suporte: TipoDocumentoFatura = entregavel ? 'AUTO_ENTREGA' : 'RELATORIO_HORAS_FORNECEDOR';
    const temSuporte = tiposDocumentosPresentes.includes(suporte) || (!entregavel && combinado);
    if (!temFatura || !temSuporte) {
      return violada(
        `Faltam documentos obrigatórios: são necessários a fatura e ${entregavel ? 'o auto de entrega' : 'o relatório de horas do fornecedor'}${entregavel ? '' : ' — que podem vir no mesmo ficheiro'}.`,
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

/**
 * RN-610 — o contrato de licenciamento admite UMA só fatura.
 *
 * Não há execução a medir: contrata-se um direito de uso por um período e
 * fatura-se de uma vez. Uma segunda fatura de valor positivo indicia duplicação
 * ou período mal delimitado. As notas de crédito não contam: corrigem a fatura
 * emitida, não acrescentam faturação.
 */
export const RN_610: Regra<{ tipoFaturacao: string; faturasPositivasExistentes: number; montante: Cent }> = {
  codigo: 'RN-610',
  descricao:
    'Um contrato de licenciamento admite uma única fatura de valor positivo, correspondente à totalidade do contrato. Notas de crédito não são abrangidas.',
  requisito: 'novo',
  base: 'No licenciamento contrata-se um direito de uso por um período, faturado de uma só vez.',
  excecaoFundamentavel: false,
  avaliar({ tipoFaturacao, faturasPositivasExistentes, montante }) {
    if (tipoFaturacao !== 'LICENCIAMENTO') return conforme;
    if (montante > 0 && faturasPositivasExistentes > 0) {
      return violada(
        'O contrato de licenciamento já tem uma fatura emitida. Para corrigir o montante, emita nota de crédito.',
        { faturasPositivasExistentes },
      );
    }
    return conforme;
  },
};

/** RN-611 — a fatura de licenciamento corresponde à totalidade do contrato. */
export const RN_611: Regra<{ tipoFaturacao: string; montante: Cent; precoContratualAtual: Cent }> = {
  codigo: 'RN-611',
  descricao:
    'O montante da fatura de um contrato de licenciamento tem de corresponder à totalidade do preço contratual atual.',
  requisito: 'novo',
  base: 'Faturação única: não há faturação parcial de um licenciamento.',
  excecaoFundamentavel: false,
  avaliar({ tipoFaturacao, montante, precoContratualAtual }) {
    if (tipoFaturacao !== 'LICENCIAMENTO') return conforme;
    if (montante > 0 && montante !== precoContratualAtual) {
      return violada(
        'O montante da fatura não corresponde ao preço contratual do licenciamento.',
        { montante, precoContratualAtual, diferenca: montante - precoContratualAtual },
      );
    }
    return conforme;
  },
};

/**
 * RN-612 — a validação de fatura corrigida por nota de crédito exige a nota
 * documentada e o líquido a bater certo.
 *
 * Quando o fornecedor fatura a mais, a correção pode vir por nota de crédito em
 * vez de fatura substituta. Nesse caso o que se valida não é o montante da
 * fatura mas o líquido — e a decisão é uma só, sobre os dois documentos em
 * conjunto: validar a fatura sem a nota anexada seria atestar um valor que o
 * arquivo não suporta.
 */
export const RN_612: Regra<{
  temNotaCredito: boolean;
  documentoNotaCreditoPresente: boolean;
  montanteFatura: Cent;
  montanteNotaCredito: Cent;
  montanteConferido: Cent;
}> = {
  codigo: 'RN-612',
  descricao:
    'A validação de uma fatura corrigida por nota de crédito exige que a nota de crédito esteja documentada em PDF e que o líquido (fatura menos nota de crédito) corresponda ao montante conferido.',
  requisito: 'novo',
  base: 'A nota de crédito integra a evidência da decisão: valida-se o líquido, não o valor emitido a mais.',
  excecaoFundamentavel: false,
  avaliar({ temNotaCredito, documentoNotaCreditoPresente, montanteFatura, montanteNotaCredito, montanteConferido }) {
    if (!temNotaCredito) return conforme;
    if (!documentoNotaCreditoPresente) {
      return violada('Falta o PDF da nota de crédito: sem ele a decisão não fica documentada.');
    }
    const liquido = montanteFatura - montanteNotaCredito;
    if (liquido !== montanteConferido) {
      return violada(
        'O líquido da fatura após a nota de crédito não corresponde ao montante conferido.',
        { montanteFatura, montanteNotaCredito, liquido, montanteConferido, diferenca: liquido - montanteConferido },
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
  RN_607,
  RN_608,
  RN_609,
  RN_610,
  RN_611,
  RN_612,
] as const;
