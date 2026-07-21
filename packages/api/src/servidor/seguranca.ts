import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { Contexto } from '../contexto.js';
import type { ContextoUtilizador } from '../auth/token-validator.js';
import { ErroAutenticacao } from '../auth/token-validator.js';
import { paraProblema } from '../erros/problema.js';

declare module 'fastify' {
  interface FastifyRequest {
    utilizador?: ContextoUtilizador;
    requestId: string;
  }
}

/**
 * Regista os ganchos transversais de segurança (secção 8.3):
 * - X-Request-Id em todas as respostas, propagado para a auditoria.
 * - Cache-Control: no-store e Pragma: no-cache em todas as respostas.
 * - Rejeição com 401 de qualquer token em query string (?token=/?access_token=).
 * - Autenticação obrigatória via Authorization: Bearer ou X-Dev-User.
 */
export function registarSeguranca(app: FastifyInstance, ctx: Contexto): void {
  app.addHook('onRequest', async (req: FastifyRequest, reply: FastifyReply) => {
    const idCabecalho = req.headers['x-request-id'];
    req.requestId = typeof idCabecalho === 'string' && idCabecalho.length > 0 ? idCabecalho : ctx.ids.novo('req');
    reply.header('X-Request-Id', req.requestId);
    reply.header('Cache-Control', 'no-store');
    reply.header('Pragma', 'no-cache');

    // Nunca aceitar credenciais em query string (secção 8.4).
    const q = req.query as Record<string, unknown> | undefined;
    if (q !== undefined && (q['token'] !== undefined || q['access_token'] !== undefined)) {
      await ctx.auditoria.registar({
        utilizadorId: 'desconhecido', entidade: 'Autenticacao', entidadeId: req.requestId,
        operacao: 'AUTENTICAR', resultado: 'NEGADO', regraViolada: 'SEC-TOKEN-QUERY',
        ...(req.ip !== undefined ? { ipOrigem: req.ip } : {}),
      });
      const { status, corpo } = paraProblema(new ErroAutenticacao('Credenciais em query string não são permitidas.'));
      await reply.status(status).type('application/problem+json').send(corpo);
    }
  });

  // Autenticação: aplicada a todas as rotas exceto as públicas de saúde.
  app.addHook('preHandler', async (req: FastifyRequest, reply: FastifyReply) => {
    if (req.url === '/saude' || req.url.startsWith('/saude?')) return;

    const auth = req.headers['authorization'];
    const devUser = req.headers['x-dev-user'];
    let token: string | undefined;
    if (typeof auth === 'string' && auth.toLowerCase().startsWith('bearer ')) {
      token = auth.slice(7).trim();
    } else if (typeof devUser === 'string') {
      token = devUser;
    }

    if (token === undefined || token.length === 0) {
      const { status, corpo } = paraProblema(new ErroAutenticacao('Token de autenticação em falta.'));
      await reply.status(status).type('application/problem+json').send(corpo);
      return;
    }

    try {
      const projeto = typeof req.headers['x-ado-project'] === 'string' ? req.headers['x-ado-project'] : undefined;
      req.utilizador = await ctx.tokenValidator.validar(token, projeto);
    } catch (e) {
      const { status, corpo } = paraProblema(e);
      await reply.status(status).type('application/problem+json').send(corpo);
    }
  });
}

/** Obtém o utilizador autenticado ou lança (nunca deve faltar após o preHandler). */
export function exigirUtilizador(req: FastifyRequest): ContextoUtilizador {
  if (req.utilizador === undefined) {
    throw new ErroAutenticacao('Utilizador não autenticado.');
  }
  return req.utilizador;
}
