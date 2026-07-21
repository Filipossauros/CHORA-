import type { Cent, Minutos } from '../tipos/primitivos.js';
import type { EstadoFatura, TipoDocumentoFatura } from '../enums/index.js';
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

/** RN-602 — conferência só inicia com fatura e relatório de horas em PDF presentes. */
export const RN_602: Regra<{ tiposDocumentosPresentes: ReadonlyArray<TipoDocumentoFatura> }> = {
  codigo: 'RN-602',
  descricao:
    'A conferência só pode iniciar-se estando presentes os dois documentos obrigatórios em PDF: a fatura e o relatório de horas do fornecedor.',
  requisito: 'RF26, RF31',
  base: 'O circuito de validação técnica funciona sobre PDF. Ver secção 5.3.2.',
  excecaoFundamentavel: false,
  avaliar({ tiposDocumentosPresentes }) {
    const temFatura = tiposDocumentosPresentes.includes('FATURA');
    const temRelatorio = tiposDocumentosPresentes.includes('RELATORIO_HORAS_FORNECEDOR');
    if (!temFatura || !temRelatorio) {
      return violada(
        'Faltam documentos obrigatórios: são necessários a fatura e o relatório de horas do fornecedor.',
        { temFatura, temRelatorio },
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

export const REGRAS_FATURACAO = [
  RN_601,
  RN_602,
  RN_602_A,
  RN_603,
  RN_604,
  RN_605,
  RN_606,
  RN_607,
] as const;
