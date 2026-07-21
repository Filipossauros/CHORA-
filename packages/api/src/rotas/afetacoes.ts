import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { zDataISO } from '@chora/domain';
import type { Contexto } from '../contexto.js';
import { exigirUtilizador } from '../servidor/seguranca.js';
import { normalizarPaginacao } from '../repositorios/tipos.js';
import { podeExecutar } from '../auth/permissoes.js';
import { ErroProibido, ErroValidacao } from '../erros/problema.js';
import { ServicoAfetacoes } from '../servicos/afetacoes.js';

const zNova = z.object({
  contratoId: z.string().min(1), perfilId: z.string().min(1), recursoId: z.string().min(1),
  projetoIds: z.array(z.string().min(1)).min(1), vigenteDe: zDataISO, vigenteAte: zDataISO.optional(),
});
const zPatch = z.object({ projetoIds: z.array(z.string()).optional(), vigenteAte: zDataISO.optional(), ativa: z.boolean().optional() });
const zSubstituir = z.object({ novoRecursoId: z.string().min(1), vigenteDe: zDataISO });

function parse<T>(s: z.ZodType<T>, corpo: unknown): T {
  const r = s.safeParse(corpo);
  if (!r.success) throw new ErroValidacao('Corpo inválido.', r.error.issues);
  return r.data;
}

/**
 * Rotas de afetações (secção 8.1). Estado da afetação: apenas ativa/inativa (R1).
 */
export function rotasAfetacoes(app: FastifyInstance, ctx: Contexto): void {
  const servico = new ServicoAfetacoes(ctx);

  app.get('/api/v1/afetacoes', async (req) => {
    const u = exigirUtilizador(req);
    const q = req.query as Record<string, string | undefined>;
    const podeVerTerceiros = podeExecutar(u.papeis, 'registo.ver.terceiros');
    const pag = normalizarPaginacao(q['pagina'] !== undefined ? Number(q['pagina']) : undefined, q['tamanho'] !== undefined ? Number(q['tamanho']) : undefined);
    return ctx.repos.afetacoes.listar(
      (a) =>
        (podeVerTerceiros || a.recursoId === u.utilizadorId) &&
        (q['contratoId'] === undefined || a.contratoId === q['contratoId']) &&
        (q['recursoId'] === undefined || a.recursoId === q['recursoId']) &&
        (q['projetoId'] === undefined || a.projetoIds.includes(q['projetoId'])) &&
        (q['ativa'] === undefined || a.ativa === (q['ativa'] === 'true')),
      pag,
    );
  });

  app.post('/api/v1/afetacoes', async (req, reply) => {
    const u = exigirUtilizador(req);
    if (!podeExecutar(u.papeis, 'gerir.afetacoes')) throw new ErroProibido('Sem competência para gerir afetações.');
    const afetacao = await servico.criar(parse(zNova, req.body), u);
    await reply.status(201).send(afetacao);
  });

  app.patch('/api/v1/afetacoes/:id', async (req) => {
    const u = exigirUtilizador(req);
    if (!podeExecutar(u.papeis, 'gerir.afetacoes')) throw new ErroProibido('Sem competência.');
    const { id } = req.params as { id: string };
    return servico.atualizar(id, parse(zPatch, req.body), u);
  });

  app.post('/api/v1/afetacoes/:id/substituir', async (req) => {
    const u = exigirUtilizador(req);
    if (!podeExecutar(u.papeis, 'gerir.afetacoes')) throw new ErroProibido('Sem competência.');
    const { id } = req.params as { id: string };
    const { novoRecursoId, vigenteDe } = parse(zSubstituir, req.body);
    return servico.substituir(id, novoRecursoId, vigenteDe, u);
  });
}
