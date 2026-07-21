import { ViolacaoRegra } from '@chora/domain';
import { ZodError } from 'zod';
import { ErroAutenticacao } from '../auth/token-validator.js';

/**
 * Erros de aplicação com estatuto HTTP associado. Convertem-se em
 * `application/problem+json` (secção 8.2). O front-end referencia códigos de
 * regra, não strings (ADR-06).
 */
export abstract class ErroHttp extends Error {
  abstract readonly status: number;
  abstract readonly type: string;
  abstract readonly title: string;
}

export class ErroNaoEncontrado extends ErroHttp {
  readonly status = 404;
  readonly type = 'https://chora.spms/erros/nao-encontrado';
  readonly title = 'Recurso não encontrado';
}

export class ErroProibido extends ErroHttp {
  readonly status = 403;
  readonly type = 'https://chora.spms/erros/papel-insuficiente';
  readonly title = 'Papel insuficiente';
}

export class ErroConflitoEstado extends ErroHttp {
  readonly status = 409;
  readonly type = 'https://chora.spms/erros/conflito-estado';
  readonly title = 'Conflito de estado';
}

export class ErroValidacao extends ErroHttp {
  readonly status = 400;
  readonly type = 'https://chora.spms/erros/validacao';
  readonly title = 'Pedido inválido';
  constructor(
    mensagem: string,
    readonly detalhes?: unknown,
  ) {
    super(mensagem);
  }
}

export interface Problema {
  type: string;
  title: string;
  status: number;
  detail: string;
  regra?: string;
  requisito?: string;
  base?: string;
  dados?: Record<string, unknown>;
  excecaoFundamentavel?: boolean;
  errosValidacao?: unknown;
  'X-Request-Id'?: string;
}

/** Converte qualquer erro num objeto `problem+json` e no respetivo estatuto. */
export function paraProblema(erro: unknown): { status: number; corpo: Problema } {
  if (erro instanceof ViolacaoRegra) {
    return {
      status: 422,
      corpo: {
        type: 'https://chora.spms/erros/violacao-regra',
        title: 'Violação de regra de negócio',
        status: 422,
        detail: erro.message,
        regra: erro.codigo,
        requisito: erro.requisito,
        base: erro.base,
        excecaoFundamentavel: erro.excecaoFundamentavel,
        ...(erro.dados !== undefined ? { dados: erro.dados } : {}),
      },
    };
  }

  if (erro instanceof ErroAutenticacao) {
    return {
      status: 401,
      corpo: {
        type: 'https://chora.spms/erros/nao-autenticado',
        title: 'Não autenticado',
        status: 401,
        detail: erro.message,
      },
    };
  }

  if (erro instanceof ErroHttp) {
    const corpo: Problema = {
      type: erro.type,
      title: erro.title,
      status: erro.status,
      detail: erro.message,
    };
    if (erro instanceof ErroValidacao && erro.detalhes !== undefined) {
      corpo.errosValidacao = erro.detalhes;
    }
    return { status: erro.status, corpo };
  }

  if (erro instanceof ZodError) {
    return {
      status: 400,
      corpo: {
        type: 'https://chora.spms/erros/validacao',
        title: 'Pedido inválido',
        status: 400,
        detail: 'Falha de validação de esquema.',
        errosValidacao: erro.issues,
      },
    };
  }

  const detail = erro instanceof Error ? erro.message : 'Erro interno';
  return {
    status: 500,
    corpo: {
      type: 'https://chora.spms/erros/interno',
      title: 'Erro interno',
      status: 500,
      detail,
    },
  };
}
