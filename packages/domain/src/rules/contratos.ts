import type { Contrato, GestorContrato } from '../entidades/contrato.js';
import type { Dotacao } from '../entidades/estrutura.js';
import type { Cent, DataISO } from '../tipos/primitivos.js';
import { conforme, violada, type Regra } from '../erros/regra.js';
import { jaEntrouEmVigor } from './_comum.js';

/** RN-101 — número de contrato obrigatório e único. */
export const RN_101: Regra<{ numero: string; numerosExistentes: ReadonlyArray<string> }> = {
  codigo: 'RN-101',
  descricao: 'O número de contrato é obrigatório e único.',
  requisito: 'RF1',
  base: '—',
  excecaoFundamentavel: false,
  avaliar({ numero, numerosExistentes }) {
    if (numero.trim().length === 0) {
      return violada('O número de contrato é obrigatório.');
    }
    if (numerosExistentes.includes(numero)) {
      return violada(`Já existe um contrato com o número ${numero}.`, { numero });
    }
    return conforme;
  },
};

/** RN-102 — um contrato pertence a exatamente um lote; um lote tem no máximo um contrato. */
export const RN_102: Regra<{ loteId: string; contratosNoLote: ReadonlyArray<string> }> = {
  codigo: 'RN-102',
  descricao:
    'Um contrato pertence a exatamente um lote; um lote tem no máximo um contrato; um procedimento tem 1..N lotes.',
  requisito: 'RF2 (corrigido)',
  base: 'O lote é divisão do procedimento, não sinónimo de contrato.',
  excecaoFundamentavel: false,
  avaliar({ loteId, contratosNoLote }) {
    if (loteId.trim().length === 0) {
      return violada('O contrato tem de indicar o lote a que pertence.');
    }
    if (contratosNoLote.length > 0) {
      return violada('O lote indicado já tem um contrato associado.', {
        loteId,
        contratosNoLote,
      });
    }
    return conforme;
  },
};

/** RN-103 — N:N contrato/projeto; a lista de projetos não tem duplicados. */
export const RN_103: Regra<{ projetoIds: ReadonlyArray<string> }> = {
  codigo: 'RN-103',
  descricao:
    'Um contrato pode estar associado a vários projetos e um projeto a vários contratos (N:N).',
  requisito: 'RF3 (corrigido)',
  base: 'O outsourcing serve tipicamente vários projetos.',
  excecaoFundamentavel: false,
  avaliar({ projetoIds }) {
    const unicos = new Set(projetoIds);
    if (unicos.size !== projetoIds.length) {
      return violada('A lista de projetos do contrato tem identificadores repetidos.');
    }
    return conforme;
  },
};

/** RN-104 — precoContratualInicial imutável após entrada em vigor. */
export const RN_104: Regra<{
  estado: Contrato['estado'];
  precoInicialAntes: Cent;
  precoInicialDepois: Cent;
}> = {
  codigo: 'RN-104',
  descricao: 'precoContratualInicial é imutável após o contrato entrar em vigor.',
  requisito: 'novo',
  base: 'É a base de cálculo dos limites legais.',
  excecaoFundamentavel: false,
  avaliar({ estado, precoInicialAntes, precoInicialDepois }) {
    if (jaEntrouEmVigor(estado) && precoInicialAntes !== precoInicialDepois) {
      return violada(
        'O preço contratual inicial não pode ser alterado após a entrada em vigor.',
        { precoInicialAntes, precoInicialDepois },
      );
    }
    return conforme;
  },
};

/** RN-105 — dotações + valor previsto de perfis ≤ precoContratualAtual. */
export const RN_105: Regra<{
  precoContratualAtual: Cent;
  totalDotacoes: Cent;
  totalPrevistoPerfis: Cent;
}> = {
  codigo: 'RN-105',
  descricao:
    'A soma do valor de todas as dotações e do valor previsto de todos os perfis não pode exceder precoContratualAtual.',
  requisito: 'RF17',
  base: '—',
  excecaoFundamentavel: false,
  avaliar({ precoContratualAtual, totalDotacoes, totalPrevistoPerfis }) {
    const soma = totalDotacoes + totalPrevistoPerfis;
    if (soma > precoContratualAtual) {
      return violada(
        'A soma das dotações e do valor previsto dos perfis excede o preço contratual atual.',
        { precoContratualAtual, soma },
      );
    }
    return conforme;
  },
};

/** RN-106 — tem de existir pelo menos uma dotação HORAS_BASE. */
export const RN_106: Regra<{ dotacoes: ReadonlyArray<Pick<Dotacao, 'tipo'>> }> = {
  codigo: 'RN-106',
  descricao:
    'Tem de existir pelo menos uma dotação HORAS_BASE; BOLSA_VALOR e TRABALHOS_COMPLEMENTARES são opcionais.',
  requisito: 'RF6',
  base: '—',
  excecaoFundamentavel: false,
  avaliar({ dotacoes }) {
    if (!dotacoes.some((d) => d.tipo === 'HORAS_BASE')) {
      return violada('O contrato tem de ter pelo menos uma dotação de horas base.');
    }
    return conforme;
  },
};

function gestoresAtivos(gestores: ReadonlyArray<GestorContrato>): GestorContrato[] {
  return gestores.filter((g) => g.cessouEm === undefined);
}

/** RN-107 — pelo menos um gestor, designado antes do início de vigência. */
export const RN_107: Regra<{
  gestores: ReadonlyArray<GestorContrato>;
  dataInicioVigencia: DataISO;
}> = {
  codigo: 'RN-107',
  descricao:
    'Todo o contrato tem de ter pelo menos um gestor designado, com data de designação anterior ao início de vigência.',
  requisito: 'novo',
  base: 'CCP, art. 290.º-A n.º 1 e art. 96.º n.º 1 al. j).',
  excecaoFundamentavel: false,
  avaliar({ gestores, dataInicioVigencia }) {
    if (gestores.length === 0) {
      return violada('O contrato tem de ter pelo menos um gestor designado.');
    }
    const tardios = gestores.filter((g) => g.designadoEm !== undefined && g.designadoEm > dataInicioVigencia);
    if (tardios.length === gestores.length) {
      return violada(
        'Nenhum gestor foi designado antes do início de vigência do contrato.',
        { dataInicioVigencia },
      );
    }
    return conforme;
  },
};

/** RN-108 — havendo mais do que um gestor em simultâneo, a delimitação de funções é obrigatória. */
export const RN_108: Regra<{ gestores: ReadonlyArray<GestorContrato> }> = {
  codigo: 'RN-108',
  descricao:
    'Havendo mais do que um gestor em simultâneo, a delimitação de funções é obrigatória.',
  requisito: 'novo',
  base: 'CCP, art. 290.º-A n.º 2.',
  excecaoFundamentavel: false,
  avaliar({ gestores }) {
    const ativos = gestoresAtivos(gestores);
    if (ativos.length > 1) {
      const semFuncoes = ativos.filter(
        (g) => g.funcoes === undefined || g.funcoes.trim().length === 0,
      );
      if (semFuncoes.length > 0) {
        return violada(
          'Com mais do que um gestor ativo, cada um tem de ter a delimitação de funções definida.',
          { gestoresSemFuncoes: semFuncoes.map((g) => g.utilizadorId) },
        );
      }
    }
    return conforme;
  },
};

/** RN-109 — declaração de inexistência de conflito de interesses (aviso, não bloqueio). */
export const RN_109: Regra<{ gestores: ReadonlyArray<GestorContrato> }> = {
  codigo: 'RN-109',
  descricao:
    'Cada gestor tem de ter declaração de inexistência de conflito de interesses registada. Ausência gera aviso, não bloqueio.',
  requisito: 'novo',
  base: 'CCP, art. 290.º-A n.º 7 e Anexo XIII.',
  excecaoFundamentavel: false,
  bloqueia: false,
  avaliar({ gestores }) {
    const semDeclaracao = gestoresAtivos(gestores).filter(
      (g) => g.declaracaoConflitoInteressesEm === undefined,
    );
    if (semDeclaracao.length > 0) {
      return violada('Há gestores sem declaração de inexistência de conflito de interesses.', {
        gestores: semDeclaracao.map((g) => g.utilizadorId),
      });
    }
    return conforme;
  },
};

/**
 * RN-110 — todas as alterações contratuais são registadas em histórico imutável.
 * Modela-se como invariante: qualquer alteração submetida tem fundamentação e
 * data de efeito (o histórico append-only é garantido pelo repositório).
 */
export const RN_110: Regra<{ fundamentacao: string; dataEfeito: DataISO }> = {
  codigo: 'RN-110',
  descricao:
    'Todas as alterações contratuais são registadas em histórico imutável, incluindo o histórico de alterações da data de término.',
  requisito: 'RF36',
  base: '—',
  excecaoFundamentavel: false,
  avaliar({ fundamentacao, dataEfeito }) {
    if (fundamentacao.trim().length === 0) {
      return violada('Uma alteração contratual tem de ter fundamentação registada.');
    }
    if (dataEfeito.trim().length === 0) {
      return violada('Uma alteração contratual tem de ter data de efeito.');
    }
    return conforme;
  },
};

export const REGRAS_CONTRATOS = [
  RN_101,
  RN_102,
  RN_103,
  RN_104,
  RN_105,
  RN_106,
  RN_107,
  RN_108,
  RN_109,
  RN_110,
] as const;
