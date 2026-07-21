import Fastify, { type FastifyInstance } from 'fastify';
import type { Contexto } from './contexto.js';
import { registarSeguranca } from './servidor/seguranca.js';
import { registarRotas } from './rotas/index.js';
import { paraProblema } from './erros/problema.js';

/**
 * Constrói a instância Fastify com CORS, segurança, rotas e o tratador de erros
 * que serializa `application/problem+json` (ADR-06).
 */
/**
 * Reescreve os verbos-RPC do estilo `recurso:acao` (secção 8.1) para uma forma
 * interna com barra (`recurso/_acao`), porque o router do Fastify interpreta o
 * `:` a meio do segmento como parâmetro. O contrato externo mantém-se com `:`.
 */
export function reescreverVerbo(url: string): string {
  const [caminho, query] = url.split('?');
  const novo = (caminho ?? '').replace(/:([a-zA-Z]+)(?=$|\/)/g, '/_$1');
  return query === undefined ? novo : `${novo}?${query}`;
}

export function construirServidor(ctx: Contexto): FastifyInstance {
  const app = Fastify({ logger: false, rewriteUrl: (req) => reescreverVerbo(req.url ?? '/') });

  // CORS explícito entre dev.azure.com e a API (secção 10.1). Permissivo no protótipo.
  app.addHook('onRequest', async (req, reply) => {
    reply.header('Access-Control-Allow-Origin', req.headers['origin'] ?? '*');
    reply.header('Access-Control-Allow-Headers', 'Authorization, Content-Type, X-Dev-User, X-Request-Id, X-Ado-Project, Idempotency-Key');
    reply.header('Access-Control-Allow-Methods', 'GET, POST, PATCH, PUT, DELETE, OPTIONS');
    if (req.method === 'OPTIONS') {
      await reply.status(204).send();
    }
  });

  app.get('/saude', async () => ({ estado: 'ok', versao: '1.0.0' }));

  registarSeguranca(app, ctx);
  registarRotas(app, ctx);

  app.setErrorHandler(async (erro, _req, reply) => {
    const { status, corpo } = paraProblema(erro);
    await reply.status(status).type('application/problem+json').send(corpo);
  });

  app.setNotFoundHandler(async (_req, reply) => {
    await reply.status(404).type('application/problem+json').send({
      type: 'https://chora.spms/erros/nao-encontrado',
      title: 'Recurso não encontrado', status: 404, detail: 'Rota inexistente.',
    });
  });

  return app;
}
