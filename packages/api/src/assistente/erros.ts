/**
 * Pedido de esclarecimento — não é um erro, é uma pergunta de volta.
 *
 * Quando mais do que uma entidade corresponde ao que foi dito, ou quando falta
 * um dado que só o utilizador sabe, a resposta certa é perguntar. Recusar
 * («indique o número do contrato») empurra o trabalho de desambiguação para
 * quem perguntou; adivinhar age sobre a entidade errada. Perguntar com as
 * opções à frente resolve em um clique.
 */
export class ErroEsclarecimento extends Error {
  constructor(
    readonly pergunta: string,
    /** Cada opção traz os parâmetros que a escolha fixa. */
    readonly opcoes: Array<{ rotulo: string; detalhe?: string; parametros: Record<string, unknown> }>,
  ) {
    super(pergunta);
    this.name = 'ErroEsclarecimento';
  }
}
