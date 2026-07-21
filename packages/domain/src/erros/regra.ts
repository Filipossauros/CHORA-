/**
 * Motor de regras (secção 6).
 *
 * Cada regra RN-xxx é uma função pura testada. As regras devolvem `ResultadoRegra`
 * — nunca lançam exceções para fluxo de negócio (secção 15). A conversão para
 * erro HTTP `application/problem+json` (ADR-06) acontece na fronteira da API.
 */

export type ResultadoRegra =
  | { ok: true }
  | { ok: false; mensagem: string; dados?: Record<string, unknown> };

/** Construtor de resultado positivo. */
export const conforme: ResultadoRegra = { ok: true };

/** Construtor de resultado negativo (violação). */
export function violada(mensagem: string, dados?: Record<string, unknown>): ResultadoRegra {
  return dados === undefined ? { ok: false, mensagem } : { ok: false, mensagem, dados };
}

/**
 * Descritor de uma regra de negócio. O contexto `Ctx` é o mínimo necessário para
 * a avaliar — mantém as regras puras e testáveis isoladamente.
 */
export interface Regra<Ctx> {
  readonly codigo: string;
  readonly descricao: string;
  /** Requisito funcional de origem (ex.: 'RF7'), ou 'novo'. */
  readonly requisito: string;
  /** Base legal ou nota. */
  readonly base: string;
  /** Se o bloqueio é ultrapassável mediante fundamentação registada (ADR-10). */
  readonly excecaoFundamentavel: boolean;
  /**
   * Se a regra bloqueia a operação (`true`, por omissão) ou é meramente
   * consultiva e gera aviso/alerta sem impedir a mutação (`false`). Ver ADR-11.
   * As regras consultivas são avaliadas pelos jobs de alerta (secção 11) e não
   * por `exigir()`.
   */
  readonly bloqueia?: boolean;
  avaliar(ctx: Ctx): ResultadoRegra;
}

/** Metadados de uma regra, sem a função de avaliação. Usado na geração de docs. */
export type MetadadosRegra = Omit<Regra<unknown>, 'avaliar'>;

export function metadados<Ctx>(r: Regra<Ctx>): MetadadosRegra {
  return {
    codigo: r.codigo,
    descricao: r.descricao,
    requisito: r.requisito,
    base: r.base,
    excecaoFundamentavel: r.excecaoFundamentavel,
  };
}
