import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { zPapelAplicacional } from '@chora/domain';
import type { Contexto } from '../contexto.js';
import { exigirUtilizador } from '../servidor/seguranca.js';
import { ErroProibido, ErroValidacao } from '../erros/problema.js';
import { podeExecutar } from '../auth/permissoes.js';
import { ServicoRecursos, ServicoAcessos } from '../servicos/recursos-acessos.js';

const zRecurso = z.object({ id: z.string().min(1), entidadeExecutanteNipc: z.string().min(1) });
const zAcesso = z.object({ utilizadorId: z.string().min(1), papeis: z.array(zPapelAplicacional).min(1), entidade: z.string().optional(), ambito: z.string().optional() });

function parse<T>(s: z.ZodType<T>, corpo: unknown): T { const r = s.safeParse(corpo); if (!r.success) throw new ErroValidacao('Corpo inválido.', r.error.issues); return r.data; }

export function rotasRecursos(app: FastifyInstance, ctx: Contexto): void {
  const servico = new ServicoRecursos(ctx);
  app.get('/api/v1/recursos', async (req) => {
    exigirUtilizador(req);
    return { dados: await ctx.repos.recursos.todos() };
  });
  app.post('/api/v1/recursos', async (req, reply) => {
    const u = exigirUtilizador(req);
    if (!podeExecutar(u.papeis, 'gerir.afetacoes')) throw new ErroProibido('Sem competência.');
    const d = parse(zRecurso, req.body);
    await reply.status(201).send(await servico.criar(d.id, d.entidadeExecutanteNipc, u));
  });
  app.patch('/api/v1/recursos/:id', async (req) => {
    const u = exigirUtilizador(req);
    if (!podeExecutar(u.papeis, 'gerir.afetacoes')) throw new ErroProibido('Sem competência.');
    const { id } = req.params as { id: string };
    const d = parse(z.object({ ativo: z.boolean() }), req.body);
    return servico.definirAtivo(id, d.ativo, u);
  });
}

export function rotasAcessos(app: FastifyInstance, ctx: Contexto): void {
  const servico = new ServicoAcessos(ctx);
  app.get('/api/v1/acessos', async (req) => {
    const u = exigirUtilizador(req);
    if (!podeExecutar(u.papeis, 'gerir.acesso.projetos')) throw new ErroProibido('Só o gestor de contrato consulta acessos.');
    return { dados: await ctx.repos.acessos.todos() };
  });
  app.post('/api/v1/acessos', async (req, reply) => {
    const u = exigirUtilizador(req);
    if (!podeExecutar(u.papeis, 'gerir.acesso.projetos')) throw new ErroProibido('Só o gestor de contrato concede acessos.');
    const d = parse(zAcesso, req.body);
    await reply.status(201).send(await servico.conceder(d.utilizadorId, d.papeis, d.entidade, d.ambito, u));
  });
  app.post('/api/v1/acessos/:id/revogar', async (req) => {
    const u = exigirUtilizador(req);
    if (!podeExecutar(u.papeis, 'gerir.acesso.projetos')) throw new ErroProibido('Sem competência.');
    const { id } = req.params as { id: string };
    await servico.revogar(id, u);
    return { ok: true };
  });
}
