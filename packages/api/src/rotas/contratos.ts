import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { zContrato, zEstadoContrato, type Contrato } from '@chora/domain';
import type { Contexto } from '../contexto.js';
import { ServicoContratos } from '../servicos/contratos.js';
import { exigirUtilizador } from '../servidor/seguranca.js';
import { ErroNaoEncontrado, ErroProibido, ErroValidacao } from '../erros/problema.js';
import { podeExecutar } from '../auth/permissoes.js';
import { normalizarPaginacao } from '../repositorios/tipos.js';

const zExcecao = z.object({
  regra: z.string().min(1),
  fundamentacao: z.string().min(1),
  documentoRef: z.string().optional(),
});

export function rotasContratos(app: FastifyInstance, ctx: Contexto): void {
  const servico = new ServicoContratos(ctx);

  app.get('/api/v1/contratos', async (req) => {
    exigirUtilizador(req);
    const q = req.query as Record<string, string | undefined>;
    const pag = normalizarPaginacao(
      q['pagina'] !== undefined ? Number(q['pagina']) : undefined,
      q['tamanho'] !== undefined ? Number(q['tamanho']) : undefined,
    );
    return ctx.repos.contratos.listar(
      (c) =>
        (q['estado'] === undefined || c.estado === q['estado']) &&
        (q['numero'] === undefined || c.numero === q['numero']) &&
        (q['gestorId'] === undefined || c.gestores.some((g) => g.utilizadorId === q['gestorId'])),
      pag,
      { campo: 'numero', direcao: 'asc' },
    );
  });

  app.post('/api/v1/contratos', async (req, reply) => {
    const u = exigirUtilizador(req);
    if (!podeExecutar(u.papeis, 'gerir.contratos')) throw new ErroProibido('Sem competência para gerir contratos.');
    const agora = ctx.relogio.agora();
    const dados = req.body as Record<string, unknown>;
    const candidato = zContrato.safeParse({
      ...dados,
      id: (dados['id'] as string | undefined) ?? ctx.ids.novo('ctr'),
      estado: (dados['estado'] as string | undefined) ?? 'EM_PREPARACAO',
      excecoes: (dados['excecoes'] as unknown[] | undefined) ?? [],
      gestores: (dados['gestores'] as unknown[] | undefined) ?? [],
      criadoEm: agora, criadoPor: u.utilizadorId, atualizadoEm: agora, atualizadoPor: u.utilizadorId,
    });
    if (!candidato.success) throw new ErroValidacao('Contrato inválido.', candidato.error.issues);
    const contrato = await servico.criar(candidato.data as Contrato, u);
    await reply.status(201).send(contrato);
  });

  app.patch('/api/v1/contratos/:id', async (req) => {
    const u = exigirUtilizador(req);
    if (!podeExecutar(u.papeis, 'gerir.contratos')) throw new ErroProibido('Sem competência.');
    const { id } = req.params as { id: string };
    return servico.atualizar(id, req.body as Partial<Contrato>, u);
  });

  app.post('/api/v1/contratos/:id/inativar', async (req) => {
    const u = exigirUtilizador(req);
    if (!podeExecutar(u.papeis, 'gerir.contratos')) throw new ErroProibido('Sem competência.');
    const { id } = req.params as { id: string };
    const parsed = z.object({ estado: zEstadoContrato, motivo: z.string().min(1) }).safeParse(req.body);
    if (!parsed.success) throw new ErroValidacao('Dados de inativação inválidos.', parsed.error.issues);
    return servico.inativar(id, parsed.data.estado, parsed.data.motivo, u);
  });

  /** Elimina o contrato e os registos dependentes. A auditoria conserva o rasto. */
  app.delete('/api/v1/contratos/:id', async (req) => {
    const u = exigirUtilizador(req);
    if (!podeExecutar(u.papeis, 'gerir.contratos')) throw new ErroProibido('Sem competência.');
    const { id } = req.params as { id: string };
    const parsed = z.object({ motivo: z.string().min(1) }).safeParse(req.body);
    if (!parsed.success) throw new ErroValidacao('A eliminação exige a indicação do motivo.', parsed.error.issues);
    await servico.eliminar(id, parsed.data.motivo, u);
    return { eliminado: id };
  });

  app.get('/api/v1/contratos/:id', async (req) => {
    exigirUtilizador(req);
    const { id } = req.params as { id: string };
    const c = await ctx.repos.contratos.obter(id);
    if (c === null) throw new ErroNaoEncontrado(`Contrato ${id} inexistente.`);
    return c;
  });

  app.get('/api/v1/contratos/:id/resumo-execucao', async (req) => {
    exigirUtilizador(req);
    const { id } = req.params as { id: string };
    return servico.resumoExecucao(id);
  });

  app.post('/api/v1/contratos/:id/estado', async (req) => {
    const u = exigirUtilizador(req);
    if (!podeExecutar(u.papeis, 'gerir.contratos')) throw new ErroProibido('Sem competência.');
    const { id } = req.params as { id: string };
    const parsed = z.object({ estado: zEstadoContrato }).safeParse(req.body);
    if (!parsed.success) throw new ErroValidacao('Estado inválido.', parsed.error.issues);
    return servico.transitarEstado(id, parsed.data.estado, u);
  });

  app.post('/api/v1/contratos/:id/alterar-estado', async (req) => {
    const u = exigirUtilizador(req);
    if (!podeExecutar(u.papeis, 'gerir.contratos')) throw new ErroProibido('Sem competência.');
    const { id } = req.params as { id: string };
    const parsed = z.object({ estado: zEstadoContrato, nota: z.string().min(1) }).safeParse(req.body);
    if (!parsed.success) throw new ErroValidacao('Alteração de estado inválida.', parsed.error.issues);
    return servico.alterarEstado(id, parsed.data.estado, parsed.data.nota, u);
  });

  app.post('/api/v1/contratos/:id/excecoes', async (req, reply) => {
    const u = exigirUtilizador(req);
    if (!podeExecutar(u.papeis, 'registar.excecoes')) throw new ErroProibido('Só o gestor de contrato regista exceções.');
    const { id } = req.params as { id: string };
    const parsed = zExcecao.safeParse(req.body);
    if (!parsed.success) throw new ErroValidacao('Exceção inválida.', parsed.error.issues);
    const contrato = await ctx.repos.contratos.obter(id);
    if (contrato === null) throw new ErroNaoEncontrado(`Contrato ${id} inexistente.`);
    const excecao = {
      ...parsed.data,
      autorizadoPor: u.utilizadorId,
      autorizadoEm: ctx.relogio.agora().slice(0, 10),
    };
    const atualizado: Contrato = { ...contrato, excecoes: [...contrato.excecoes, excecao], atualizadoEm: ctx.relogio.agora(), atualizadoPor: u.utilizadorId };
    await ctx.repos.contratos.guardar(atualizado);
    await ctx.auditoria.registar({
      utilizadorId: u.utilizadorId, entidade: 'Contrato', entidadeId: id,
      operacao: 'EXCECAO', resultado: 'PERMITIDO', depois: excecao,
    });
    await reply.status(201).send(atualizado);
  });
}
