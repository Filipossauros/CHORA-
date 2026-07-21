import type { Afetacao } from '../entidades/recursos.js';
import type { DataISO, InstanteISO, Minutos } from '../tipos/primitivos.js';
import type { PeriodoSuspensao } from '../calculos/prazos.js';
import { conforme, violada, type Regra } from '../erros/regra.js';
import {
  dentroDoIntervalo,
  diaDeInstante,
  ehFimDeSemana,
  ehFeriado,
} from '../tipos/tempo.js';

export const DURACAO_MAXIMA_DIARIA_MIN = 720; // RN-403, configurável
export const DURACAO_MINIMA_MIN = 15; // RN-405
export const INCREMENTO_MIN = 15; // RN-405

/** Afetação como aceite pelo contexto de validação (subconjunto). */
export interface AfetacaoContexto {
  contratoId: string;
  perfilId: string;
  recursoId: string;
  projetoIds: ReadonlyArray<string>;
  vigenteDe: DataISO;
  vigenteAte: DataISO | undefined;
  ativa: boolean;
}

/** RN-401 — só regista existindo afetação ativa (recurso/contrato/perfil/projeto) na data. */
export const RN_401: Regra<{
  afetacao: AfetacaoContexto | null;
  recursoId: string;
  contratoId: string;
  perfilId: string;
  projetoId: string;
  data: DataISO;
}> = {
  codigo: 'RN-401',
  descricao:
    'Só é possível registar tempo existindo Afetacao ativa do recurso ao contrato, ao perfil e ao projeto, na data do registo.',
  requisito: 'RF19',
  base: '—',
  excecaoFundamentavel: false,
  avaliar({ afetacao, recursoId, contratoId, perfilId, projetoId, data }) {
    if (afetacao === null) {
      return violada('Não existe afetação para o registo indicado.');
    }
    const corresponde =
      afetacao.ativa &&
      afetacao.recursoId === recursoId &&
      afetacao.contratoId === contratoId &&
      afetacao.perfilId === perfilId &&
      afetacao.projetoIds.includes(projetoId) &&
      dentroDoIntervalo(data, afetacao.vigenteDe, afetacao.vigenteAte);
    if (!corresponde) {
      return violada(
        'Não existe afetação ativa do recurso ao contrato/perfil/projeto na data do registo.',
        { recursoId, contratoId, perfilId, projetoId, data },
      );
    }
    return conforme;
  },
};

/** RN-402 — partição livre do tempo entre atividades no mesmo dia (invariante permissiva). */
export const RN_402: Regra<{ duracao: Minutos }> = {
  codigo: 'RN-402',
  descricao:
    'O elemento da equipa técnica pode particionar o tempo livremente entre atividades no mesmo dia.',
  requisito: 'RF20',
  base: '—',
  excecaoFundamentavel: false,
  avaliar({ duracao }) {
    if (duracao <= 0) {
      return violada('Cada partição de tempo tem de ter duração positiva.');
    }
    return conforme;
  },
};

/** RN-403 — soma diária ≤ máximo configurável (720 min); excedente exige justificação. */
export const RN_403: Regra<{
  minutosNoDia: Minutos;
  novaDuracao: Minutos;
  maximo?: Minutos;
  justificacao?: string;
}> = {
  codigo: 'RN-403',
  descricao:
    'A soma de durações de um recurso num dia não pode exceder um máximo configurável (720 min). Excedente exige justificação.',
  requisito: 'novo',
  base: 'Prevenção de incongruências na origem.',
  excecaoFundamentavel: false,
  avaliar({ minutosNoDia, novaDuracao, maximo = DURACAO_MAXIMA_DIARIA_MIN, justificacao }) {
    const total = minutosNoDia + novaDuracao;
    if (total > maximo && (justificacao === undefined || justificacao.trim().length === 0)) {
      return violada(
        `A soma diária (${total} min) excede o máximo de ${maximo} min sem justificação.`,
        { total, maximo },
      );
    }
    return conforme;
  },
};

/** RN-404 — registos em fim de semana ou feriado geram aviso (não bloqueio). */
export const RN_404: Regra<{ data: DataISO; feriadosMoveis?: ReadonlyArray<DataISO> }> = {
  codigo: 'RN-404',
  descricao:
    'Registos em fim de semana ou feriado nacional geram aviso (não bloqueio) e são assinalados nos relatórios.',
  requisito: 'novo',
  base: '—',
  excecaoFundamentavel: false,
  bloqueia: false,
  avaliar({ data, feriadosMoveis = [] }) {
    if (ehFimDeSemana(data) || ehFeriado(data, feriadosMoveis)) {
      return violada('Registo em fim de semana ou feriado.', { data });
    }
    return conforme;
  },
};

/** RN-405 — duração mínima 15 min; múltiplos de 15 min. */
export const RN_405: Regra<{ duracao: Minutos; minima?: Minutos; incremento?: Minutos }> = {
  codigo: 'RN-405',
  descricao: 'Duração mínima 15 min; múltiplos de 15 min.',
  requisito: 'novo',
  base: 'Configurável.',
  excecaoFundamentavel: false,
  avaliar({ duracao, minima = DURACAO_MINIMA_MIN, incremento = INCREMENTO_MIN }) {
    if (duracao < minima) {
      return violada(`A duração mínima é de ${minima} min.`, { duracao });
    }
    if (duracao % incremento !== 0) {
      return violada(`A duração tem de ser múltipla de ${incremento} min.`, { duracao });
    }
    return conforme;
  },
};

/** RN-406 — o próprio só altera/anula registos próprios em RASCUNHO ou SUBMETIDO. */
export const RN_406: Regra<{
  estado: string;
  autorId: string;
  utilizadorId: string;
}> = {
  codigo: 'RN-406',
  descricao:
    'O elemento da equipa técnica só pode alterar ou anular registos próprios em estado RASCUNHO ou SUBMETIDO. Após aprovação, imutável.',
  requisito: 'RF21',
  base: '—',
  excecaoFundamentavel: false,
  avaliar({ estado, autorId, utilizadorId }) {
    if (autorId !== utilizadorId) {
      return violada('Só é possível alterar ou anular registos próprios.');
    }
    if (estado !== 'RASCUNHO' && estado !== 'SUBMETIDO') {
      return violada(`Um registo em estado ${estado} não pode ser alterado pelo próprio.`, {
        estado,
      });
    }
    return conforme;
  },
};

/** RN-407 — o elemento da equipa técnica só visualiza os seus próprios registos. */
export const RN_407: Regra<{ papel: string; recursoIdRegisto: string; utilizadorId: string }> = {
  codigo: 'RN-407',
  descricao: 'O elemento da equipa técnica só visualiza os seus próprios registos.',
  requisito: 'RF22',
  base: '—',
  excecaoFundamentavel: false,
  avaliar({ papel, recursoIdRegisto, utilizadorId }) {
    if (papel === 'ELEMENTO_EQUIPA_TECNICA' && recursoIdRegisto !== utilizadorId) {
      return violada('Um elemento da equipa técnica só pode ver os seus próprios registos.');
    }
    return conforme;
  },
};

/** RN-408 — data dentro da vigência do contrato e do período da afetação. */
export const RN_408: Regra<{
  data: DataISO;
  vigenciaContratoDe: DataISO;
  vigenciaContratoAte: DataISO;
  afetacaoDe: DataISO;
  afetacaoAte: DataISO | undefined;
}> = {
  codigo: 'RN-408',
  descricao:
    'A data do registo tem de estar dentro da vigência do contrato e dentro do período da afetação.',
  requisito: 'RF24',
  base: '—',
  excecaoFundamentavel: false,
  avaliar({ data, vigenciaContratoDe, vigenciaContratoAte, afetacaoDe, afetacaoAte }) {
    if (!dentroDoIntervalo(data, vigenciaContratoDe, vigenciaContratoAte)) {
      return violada('A data do registo está fora da vigência do contrato.', { data });
    }
    if (!dentroDoIntervalo(data, afetacaoDe, afetacaoAte)) {
      return violada('A data do registo está fora do período da afetação.', { data });
    }
    return conforme;
  },
};

/** RN-409 — a data do registo não pode ser futura. */
export const RN_409: Regra<{ data: DataISO; agora: InstanteISO }> = {
  codigo: 'RN-409',
  descricao: 'A data do registo não pode ser futura.',
  requisito: 'novo',
  base: '—',
  excecaoFundamentavel: false,
  avaliar({ data, agora }) {
    const hoje = diaDeInstante(agora);
    if (data > hoje) {
      return violada('A data do registo não pode ser futura.', { data, hoje });
    }
    return conforme;
  },
};

/** RN-410 — a data não pode cair dentro de período de suspensão do contrato. */
export const RN_410: Regra<{ data: DataISO; suspensoes: ReadonlyArray<PeriodoSuspensao> }> = {
  codigo: 'RN-410',
  descricao: 'A data do registo não pode cair dentro de período de suspensão do contrato.',
  requisito: 'novo',
  base: '—',
  excecaoFundamentavel: false,
  avaliar({ data, suspensoes }) {
    const emSuspensao = suspensoes.some((s) => dentroDoIntervalo(data, s.dataInicio, s.dataFim));
    if (emSuspensao) {
      return violada('A data do registo cai dentro de um período de suspensão do contrato.', {
        data,
      });
    }
    return conforme;
  },
};

/** RN-411 — o work item indicado tem de pertencer ao projeto do registo. */
export const RN_411: Regra<{ projetoIdRegisto: string; projetoIdWorkItem: string | null }> = {
  codigo: 'RN-411',
  descricao: 'O work item indicado tem de pertencer ao projeto do registo.',
  requisito: 'novo',
  base: 'Validado contra a API do Azure DevOps.',
  excecaoFundamentavel: false,
  avaliar({ projetoIdRegisto, projetoIdWorkItem }) {
    if (projetoIdWorkItem === null) {
      return violada('O work item indicado não foi encontrado.');
    }
    if (projetoIdWorkItem !== projetoIdRegisto) {
      return violada('O work item indicado não pertence ao projeto do registo.', {
        projetoIdRegisto,
        projetoIdWorkItem,
      });
    }
    return conforme;
  },
};

export const REGRAS_REGISTO_TEMPO = [
  RN_401,
  RN_402,
  RN_403,
  RN_404,
  RN_405,
  RN_406,
  RN_407,
  RN_408,
  RN_409,
  RN_410,
  RN_411,
] as const;

// Reexport para uso conveniente em serviços que constroem o contexto a partir da entidade.
export type { Afetacao };
