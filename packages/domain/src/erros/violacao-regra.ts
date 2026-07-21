import type { Regra, ResultadoRegra } from './regra.js';

/**
 * Erro de infraestrutura que transporta uma violação de regra de negócio até à
 * fronteira da API, onde é serializado como `application/problem+json` (ADR-06,
 * secção 8.2). O front-end e os testes referenciam o `codigo` da regra, não a
 * string da mensagem.
 */
export class ViolacaoRegra extends Error {
  readonly codigo: string;
  readonly requisito: string;
  readonly base: string;
  readonly excecaoFundamentavel: boolean;
  readonly dados: Record<string, unknown> | undefined;

  constructor(
    regra: Pick<Regra<unknown>, 'codigo' | 'requisito' | 'base' | 'excecaoFundamentavel'>,
    mensagem: string,
    dados?: Record<string, unknown>,
  ) {
    super(mensagem);
    this.name = 'ViolacaoRegra';
    this.codigo = regra.codigo;
    this.requisito = regra.requisito;
    this.base = regra.base;
    this.excecaoFundamentavel = regra.excecaoFundamentavel;
    this.dados = dados;
  }
}

/**
 * Avalia uma regra sobre um contexto e lança `ViolacaoRegra` se não for cumprida.
 * Usado pelos serviços da API para converter o resultado puro do domínio num
 * erro que a camada HTTP mapeia para `422`.
 */
export function exigir<Ctx>(regra: Regra<Ctx>, ctx: Ctx): void {
  const r: ResultadoRegra = regra.avaliar(ctx);
  if (!r.ok) {
    throw new ViolacaoRegra(regra, r.mensagem, r.dados);
  }
}
