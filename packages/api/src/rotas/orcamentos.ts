import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { zCent } from '@chora/domain';
import type { Contexto } from '../contexto.js';
import { exigirUtilizador } from '../servidor/seguranca.js';
import { ErroProibido, ErroValidacao } from '../erros/problema.js';
import { podeExecutar } from '../auth/permissoes.js';
import { ServicoOrcamentos } from '../servicos/orcamentos.js';

const zLinha = z.object({
  id: z.string().min(1),
  projetoId: z.string().min(1),
  origem: z.enum(['CONTINUIDADE', 'SUBSTITUICAO', 'RENOVACAO', 'NOVO']),
  contratoOrigemId: z.string().optional(),
  contratoOrigemNumero: z.string().optional(),
  tipologia: z.enum(['BOLSA_HORAS', 'CHAVE_NA_MAO', 'LICENCIAMENTO']),
  designacao: z.string().min(1),
  motivo: z.string().min(1),
  variacao: z.enum(['AUMENTO', 'MANUTENCAO', 'REDUCAO']),
  perfis: z.array(z.object({
    perfilId: z.string().optional(), nome: z.string().min(1),
    minutosReferencia: z.number().int().nonnegative(), minutosPropostos: z.number().int().nonnegative(),
    valorHora: zCent, valor: zCent,
  })),
  entregaveis: z.array(z.object({ designacao: z.string().min(1), valor: zCent, ano: z.number().int() })),
  licencas: z.object({ referencia: z.number().int().nonnegative(), propostas: z.number().int().nonnegative(), valorUnitario: zCent }).optional(),
  reparticaoAnual: z.array(z.object({ ano: z.number().int(), montante: zCent })),
  cobertoPorPortaria: z.array(z.object({ ano: z.number().int(), montante: zCent })),
});

const zProjeto = z.object({ nome: z.string().min(1), ativo: z.boolean().optional() });

function parse<T>(s: z.ZodType<T>, corpo: unknown): T {
  const r = s.safeParse(corpo);
  if (!r.success) throw new ErroValidacao('Corpo inválido.', r.error.issues);
  return r.data;
}

/** Orçamentar é competência de quem gere contratos (secção 9.3). */
function exigirGestor(papeis: import('@chora/domain').PapelAplicacional[]): void {
  if (!podeExecutar(papeis, 'gerir.contratos')) throw new ErroProibido('Só o gestor de contrato prepara o orçamento.');
}

export function rotasOrcamentos(app: FastifyInstance, ctx: Contexto): void {
  const servico = new ServicoOrcamentos(ctx);

  app.get('/api/v1/projetos', async (req) => {
    exigirUtilizador(req);
    return { dados: await ctx.repos.projetos.todos() };
  });
  app.post('/api/v1/projetos', async (req, reply) => {
    const u = exigirUtilizador(req); exigirGestor(u.papeis);
    const d = parse(zProjeto, req.body);
    const projeto = { id: ctx.ids.novo('proj'), nome: d.nome, ativo: d.ativo ?? true };
    await ctx.repos.projetos.guardar(projeto);
    await ctx.auditoria.registar({ utilizadorId: u.utilizadorId, entidade: 'Projeto', entidadeId: projeto.id, operacao: 'CRIAR', resultado: 'PERMITIDO', depois: projeto });
    await reply.status(201).send(projeto);
  });

  app.get('/api/v1/orcamentos', async (req) => {
    exigirUtilizador(req);
    return { dados: await servico.listar() };
  });
  app.post('/api/v1/orcamentos', async (req, reply) => {
    const u = exigirUtilizador(req); exigirGestor(u.papeis);
    const { ano } = parse(z.object({ ano: z.number().int().min(2000).max(2100) }), req.body);
    await reply.status(201).send(await servico.criar(ano, u));
  });
  /** Proposta a partir da carteira, sem guardar — pré-visualização. */
  app.get('/api/v1/orcamentos:proposta', async (req) => {
    exigirUtilizador(req);
    const q = req.query as Record<string, string | undefined>;
    const ano = Number(q['ano']);
    if (!Number.isInteger(ano)) throw new ErroValidacao('ano obrigatório.');
    return { dados: await servico.propor(ano) };
  });

  app.get('/api/v1/orcamentos/:id', async (req) => {
    exigirUtilizador(req);
    const { id } = req.params as { id: string };
    return servico.obter(id);
  });
  app.put('/api/v1/orcamentos/:id/linhas/:linhaId', async (req) => {
    const u = exigirUtilizador(req); exigirGestor(u.papeis);
    const { id, linhaId } = req.params as { id: string; linhaId: string };
    const linha = parse(zLinha, req.body);
    if (linha.id !== linhaId) throw new ErroValidacao('O identificador da linha não corresponde ao do caminho.');
    return servico.guardarLinha(id, linha, u);
  });
  app.delete('/api/v1/orcamentos/:id/linhas/:linhaId', async (req) => {
    const u = exigirUtilizador(req); exigirGestor(u.papeis);
    const { id, linhaId } = req.params as { id: string; linhaId: string };
    return servico.removerLinha(id, linhaId, u);
  });
  app.post('/api/v1/orcamentos/:id/fechar', async (req) => {
    const u = exigirUtilizador(req); exigirGestor(u.papeis);
    const { id } = req.params as { id: string };
    return servico.fechar(id, u);
  });
  app.post('/api/v1/orcamentos/:id/reabrir', async (req) => {
    const u = exigirUtilizador(req); exigirGestor(u.papeis);
    const { id } = req.params as { id: string };
    return servico.reabrir(id, u);
  });
}
