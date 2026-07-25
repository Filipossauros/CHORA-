import type { SeveridadeAlerta } from '../enums/index.js';
import type { DataISO } from '../tipos/primitivos.js';
import { adicionarDias, diasEntre } from '../tipos/tempo.js';
import { valorLegal } from '../legal/base-legal.js';

/**
 * JANELA DE DECISÃO — o conceito central da camada de alertas.
 *
 * Um alerta útil não responde a "o que está mau" mas a "até quando tenho de
 * agir". A data-limite calcula-se PARA TRÁS a partir do evento-âncora (o fecho
 * do ano económico, o início do ano a cobrir, o término da vigência),
 * descontando o prazo de instrução do ato — que vem da base legal versionada e
 * é ajustável sem tocar aqui.
 *
 * A severidade deixa de ser fixa: escala à medida que a janela se fecha.
 */
export interface JanelaDecisao {
  /** Data-limite para iniciar/instruir o ato. */
  dataLimiteAcao: DataISO;
  /** Dias até à data-limite; negativo quando já passou. */
  diasParaLimite: number;
  /** Evento a que a janela se refere, em linguagem de gestão. */
  eventoAncora: string;
  /** Severidade derivada da proximidade da janela. */
  severidade: SeveridadeAlerta;
}

/** Fim do ano económico — coincide com o ano civil. */
export function fimAnoEconomico(referencia: DataISO): DataISO {
  return `${referencia.slice(0, 4)}-12-31`;
}

/** Início do ano económico seguinte ao da data indicada. */
export function inicioAnoSeguinte(referencia: DataISO): DataISO {
  return `${Number(referencia.slice(0, 4)) + 1}-01-01`;
}

/**
 * Severidade em função dos dias que faltam para a data-limite:
 * já passou ou é iminente (≤ 15 dias) → CRÍTICO; a aproximar-se (≤ 45) → AVISO;
 * ainda com folga → INFO.
 */
export function severidadePorJanela(diasParaLimite: number): SeveridadeAlerta {
  if (diasParaLimite <= 15) return 'CRITICO';
  if (diasParaLimite <= 45) return 'AVISO';
  return 'INFO';
}

/**
 * Constrói a janela de decisão recuando `diasInstrucao` a partir do evento.
 */
export function janelaDecisao(
  hoje: DataISO,
  dataEvento: DataISO,
  diasInstrucao: number,
  eventoAncora: string,
): JanelaDecisao {
  const dataLimiteAcao = adicionarDias(dataEvento, -diasInstrucao);
  const diasParaLimite = diasEntre(hoje, dataLimiteAcao);
  return { dataLimiteAcao, diasParaLimite, eventoAncora, severidade: severidadePorJanela(diasParaLimite) };
}

/** Janela para pedir a transição de saldo antes do fecho do ano económico. */
export function janelaTransicaoAno(hoje: DataISO): JanelaDecisao {
  return janelaDecisao(hoje, fimAnoEconomico(hoje), valorLegal('INSTRUCAO_TRANSICAO_DIAS', 45), 'fecho do ano económico');
}

/** Janela para instruir a reprogramação da portaria de extensão de encargos. */
export function janelaReprogramacaoPortaria(hoje: DataISO, anoACobrir: number): JanelaDecisao {
  return janelaDecisao(hoje, `${anoACobrir}-01-01`, valorLegal('INSTRUCAO_PORTARIA_DIAS', 75), `início do ano económico de ${anoACobrir}`);
}

/** Janela para instruir uma modificação objetiva com efeitos numa dada data. */
export function janelaModificacao(hoje: DataISO, dataEfeitos: DataISO): JanelaDecisao {
  return janelaDecisao(hoje, dataEfeitos, valorLegal('INSTRUCAO_MODIFICACAO_DIAS', 30), 'produção de efeitos da modificação');
}

/**
 * Janela para lançar um novo procedimento a tempo de haver contrato quando o
 * atual terminar. Soma a duração do procedimento e, se houver fiscalização
 * prévia, o acréscimo do visto do Tribunal de Contas.
 */
export function janelaNovoProcedimento(hoje: DataISO, dataTermino: DataISO, exigeVistoPrevio: boolean): JanelaDecisao {
  const meses = valorLegal('INSTRUCAO_PROCEDIMENTO_MESES', 5) + (exigeVistoPrevio ? valorLegal('INSTRUCAO_VISTO_MESES', 3) : 0);
  const dias = Math.round(meses * 30.436875);
  return janelaDecisao(hoje, dataTermino, dias, 'término da vigência do contrato');
}
