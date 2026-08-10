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

/**
 * RN-111 — um contrato chave-na-mão paga resultado, não tempo: tem de ter os
 * entregáveis identificados, cada um com o valor que representa.
 */
export const RN_111: Regra<{
  tipologia: string;
  numeroEntregaveis: number;
  entregaveisSemValor: number;
}> = {
  codigo: 'RN-111',
  descricao:
    'Um contrato chave-na-mão tem de ter pelo menos um entregável identificado, e todos os entregáveis têm de ter valor associado.',
  requisito: 'novo',
  base: 'No preço fixo paga-se o resultado: a faturação é por entregável, pelo que estes têm de estar definidos.',
  excecaoFundamentavel: false,
  avaliar({ tipologia, numeroEntregaveis, entregaveisSemValor }) {
    if (tipologia !== 'CHAVE_NA_MAO') return conforme;
    if (numeroEntregaveis === 0) {
      return violada('Um contrato chave-na-mão tem de ter pelo menos um entregável identificado.');
    }
    if (entregaveisSemValor > 0) {
      return violada('Todos os entregáveis têm de ter valor (em euros ou em percentagem do contrato).', { entregaveisSemValor });
    }
    return conforme;
  },
};

/**
 * RN-112 — o somatório dos entregáveis e da bolsa de horas não pode exceder o
 * preço contratual: são as duas parcelas em que o preço se reparte.
 */
export const RN_112: Regra<{
  precoContratualAtual: Cent;
  totalEntregaveis: Cent;
  bolsaHorasValor: Cent;
}> = {
  codigo: 'RN-112',
  descricao:
    'A soma do valor dos entregáveis com o valor da bolsa de horas não pode exceder o preço contratual atual.',
  requisito: 'novo',
  base: 'O preço contratual é o teto da despesa: as componentes em que se reparte não o podem ultrapassar.',
  excecaoFundamentavel: false,
  avaliar({ precoContratualAtual, totalEntregaveis, bolsaHorasValor }) {
    const soma = totalEntregaveis + bolsaHorasValor;
    if (soma > precoContratualAtual) {
      return violada(
        'A soma dos entregáveis com a bolsa de horas excede o preço contratual atual.',
        { precoContratualAtual, totalEntregaveis, bolsaHorasValor, soma, excesso: soma - precoContratualAtual },
      );
    }
    return conforme;
  },
};

/**
 * RN-113 — o contrato de licenciamento tem de indicar a vigência da licença.
 *
 * Sem ela não se sabe o que foi comprado: um licenciamento é um direito de uso
 * por um PERÍODO, e é esse período que determina quando é preciso renovar.
 */
export const RN_113: Regra<{ tipologia: string; temVigenciaLicenciamento: boolean }> = {
  codigo: 'RN-113',
  descricao: 'Um contrato de licenciamento tem de indicar o período de vigência das licenças.',
  requisito: 'novo',
  base: 'O licenciamento é um direito de uso por um período determinado.',
  excecaoFundamentavel: false,
  avaliar({ tipologia, temVigenciaLicenciamento }) {
    if (tipologia !== 'LICENCIAMENTO') return conforme;
    if (!temVigenciaLicenciamento) {
      return violada('Indique o período de vigência do licenciamento (início e fim).');
    }
    return conforme;
  },
};

/** RN-114 — a vigência da licença cabe dentro da vigência do contrato. */
export const RN_114: Regra<{
  tipologia: string;
  licencaDe?: DataISO; licencaAte?: DataISO;
  contratoDe: DataISO; contratoAte: DataISO;
}> = {
  codigo: 'RN-114',
  descricao:
    'O período de vigência das licenças tem de estar contido na vigência do contrato e ter fim posterior ao início.',
  requisito: 'novo',
  base: 'Não se licencia para lá do prazo em que o contrato que titula a aquisição existe.',
  excecaoFundamentavel: false,
  avaliar({ tipologia, licencaDe, licencaAte, contratoDe, contratoAte }) {
    if (tipologia !== 'LICENCIAMENTO' || licencaDe === undefined || licencaAte === undefined) return conforme;
    if (licencaAte <= licencaDe) {
      return violada('O fim da vigência do licenciamento tem de ser posterior ao início.', { licencaDe, licencaAte });
    }
    if (licencaDe < contratoDe || licencaAte > contratoAte) {
      return violada(
        'O período de licenciamento tem de estar contido na vigência do contrato.',
        { licencaDe, licencaAte, contratoDe, contratoAte },
      );
    }
    return conforme;
  },
};

/**
 * Encargo anual máximo que o Conselho de Administração pode assumir por portaria
 * de extensão de encargos sem portaria conjunta dos membros do Governo.
 */
export const LIMITE_ANUAL_PORTARIA_CA: Cent = 500_000_00;

/**
 * RN-115 — competência do Conselho de Administração para extensão de encargos.
 *
 * O limite afere-se ANO A ANO e apenas sobre os ANOS FUTUROS: o encargo do ano
 * em curso tem cabimento próprio e não é o que a portaria estende. Basta um ano
 * futuro acima do limite para a portaria carecer de despacho conjunto — o que
 * muda o prazo de instrução em meses, não em dias. Daí ser regra de
 * planeamento: apanhá-la no orçamento evita descobri-la já com o procedimento
 * lançado.
 */
export const RN_115: Regra<{
  anoBase: number;
  reparticaoAnual: ReadonlyArray<{ ano: number; montante: Cent }>;
}> = {
  codigo: 'RN-115',
  descricao:
    'O encargo de cada ano futuro coberto por portaria de extensão de encargos não pode exceder 500 000 € para ser aprovado pelo Conselho de Administração; acima disso exige portaria conjunta dos membros do Governo.',
  requisito: 'novo',
  base: 'Competência delegada do Conselho de Administração para assunção de encargos plurianuais.',
  excecaoFundamentavel: false,
  avaliar({ anoBase, reparticaoAnual }) {
    const futuros = reparticaoAnual.filter((r) => r.ano > anoBase);
    const acima = futuros.filter((r) => r.montante > LIMITE_ANUAL_PORTARIA_CA);
    if (acima.length > 0) {
      return violada(
        'O encargo de um ou mais anos futuros excede a competência do Conselho de Administração: a portaria carece de despacho conjunto dos membros do Governo.',
        {
          limiteAnual: LIMITE_ANUAL_PORTARIA_CA,
          anosAcimaDoLimite: acima.map((r) => ({ ano: r.ano, montante: r.montante, excesso: r.montante - LIMITE_ANUAL_PORTARIA_CA })),
        },
      );
    }
    return conforme;
  },
};

/**
 * RN-116 — um contrato tem de ter, a todo o tempo, pelo menos um gestor em
 * funções. Não é burocracia de formulário: as decisões que a aplicação levanta
 * têm destinatário, e um contrato sem gestor produz decisões que não chegam a
 * ninguém. Quem cessou funções conta para o histórico, não para o mínimo.
 */
export const RN_116: Regra<{ gestoresEmFuncoes: number }> = {
  codigo: 'RN-116',
  descricao: 'O contrato tem de ter pelo menos um gestor em funções.',
  requisito: 'novo',
  base: 'Sem gestor designado não há a quem dirigir as decisões de execução nem quem responda por elas.',
  excecaoFundamentavel: false,
  avaliar({ gestoresEmFuncoes }) {
    if (gestoresEmFuncoes < 1) {
      return violada('Designe pelo menos um gestor para o contrato.');
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
  RN_110,
  RN_111,
  RN_112,
  RN_113,
  RN_114,
  RN_115,
  RN_116,
] as const;
