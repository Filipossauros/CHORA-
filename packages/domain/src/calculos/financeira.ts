import type { Contrato } from '../entidades/contrato.js';
import type { Dotacao, Alteracao, PerfilContratual } from '../entidades/estrutura.js';
import type { Fatura } from '../entidades/faturacao.js';
import type { Entregavel } from '../entidades/entregavel.js';
import type { Cent } from '../tipos/primitivos.js';

/**
 * Cálculos de execução financeira (secção 10.3 — Execução financeira;
 * RN-105, RN-301, RN-607).
 */

/** Soma do valor de todas as dotações. */
export function totalDotacoes(dotacoes: ReadonlyArray<Dotacao>): Cent {
  return dotacoes.reduce((s, d) => s + d.valor, 0);
}

/**
 * Valor previsto de um perfil = quantidade prevista (minutos) × valor/hora mais
 * recente da série. Usa-se o último preço vigente como estimativa de topo.
 */
export function valorPrevistoPerfil(perfil: PerfilContratual): Cent {
  if (perfil.precos.length === 0) {
    return 0;
  }
  const ultimo = perfil.precos.reduce((mais, p) =>
    p.vigenteDe > mais.vigenteDe ? p : mais,
  );
  return Math.round((perfil.quantidadePrevista * ultimo.valorHora) / 60);
}

/** Soma do valor previsto de todos os perfis. */
export function totalPrevistoPerfis(perfis: ReadonlyArray<PerfilContratual>): Cent {
  return perfis.reduce((s, p) => s + valorPrevistoPerfil(p), 0);
}

/**
 * Valor acumulado de serviços complementares, a partir das alterações do tipo
 * SERVICOS_COMPLEMENTARES (RN-301). Base de comparação: precoContratualInicial.
 */
export function complementaresAcumulados(alteracoes: ReadonlyArray<Alteracao>): Cent {
  return alteracoes
    .filter((a) => a.tipo === 'SERVICOS_COMPLEMENTARES')
    .reduce((s, a) => s + (a.valorAcrescido ?? 0), 0);
}

/**
 * Percentagem de serviços complementares face ao preço contratual inicial.
 * 0..1 (ou >1 se exceder). Devolve 0 se o preço inicial for 0.
 */
export function percentagemComplementares(
  contrato: Contrato,
  alteracoes: ReadonlyArray<Alteracao>,
): number {
  if (contrato.precoContratualInicial <= 0) {
    return 0;
  }
  return complementaresAcumulados(alteracoes) / contrato.precoContratualInicial;
}

/**
 * Reparte o preço contratual de um contrato chave-na-mão pelas suas duas
 * parcelas: os entregáveis (preço fixo por resultado) e a bolsa de horas
 * (trabalhos não previstos).
 */
export interface ReparticaoChaveNaMao {
  totalEntregaveis: Cent;
  bolsaHorasValor: Cent;
  /** Parcela do preço ainda não atribuída a entregáveis nem à bolsa. */
  porAtribuir: Cent;
  entregues: Cent;
  faturados: Cent;
  /** Já entregue mas ainda por faturar — o que é possível faturar agora. */
  faturavelAgora: Cent;
}

export function repartirChaveNaMao(
  precoContratualAtual: Cent,
  entregaveis: ReadonlyArray<Entregavel>,
  bolsaHorasValor: Cent = 0,
): ReparticaoChaveNaMao {
  const totalEntregaveis = entregaveis.reduce((s, e) => s + e.valor, 0);
  const entregues = entregaveis.filter((e) => e.entregue).reduce((s, e) => s + e.valor, 0);
  const faturados = entregaveis.filter((e) => e.faturaId !== undefined).reduce((s, e) => s + e.valor, 0);
  return {
    totalEntregaveis, bolsaHorasValor,
    porAtribuir: Math.max(0, precoContratualAtual - totalEntregaveis - bolsaHorasValor),
    entregues, faturados,
    faturavelAgora: Math.max(0, entregues - faturados),
  };
}

/**
 * Converte uma percentagem do preço contratual no valor correspondente. O
 * registo guarda sempre o valor, para que a faturação tenha um montante único e
 * inequívoco contra o qual conferir (RN-609).
 */
export function valorDaPercentagem(precoContratual: Cent, percentagem: number): Cent {
  return Math.round(precoContratual * percentagem);
}

/** Fração do preço contratual que um valor representa (0..1). */
export function percentagemDoValor(precoContratual: Cent, valor: Cent): number {
  return precoContratual > 0 ? valor / precoContratual : 0;
}


/** Somatório dos montantes aprovados de um conjunto de faturas (RN-607). */
export function totalFaturado(faturas: ReadonlyArray<Fatura>): Cent {
  return faturas
    .filter((f) => f.estado === 'VALIDADA')
    .reduce((s, f) => s + (f.montanteAprovado ?? f.montanteSemIva), 0);
}
