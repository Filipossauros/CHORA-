import type { PapelAplicacional } from '../enums/index.js';
import type { Cent, Minutos } from '../tipos/primitivos.js';
import { conforme, violada, type Regra } from '../erros/regra.js';

const PAPEIS_QUE_APROVAM: ReadonlyArray<PapelAplicacional> = ['GESTOR_CONTRATO', 'GESTOR_TECNICO'];

/** RN-501 — aprovação é competência de GESTOR_CONTRATO ou GESTOR_TECNICO; perfilDeGestao não confere poder. */
export const RN_501: Regra<{ papel: PapelAplicacional }> = {
  codigo: 'RN-501',
  descricao:
    'A aprovação de registos é competência de GESTOR_CONTRATO ou GESTOR_TECNICO — papéis aplicacionais do contraente público. A flag perfilDeGestao não confere poder de aprovação.',
  requisito: 'RF5 (corrigido)',
  base: 'A aprovação é ato do contraente público; não pode depender de um perfil do adjudicatário.',
  excecaoFundamentavel: false,
  avaliar({ papel }) {
    if (!PAPEIS_QUE_APROVAM.includes(papel)) {
      return violada('O papel indicado não tem competência para aprovar registos.', { papel });
    }
    return conforme;
  },
};

/** RN-502 — ninguém aprova os seus próprios registos. */
export const RN_502: Regra<{ aprovadorId: string; recursoIdRegisto: string }> = {
  codigo: 'RN-502',
  descricao: 'Ninguém aprova os seus próprios registos.',
  requisito: 'novo',
  base: 'Segregação de funções.',
  excecaoFundamentavel: false,
  avaliar({ aprovadorId, recursoIdRegisto }) {
    if (aprovadorId === recursoIdRegisto) {
      return violada('Não é possível aprovar registos próprios.');
    }
    return conforme;
  },
};

/** RN-503 — aprovar não pode exceder o total de horas do perfil. */
export const RN_503: Regra<{
  minutosDisponiveis: Minutos;
  minutosAAprovar: Minutos;
}> = {
  codigo: 'RN-503',
  descricao:
    'Não é possível aprovar registos que façam exceder o total de horas do perfil (horas base + bolsa + complementares).',
  requisito: 'RF23',
  base: '—',
  excecaoFundamentavel: false,
  avaliar({ minutosDisponiveis, minutosAAprovar }) {
    if (minutosAAprovar > minutosDisponiveis) {
      return violada(
        'A aprovação faria exceder o total de horas disponíveis do perfil.',
        { minutosDisponiveis, minutosAAprovar },
      );
    }
    return conforme;
  },
};

/** RN-504 — aprovar não pode exceder o valor disponível do perfil ou do contrato. */
export const RN_504: Regra<{
  valorDisponivelPerfil: Cent;
  valorDisponivelContrato: Cent;
  valorAAprovar: Cent;
}> = {
  codigo: 'RN-504',
  descricao:
    'Não é possível aprovar registos que façam exceder o valor disponível do perfil ou do contrato.',
  requisito: 'novo',
  base: 'Horas e valor divergem sempre que há revisão de preços.',
  excecaoFundamentavel: false,
  avaliar({ valorDisponivelPerfil, valorDisponivelContrato, valorAAprovar }) {
    if (valorAAprovar > valorDisponivelPerfil) {
      return violada('A aprovação faria exceder o valor disponível do perfil.', {
        valorDisponivelPerfil,
        valorAAprovar,
      });
    }
    if (valorAAprovar > valorDisponivelContrato) {
      return violada('A aprovação faria exceder o valor disponível do contrato.', {
        valorDisponivelContrato,
        valorAAprovar,
      });
    }
    return conforme;
  },
};

/** RN-505 — alertar quando o consumo de um perfil atingir 80 % e 90 % (aviso). */
export const RN_505: Regra<{ percentagemHoras: number; percentagemValor: number }> = {
  codigo: 'RN-505',
  descricao: 'Alertar quando o consumo de um perfil atingir 80 % e 90 % de horas ou de valor.',
  requisito: 'novo',
  base: '—',
  excecaoFundamentavel: false,
  bloqueia: false,
  avaliar({ percentagemHoras, percentagemValor }) {
    if (percentagemHoras >= 0.8 || percentagemValor >= 0.8) {
      return violada('Consumo do perfil atingiu limiar de alerta (≥ 80 %).', {
        percentagemHoras,
        percentagemValor,
      });
    }
    return conforme;
  },
};

/** RN-506 — na aprovação, congelar valorHoraAplicado (preço vigente na data do registo) e valorImputado. */
export const RN_506: Regra<{
  valorHoraVigente: Cent | null;
  valorHoraAplicado: Cent;
  valorImputadoEsperado: Cent;
  valorImputado: Cent;
}> = {
  codigo: 'RN-506',
  descricao:
    'Na aprovação, congelar valorHoraAplicado (preço vigente na data do registo) e valorImputado.',
  requisito: 'ADR-09',
  base: 'Garante estabilidade histórica dos relatórios.',
  excecaoFundamentavel: false,
  avaliar({ valorHoraVigente, valorHoraAplicado, valorImputadoEsperado, valorImputado }) {
    if (valorHoraVigente === null) {
      return violada('Não existe preço/hora vigente para o perfil na data do registo.');
    }
    if (valorHoraAplicado !== valorHoraVigente) {
      return violada('O valor/hora aplicado não corresponde ao preço vigente na data do registo.', {
        valorHoraVigente,
        valorHoraAplicado,
      });
    }
    if (valorImputado !== valorImputadoEsperado) {
      return violada('O valor imputado não corresponde ao cálculo esperado.', {
        valorImputadoEsperado,
        valorImputado,
      });
    }
    return conforme;
  },
};

/** RN-507 — registos aprovados são tecnicamente imutáveis. */
export const RN_507: Regra<{ estadoAtual: string; estadoAlvo: string }> = {
  codigo: 'RN-507',
  descricao:
    'Registos aprovados são tecnicamente imutáveis: leitura, exportação e consulta histórica apenas.',
  requisito: 'RNF11',
  base: '—',
  excecaoFundamentavel: false,
  avaliar({ estadoAtual, estadoAlvo }) {
    if (estadoAtual === 'APROVADO' && estadoAlvo !== 'ANULADO') {
      return violada('Um registo aprovado só pode transitar para ANULADO.', {
        estadoAtual,
        estadoAlvo,
      });
    }
    return conforme;
  },
};

/** RN-508 — o gestor pode anular registos aprovados; anulação lógica com autor, data e motivo. */
export const RN_508: Regra<{ papel: PapelAplicacional; motivo: string }> = {
  codigo: 'RN-508',
  descricao:
    'O gestor pode anular registos aprovados. A anulação é lógica (ANULADO), com autor, data e motivo obrigatórios. Nunca eliminação física.',
  requisito: 'requisito sem número + RNF11',
  base: 'Resolve a contradição do documento original. ADR-08.',
  excecaoFundamentavel: false,
  avaliar({ papel, motivo }) {
    if (!PAPEIS_QUE_APROVAM.includes(papel)) {
      return violada('Só um gestor pode anular registos aprovados.', { papel });
    }
    if (motivo.trim().length === 0) {
      return violada('A anulação exige motivo.');
    }
    return conforme;
  },
};

/** RN-509 — não aprovar registos de contrato com visto do TdC necessário e não obtido, se suportar faturação. */
export const RN_509: Regra<{
  vistoNecessario: boolean;
  vistoObtido: boolean;
  vistoTacito: boolean;
  suportaFaturacao: boolean;
}> = {
  codigo: 'RN-509',
  descricao:
    'Não é possível aprovar registos de contrato cujo visto do Tribunal de Contas seja necessário e ainda não obtido, se essa aprovação suportar faturação.',
  requisito: 'novo',
  base: 'Nos contratos sujeitos a fiscalização prévia, os efeitos financeiros dependem do visto.',
  excecaoFundamentavel: false,
  avaliar({ vistoNecessario, vistoObtido, vistoTacito, suportaFaturacao }) {
    if (vistoNecessario && !vistoObtido && !vistoTacito && suportaFaturacao) {
      return violada(
        'Não é possível aprovar registos que suportem faturação sem o visto do Tribunal de Contas.',
      );
    }
    return conforme;
  },
};

export const REGRAS_APROVACAO = [
  RN_501,
  RN_502,
  RN_503,
  RN_504,
  RN_505,
  RN_506,
  RN_507,
  RN_508,
  RN_509,
] as const;
