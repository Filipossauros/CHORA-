import { ErroAutenticacao, type ContextoUtilizador, type TokenValidator } from './token-validator.js';

/**
 * AdoConnectionDataValidator — protótipo integrado (secção 9.2). Valida o token
 * chamando a REST API do Azure DevOps em nome do portador. Stub: a integração
 * real fica para o desenvolvimento final; a interface está definida para encaixe.
 */
export class AdoConnectionDataValidator implements TokenValidator {
  constructor(private readonly baseUrl: string) {}

  async validar(_token: string, _contextoProjeto?: string): Promise<ContextoUtilizador> {
    throw new ErroAutenticacao(
      `AdoConnectionDataValidator não implementado no protótipo (base: ${this.baseUrl}). Ver secção 9.2.`,
    );
  }
}

/**
 * EntraIdJwtValidator — candidato para produção (secção 9.2). Valida o JWT contra
 * o tenant (JWKS, iss, aud, exp). Stub: requer app registration próprio.
 */
export class EntraIdJwtValidator implements TokenValidator {
  constructor(
    private readonly tenantId: string,
    private readonly audience: string,
  ) {}

  async validar(_token: string, _contextoProjeto?: string): Promise<ContextoUtilizador> {
    throw new ErroAutenticacao(
      `EntraIdJwtValidator não implementado no protótipo (tenant: ${this.tenantId}, aud: ${this.audience}). Ver secção 9.2.`,
    );
  }
}
