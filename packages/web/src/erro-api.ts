/** Erro apresentável (modo HTTP). Em modo local, os serviços lançam ViolacaoRegra. */
export class ErroApi extends Error {
  constructor(readonly mensagem: string, readonly regra?: string, readonly status?: number) {
    super(mensagem);
    this.name = 'ErroApi';
  }
}
