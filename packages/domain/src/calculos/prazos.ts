import type { Contrato } from '../entidades/contrato.js';
import type { Alteracao } from '../entidades/estrutura.js';
import type { DataISO } from '../tipos/primitivos.js';
import { adicionarDias, diasEntre, mesesEntre } from '../tipos/tempo.js';

/**
 * Cálculo de prazos de vigência e de execução (RN-201..RN-208).
 *
 * O prazo de VIGÊNCIA e o prazo de EXECUÇÃO são grandezas distintas (RN-204).
 * As suspensões com `suspendePrazoExecucao = true` deslocam o prazo de execução
 * pelo período suspenso; a vigência é medida em calendário.
 */

export const LIMITE_VIGENCIA_MESES = 36;

/** Períodos de suspensão de um contrato, extraídos das alterações. */
export interface PeriodoSuspensao {
  dataInicio: DataISO;
  dataFim: DataISO | undefined;
  suspendePrazoExecucao: boolean;
}

export function periodosSuspensao(alteracoes: ReadonlyArray<Alteracao>): PeriodoSuspensao[] {
  return alteracoes
    .filter((a) => a.tipo === 'SUSPENSAO' && a.suspensao !== undefined)
    .map((a) => {
      const s = a.suspensao;
      if (s === undefined) {
        throw new Error('Suspensão sem dados'); // inalcançável após o filtro
      }
      return {
        dataInicio: s.dataInicio,
        dataFim: s.dataFim,
        suspendePrazoExecucao: s.suspendePrazoExecucao,
      };
    });
}

/**
 * Vigência do contrato em meses, de dataInicioVigencia a dataTerminoContratual.
 */
export function vigenciaEmMeses(contrato: Contrato): number {
  return mesesEntre(contrato.dataInicioVigencia, contrato.dataTerminoContratual);
}

/** Verdadeiro se a vigência (incluindo prorrogações) excede os 36 meses (RN-202). */
export function excedeLimiteVigencia(contrato: Contrato): boolean {
  return vigenciaEmMeses(contrato) > LIMITE_VIGENCIA_MESES;
}

/**
 * Visto prévio do Tribunal de Contas assegurado para efeitos de EXECUÇÃO.
 * Um contrato que exija visto prévio só pode iniciar execução (estar EM_VIGOR)
 * quando o visto está assegurado: obtido (data de obtenção preenchida) ou tácito.
 */
export function vistoAssegurado(contrato: Contrato): boolean {
  if (!contrato.vistoTribunalContasNecessario) return true;
  if (contrato.dataVistoTribunalContas !== undefined) return true;
  if (contrato.vistoTacito === true) return true;
  return false;
}

/** Total de dias suspensos que deslocam o prazo de execução (RN-204). */
export function diasSuspensaoExecucao(
  alteracoes: ReadonlyArray<Alteracao>,
  referencia: DataISO,
): number {
  return periodosSuspensao(alteracoes)
    .filter((p) => p.suspendePrazoExecucao)
    .reduce((total, p) => {
      const fim = p.dataFim ?? referencia;
      return total + Math.max(0, diasEntre(p.dataInicio, fim));
    }, 0);
}

/**
 * Data de término de execução ajustada pelas suspensões que deslocam o prazo de
 * execução. NÃO altera a vigência (RN-204).
 */
export function terminoExecucaoAjustado(
  contrato: Contrato,
  alteracoes: ReadonlyArray<Alteracao>,
): DataISO {
  const dias = diasSuspensaoExecucao(alteracoes, contrato.dataTerminoContratual);
  return adicionarDias(contrato.dataTerminoContratual, dias);
}

/**
 * Verdadeiro se dois períodos de suspensão se sobrepõem (RN-205).
 * Um período aberto (sem dataFim) estende-se indefinidamente.
 */
export function suspensoesSobrepoem(a: PeriodoSuspensao, b: PeriodoSuspensao): boolean {
  const aFim = a.dataFim ?? '9999-12-31';
  const bFim = b.dataFim ?? '9999-12-31';
  return a.dataInicio <= bFim && b.dataInicio <= aFim;
}

/** Meses restantes até ao término contratual, a partir de uma data de referência. */
export function mesesAteTermino(contrato: Contrato, referencia: DataISO): number {
  return mesesEntre(referencia, contrato.dataTerminoContratual);
}

/**
 * Vigência LÍQUIDA em meses: a vigência de calendário descontada dos períodos de
 * suspensão que suspendem o prazo de execução (o relógio pára durante a
 * suspensão). É esta a grandeza confrontada com o limite de 36 meses (RN-202)
 * quando se fixa uma nova data de vigência.
 */
export function vigenciaLiquidaMeses(
  dataInicioVigencia: DataISO,
  dataTermino: DataISO,
  alteracoes: ReadonlyArray<Alteracao>,
): number {
  const diasSuspensos = diasSuspensaoExecucao(alteracoes, dataTermino);
  const bruta = mesesEntre(dataInicioVigencia, dataTermino);
  return Math.max(0, bruta - diasSuspensos / DIAS_POR_MES);
}

/** Aproximação de dias por mês usada para converter suspensões em meses. */
const DIAS_POR_MES = 30.436875;

/**
 * Último ano económico coberto pela portaria de extensão de encargos (repartição
 * plurianual). `undefined` quando não há portaria com repartição anual detalhada.
 */
export function anoFinalPortaria(contrato: Contrato): number | undefined {
  const rep = contrato.portariaExtensaoEncargos?.reparticaoAnual;
  if (rep === undefined || rep.length === 0) return undefined;
  return rep.reduce((max, r) => (r.ano > max ? r.ano : max), rep[0]!.ano);
}

/**
 * Verdadeiro quando o contrato tem portaria de extensão de encargos mas a sua
 * vigência (ano do término contratual) ultrapassa o último ano coberto pela
 * repartição plurianual — é necessário pedir a reprogramação da portaria
 * (AL-PORTARIA-REPROGRAMAR).
 */
export function portariaExigeReprogramacao(contrato: Contrato): boolean {
  const anoFinal = anoFinalPortaria(contrato);
  if (anoFinal === undefined) return false;
  const anoTermino = Number(contrato.dataTerminoContratual.slice(0, 4));
  return anoTermino > anoFinal;
}

/**
 * Fim efetivo de vigência (RN-203): o primeiro de dataTerminoContratual ou a
 * data de esgotamento das horas/valor disponíveis, quando esta for conhecida.
 */
export function fimEfetivoVigencia(
  contrato: Contrato,
  dataEsgotamento?: DataISO,
): DataISO {
  if (dataEsgotamento === undefined) {
    return contrato.dataTerminoContratual;
  }
  return dataEsgotamento < contrato.dataTerminoContratual
    ? dataEsgotamento
    : contrato.dataTerminoContratual;
}
