import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { zTipoProcedimento, zCentNaoNegativo } from '@chora/domain';
import type { Contexto } from '../contexto.js';
import { exigirUtilizador } from '../servidor/seguranca.js';
import { ErroNaoEncontrado, ErroProibido, ErroValidacao } from '../erros/problema.js';
import { podeExecutar } from '../auth/permissoes.js';
import { normalizarPaginacao } from '../repositorios/tipos.js';
import { ServicoProcedimentos } from '../servicos/procedimentos.js';

const zNovo = z.object({ numero: z.string().min(1), descricao: z.string().min(1), tipo: zTipoProcedimento, cpv: z.string().optional(), precoBase: zCentNaoNegativo.optional(), acordoQuadroId: z.string().optional() });
const zLote = z.object({ numero: z.string().min(1), designacao: z.string().min(1), precoBase: zCentNaoNegativo.optional() });

function parse<T>(s: z.ZodType<T>, corpo: unknown): T { const r = s.safeParse(corpo); if (!r.success) throw new ErroValidacao('Corpo inválido.', r.error.issues); return r.data; }

export function rotasProcedimentos(app: FastifyInstance, ctx: Contexto): void {
  const servico = new ServicoProcedimentos(ctx);

  app.get('/api/v1/procedimentos', async (req) => {
    exigirUtilizador(req);
    const q = req.query as Record<string, string | undefined>;
    const pag = normalizarPaginacao(q['pagina'] !== undefined ? Number(q['pagina']) : undefined, q['tamanho'] !== undefined ? Number(q['tamanho']) : undefined);
    return ctx.repos.procedimentos.listar((p) => (q['numero'] === undefined || p.numero === q['numero']) && (q['tipo'] === undefined || p.tipo === q['tipo']), pag, { campo: 'numero', direcao: 'asc' });
  });

  app.post('/api/v1/procedimentos', async (req, reply) => {
    const u = exigirUtilizador(req);
    if (!podeExecutar(u.papeis, 'gerir.contratos')) throw new ErroProibido('Sem competência.');
    await reply.status(201).send(await servico.criar(parse(zNovo, req.body), u));
  });

  app.get('/api/v1/procedimentos/:id', async (req) => {
    exigirUtilizador(req);
    const { id } = req.params as { id: string };
    const p = await ctx.repos.procedimentos.obter(id);
    if (p === null) throw new ErroNaoEncontrado(`Procedimento ${id} inexistente.`);
    return p;
  });

  app.get('/api/v1/procedimentos/:id/lotes', async (req) => {
    exigirUtilizador(req);
    const { id } = req.params as { id: string };
    return { dados: await servico.lotes(id) };
  });

  app.post('/api/v1/procedimentos/:id/lotes', async (req, reply) => {
    const u = exigirUtilizador(req);
    if (!podeExecutar(u.papeis, 'gerir.contratos')) throw new ErroProibido('Sem competência.');
    const { id } = req.params as { id: string };
    const dados = parse(zLote, req.body);
    await reply.status(201).send(await servico.criarLote(id, dados.numero, dados.designacao, dados.precoBase, u));
  });
}
