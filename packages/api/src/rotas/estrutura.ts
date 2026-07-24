import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { zTipoAlteracao, zTipoDocumentoHabilitacao, zCent, zCentNaoNegativo, zMinutos, zDataISO } from '@chora/domain';
import type { Contexto } from '../contexto.js';
import { exigirUtilizador } from '../servidor/seguranca.js';
import { ErroProibido, ErroValidacao } from '../erros/problema.js';
import { podeExecutar } from '../auth/permissoes.js';
import { ServicoEstrutura } from '../servicos/estrutura.js';

function parse<T>(s: z.ZodType<T>, corpo: unknown): T { const r = s.safeParse(corpo); if (!r.success) throw new ErroValidacao('Corpo inválido.', r.error.issues); return r.data; }
function exigirGestao(papeis: import('@chora/domain').PapelAplicacional[]): void {
  if (!podeExecutar(papeis, 'gerir.perfis.dotacoes')) throw new ErroProibido('Sem competência para gerir a estrutura contratual.');
}

const zPerfil = z.object({ nome: z.string().min(1), quantidadePrevista: zMinutos, consomeBolsaValor: z.boolean(), consomeTrabalhosComplementares: z.boolean(), perfilDeGestao: z.boolean(), valorHora: zCentNaoNegativo, vigenteDe: zDataISO });
const zPreco = z.object({ valorHora: zCentNaoNegativo, vigenteDe: zDataISO });
const zAlteracao = z.object({
  tipo: zTipoAlteracao, dataEfeito: zDataISO, descricao: z.string().min(1), fundamentacao: z.string().min(1),
  valorAcrescido: zCent.optional(), novaDataTermino: zDataISO.optional(), reprogramacaoFinanceira: z.boolean().optional(),
  suspensao: z.object({ dataInicio: zDataISO, dataFim: zDataISO.optional(), suspendePrazoExecucao: z.boolean() }).optional(),
  novoPrestador: z.object({ nome: z.string().min(1), nipc: z.string().min(1) }).optional(),
  novoGestorId: z.string().optional(),
  excecaoVigencia: z.string().optional(),
});
const zHabilitacao = z.object({ tipo: zTipoDocumentoHabilitacao, emitidoEm: zDataISO, validoAte: zDataISO, referencia: z.string().optional() });

export function rotasEstrutura(app: FastifyInstance, ctx: Contexto): void {
  const servico = new ServicoEstrutura(ctx);

  app.get('/api/v1/contratos/:id/perfis', async (req) => {
    exigirUtilizador(req); const { id } = req.params as { id: string };
    return { dados: await ctx.repos.perfis.todos((p) => p.contratoId === id) };
  });
  app.post('/api/v1/contratos/:id/perfis', async (req, reply) => {
    const u = exigirUtilizador(req); exigirGestao(u.papeis);
    const { id } = req.params as { id: string };
    await reply.status(201).send(await servico.criarPerfil(id, parse(zPerfil, req.body), u));
  });
  app.post('/api/v1/contratos/:id/perfis/:perfilId/precos', async (req, reply) => {
    const u = exigirUtilizador(req); exigirGestao(u.papeis);
    const { perfilId } = req.params as { perfilId: string }; const d = parse(zPreco, req.body);
    await reply.status(201).send(await servico.novoPrecoPerfil(perfilId, d.valorHora, d.vigenteDe, u));
  });

  app.get('/api/v1/contratos/:id/alteracoes', async (req) => {
    exigirUtilizador(req); const { id } = req.params as { id: string };
    return { dados: await ctx.repos.alteracoes.todos((a) => a.contratoId === id) };
  });
  app.post('/api/v1/contratos/:id/alteracoes', async (req, reply) => {
    const u = exigirUtilizador(req); if (!podeExecutar(u.papeis, 'gerir.contratos')) throw new ErroProibido('Sem competência.');
    const { id } = req.params as { id: string };
    await reply.status(201).send(await servico.registarAlteracao(id, parse(zAlteracao, req.body), u));
  });
  app.get('/api/v1/contratos/:id/projetos', async (req) => {
    exigirUtilizador(req); const { id } = req.params as { id: string };
    const assoc = await ctx.repos.contratoProjetos.todos((c) => c.contratoId === id);
    return { dados: assoc.map((a) => a.projetoId) };
  });
  app.put('/api/v1/contratos/:id/projetos', async (req) => {
    const u = exigirUtilizador(req); if (!podeExecutar(u.papeis, 'gerir.acesso.projetos')) throw new ErroProibido('Só o gestor de contrato gere projetos.');
    const { id } = req.params as { id: string };
    const { projetoIds } = parse(z.object({ projetoIds: z.array(z.string().min(1)) }), req.body);
    for (const a of await ctx.repos.contratoProjetos.todos((c) => c.contratoId === id)) await ctx.repos.contratoProjetos.remover(a.id);
    for (const projetoId of [...new Set(projetoIds)]) await ctx.repos.contratoProjetos.guardar({ id: ctx.ids.novo('cp'), contratoId: id, projetoId });
    return { dados: [...new Set(projetoIds)] };
  });

  app.get('/api/v1/contratos/:id/documentos-habilitacao', async (req) => {
    exigirUtilizador(req); const { id } = req.params as { id: string };
    return { dados: await ctx.repos.documentosHabilitacao.todos((d) => d.contratoId === id) };
  });
  app.post('/api/v1/contratos/:id/documentos-habilitacao', async (req, reply) => {
    const u = exigirUtilizador(req); exigirGestao(u.papeis);
    const { id } = req.params as { id: string }; const d = parse(zHabilitacao, req.body);
    await reply.status(201).send(await servico.adicionarHabilitacao(id, d.tipo, d.emitidoEm, d.validoAte, d.referencia, u));
  });
}
