import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { zDataISO, zMinutos, zTipoDotacao } from '@chora/domain';
import type { Contexto } from '../contexto.js';
import { ServicoRegistosTempo } from '../servicos/registos-tempo.js';
import { exigirUtilizador } from '../servidor/seguranca.js';
import { ErroProibido, ErroValidacao } from '../erros/problema.js';
import { podeExecutar } from '../auth/permissoes.js';
import { normalizarPaginacao } from '../repositorios/tipos.js';

const zNovoRegisto = z.object({
  afetacaoId: z.string().min(1),
  workItemId: z.number().int().positive(),
  data: zDataISO,
  duracao: zMinutos,
  descricaoAtividade: z.string().min(1),
  tipoDotacaoConsumida: zTipoDotacao.optional(),
  justificacaoExcessoDiario: z.string().optional(),
});

const zLote = z.object({ ids: z.array(z.string().min(1)).min(1) });
const zLoteRejeitar = zLote.extend({ motivo: z.string().min(1) });
const zAnular = z.object({ motivo: z.string().min(1) });

function parse<T>(schema: z.ZodType<T>, corpo: unknown): T {
  const r = schema.safeParse(corpo);
  if (!r.success) throw new ErroValidacao('Corpo do pedido inválido.', r.error.issues);
  return r.data;
}

export function rotasRegistosTempo(app: FastifyInstance, ctx: Contexto): void {
  const servico = new ServicoRegistosTempo(ctx);

  app.post('/api/v1/registos-tempo', async (req, reply) => {
    const u = exigirUtilizador(req);
    const novo = parse(zNovoRegisto, req.body);
    const registo = await servico.criar(novo, u);
    await reply.status(201).send(registo);
  });

  app.post('/api/v1/registos-tempo/:id/submeter', async (req) => {
    const u = exigirUtilizador(req);
    const { id } = req.params as { id: string };
    return servico.submeter(id, u);
  });

  app.post('/api/v1/registos-tempo/:id/anular', async (req) => {
    const u = exigirUtilizador(req);
    const { id } = req.params as { id: string };
    const { motivo } = parse(zAnular, req.body);
    return servico.anular(id, motivo, u);
  });

  app.post('/api/v1/registos-tempo/_aprovar', async (req) => {
    const u = exigirUtilizador(req);
    if (!podeExecutar(u.papeis, 'registo.aprovar')) throw new ErroProibido('Sem competência para aprovar.');
    const { ids } = parse(zLote, req.body);
    return { resultados: await servico.aprovar(ids, u) };
  });

  app.post('/api/v1/registos-tempo/_rejeitar', async (req) => {
    const u = exigirUtilizador(req);
    if (!podeExecutar(u.papeis, 'registo.aprovar')) throw new ErroProibido('Sem competência para rejeitar.');
    const { ids, motivo } = parse(zLoteRejeitar, req.body);
    return { resultados: await servico.rejeitar(ids, motivo, u) };
  });

  // Listagem com filtros (secção 8.1). O elemento só vê os próprios (RN-407).
  app.get('/api/v1/registos-tempo', async (req) => {
    const u = exigirUtilizador(req);
    const q = req.query as Record<string, string | undefined>;
    const podeVerTerceiros = podeExecutar(u.papeis, 'registo.ver.terceiros');
    const pag = normalizarPaginacao(
      q['pagina'] !== undefined ? Number(q['pagina']) : undefined,
      q['tamanho'] !== undefined ? Number(q['tamanho']) : undefined,
    );
    const pagina = await ctx.repos.registosTempo.listar(
      (r) =>
        (podeVerTerceiros || r.recursoId === u.utilizadorId) &&
        (q['contratoId'] === undefined || r.contratoId === q['contratoId']) &&
        (q['projetoId'] === undefined || r.projetoId === q['projetoId']) &&
        (q['recursoId'] === undefined || r.recursoId === q['recursoId']) &&
        (q['estado'] === undefined || r.estado === q['estado']) &&
        (q['workItemId'] === undefined || r.workItemId === Number(q['workItemId'])) &&
        (q['de'] === undefined || r.data >= q['de']) &&
        (q['ate'] === undefined || r.data <= q['ate']),
      pag,
      { campo: 'data', direcao: 'desc' },
    );
    return pagina;
  });

  // Atalho RN-407: os meus registos.
  app.get('/api/v1/registos-tempo/meus', async (req) => {
    const u = exigirUtilizador(req);
    const q = req.query as Record<string, string | undefined>;
    const dados = await ctx.repos.registosTempo.todos(
      (r) =>
        r.recursoId === u.utilizadorId &&
        (q['de'] === undefined || r.data >= q['de']) &&
        (q['ate'] === undefined || r.data <= q['ate']),
    );
    return { dados, total: dados.length, pagina: 1, tamanho: dados.length };
  });

  app.get('/api/v1/work-items/:id/registos-tempo', async (req) => {
    const u = exigirUtilizador(req);
    const { id } = req.params as { id: string };
    const podeVerTerceiros = podeExecutar(u.papeis, 'registo.ver.terceiros');
    const dados = await ctx.repos.registosTempo.todos(
      (r) => r.workItemId === Number(id) && (podeVerTerceiros || r.recursoId === u.utilizadorId),
    );
    return { dados, total: dados.length, pagina: 1, tamanho: dados.length };
  });
}
