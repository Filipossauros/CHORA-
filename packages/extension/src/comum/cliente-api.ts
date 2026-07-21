import type { Problema } from './tipos.js';

/**
 * Cliente da API REST (secção 10.4). Injeta o token, trata respostas
 * `application/problem+json` e traduz o código de regra para mensagem
 * apresentável. O front-end referencia códigos de regra, não strings (ADR-06).
 */
export class ErroApi extends Error {
  constructor(
    readonly problema: Problema,
    readonly status: number,
  ) {
    super(problema.detail);
    this.name = 'ErroApi';
  }

  /** Mensagem apresentável, priorizando o código de regra quando existe. */
  get mensagemApresentavel(): string {
    if (this.problema.regra !== undefined) {
      return `${this.problema.detail} (${this.problema.regra})`;
    }
    return this.problema.detail;
  }
}

export interface OpcoesCliente {
  baseUrl: string;
  obterToken: () => Promise<string>;
  projetoId?: string;
}

/**
 * Superfície do cliente usada pelas vistas. Permite duas implementações: a real
 * (`ClienteApi`, sobre HTTP) e a estática (`ClienteMemoria`, no browser, para o
 * GitHub Pages), ambas com o mesmo comportamento de erros `problem+json`.
 */
export interface IClienteApi {
  get<T>(caminho: string): Promise<T>;
  post<T>(caminho: string, corpo?: unknown): Promise<T>;
  patch<T>(caminho: string, corpo?: unknown): Promise<T>;
}

export class ClienteApi implements IClienteApi {
  constructor(private readonly opcoes: OpcoesCliente) {}

  private async pedir<T>(metodo: string, caminho: string, corpo?: unknown): Promise<T> {
    const token = await this.opcoes.obterToken();
    const cabecalhos: Record<string, string> = {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
    };
    if (this.opcoes.projetoId !== undefined) cabecalhos['X-Ado-Project'] = this.opcoes.projetoId;
    if (corpo !== undefined) cabecalhos['Content-Type'] = 'application/json';

    const resposta = await fetch(`${this.opcoes.baseUrl}${caminho}`, {
      method: metodo,
      headers: cabecalhos,
      ...(corpo !== undefined ? { body: JSON.stringify(corpo) } : {}),
    });

    if (!resposta.ok) {
      const problema = (await resposta.json().catch(() => ({
        type: 'about:blank', title: 'Erro', status: resposta.status, detail: resposta.statusText,
      }))) as Problema;
      throw new ErroApi(problema, resposta.status);
    }
    if (resposta.status === 204) return undefined as T;
    return (await resposta.json()) as T;
  }

  get<T>(caminho: string): Promise<T> {
    return this.pedir<T>('GET', caminho);
  }
  post<T>(caminho: string, corpo?: unknown): Promise<T> {
    return this.pedir<T>('POST', caminho, corpo);
  }
  patch<T>(caminho: string, corpo?: unknown): Promise<T> {
    return this.pedir<T>('PATCH', caminho, corpo);
  }
}
