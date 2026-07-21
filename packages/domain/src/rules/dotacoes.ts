import type { Cent } from '../tipos/primitivos.js';
import type { TipoDotacao } from '../enums/index.js';
import { conforme, violada, type Regra } from '../erros/regra.js';

const LIMITE_COMPLEMENTARES = 0.5; // 50 %

/** RN-301 — serviços complementares ≤ 50 % do precoContratualInicial. */
export const RN_301: Regra<{ precoContratualInicial: Cent; complementaresAcumulados: Cent }> = {
  codigo: 'RN-301',
  descricao:
    'O valor acumulado de serviços complementares não pode exceder 50 % do preço contratual inicial.',
  requisito: 'RF7 (corrigido)',
  base: 'CCP, art. 370.º n.º 4. A base é o preço contratual inicial, não a soma de horas base com bolsa.',
  excecaoFundamentavel: false,
  avaliar({ precoContratualInicial, complementaresAcumulados }) {
    const limite = Math.floor(precoContratualInicial * LIMITE_COMPLEMENTARES);
    if (complementaresAcumulados > limite) {
      return violada(
        'O valor acumulado de serviços complementares excede 50 % do preço contratual inicial.',
        { limite, acumulado: complementaresAcumulados },
      );
    }
    return conforme;
  },
};

/** RN-302 — alertar aos 40 % e 45 % do limite de serviços complementares (aviso). */
export const RN_302: Regra<{ precoContratualInicial: Cent; complementaresAcumulados: Cent }> = {
  codigo: 'RN-302',
  descricao: 'Alertar aos 40 % e aos 45 % de consumo do limite de serviços complementares.',
  requisito: 'novo',
  base: 'Prevenção de reparo em auditoria.',
  excecaoFundamentavel: false,
  bloqueia: false,
  avaliar({ precoContratualInicial, complementaresAcumulados }) {
    if (precoContratualInicial <= 0) {
      return conforme;
    }
    const percentagem = complementaresAcumulados / precoContratualInicial;
    if (percentagem >= 0.4) {
      return violada('Consumo de serviços complementares atingiu o limiar de alerta.', {
        percentagem,
      });
    }
    return conforme;
  },
};

/** RN-303 — registar contra BOLSA_VALOR exige perfil com consomeBolsaValor. */
export const RN_303: Regra<{ tipoDotacao: TipoDotacao; consomeBolsaValor: boolean }> = {
  codigo: 'RN-303',
  descricao: 'Registar tempo contra BOLSA_VALOR exige perfil com consomeBolsaValor = true.',
  requisito: 'RF8',
  base: '—',
  excecaoFundamentavel: false,
  avaliar({ tipoDotacao, consomeBolsaValor }) {
    if (tipoDotacao === 'BOLSA_VALOR' && !consomeBolsaValor) {
      return violada('O perfil não consome bolsa de valor; não pode registar contra BOLSA_VALOR.');
    }
    return conforme;
  },
};

/** RN-304 — registar contra TRABALHOS_COMPLEMENTARES exige perfil com consomeTrabalhosComplementares. */
export const RN_304: Regra<{
  tipoDotacao: TipoDotacao;
  consomeTrabalhosComplementares: boolean;
}> = {
  codigo: 'RN-304',
  descricao:
    'Registar tempo contra TRABALHOS_COMPLEMENTARES exige perfil com consomeTrabalhosComplementares = true.',
  requisito: 'RF9',
  base: '—',
  excecaoFundamentavel: false,
  avaliar({ tipoDotacao, consomeTrabalhosComplementares }) {
    if (tipoDotacao === 'TRABALHOS_COMPLEMENTARES' && !consomeTrabalhosComplementares) {
      return violada(
        'O perfil não consome trabalhos complementares; não pode registar contra TRABALHOS_COMPLEMENTARES.',
      );
    }
    return conforme;
  },
};

/** RN-305 — SERVICOS_COMPLEMENTARES cria dotação correspondente e atualiza precoContratualAtual. */
export const RN_305: Regra<{ criaDotacao: boolean; atualizaPrecoAtual: boolean }> = {
  codigo: 'RN-305',
  descricao:
    'Uma alteração de SERVICOS_COMPLEMENTARES cria obrigatoriamente uma Dotacao correspondente e atualiza precoContratualAtual.',
  requisito: 'RF12',
  base: '—',
  excecaoFundamentavel: false,
  avaliar({ criaDotacao, atualizaPrecoAtual }) {
    if (!criaDotacao || !atualizaPrecoAtual) {
      return violada(
        'Serviços complementares têm de criar a dotação correspondente e atualizar o preço contratual atual.',
      );
    }
    return conforme;
  },
};

/** RN-306 — alterações objetivas ficam "por publicitar" até registo no Portal BASE (aviso). */
export const RN_306: Regra<{ obrigatoria: boolean; efetuadaEm: string | undefined }> = {
  codigo: 'RN-306',
  descricao:
    'Alterações objetivas ao contrato ficam marcadas como "por publicitar" até registo de publicitação no Portal BASE.',
  requisito: 'novo',
  base: 'CCP, art. 315.º e 465.º: a publicitação é condição de eficácia. Sinalizar, não bloquear.',
  excecaoFundamentavel: false,
  bloqueia: false,
  avaliar({ obrigatoria, efetuadaEm }) {
    if (obrigatoria && efetuadaEm === undefined) {
      return violada('Alteração por publicitar no Portal BASE.');
    }
    return conforme;
  },
};

export const REGRAS_DOTACOES = [RN_301, RN_302, RN_303, RN_304, RN_305, RN_306] as const;
