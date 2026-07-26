import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { zDataISO, zCent, zCentNaoNegativo, zMinutos, zAnoCivil, zTipoDocumentoFatura, zTipoFaturacao } from '@chora/domain';
import type { Contexto } from '../contexto.js';
import { exigirUtilizador } from '../servidor/seguranca.js';
import { ErroProibido, ErroValidacao } from '../erros/problema.js';
import { podeExecutar } from '../auth/permissoes.js';
import { ServicoFaturas } from '../servicos/faturas.js';

const zCompromisso = z.object({ numero: z.string().min(1), montante: zCentNaoNegativo, ano: zAnoCivil, emitidoEm: zDataISO });
const zNovaFatura = z.object({
  compromissoId: z.string().optional(), numero: z.string().min(1),
  // O que a fatura liquida: um entregável (preço fixo) ou tempo prestado.
  tipo: zTipoFaturacao.optional(),
  entregavelId: z.string().optional(),
  referenciaSistemaFaturacao: z.string().optional(),
  dataEmissao: zDataISO, dataRececao: zDataISO, periodoDe: zDataISO, periodoAte: zDataISO,
  montanteSemIva: zCent, montanteIva: zCent, dataLimitePagamento: zDataISO.optional(),
});
const zDoc = z.object({ tipo: zTipoDocumentoFatura, ficheiroRef: z.string().min(1), nomeOriginal: z.string().min(1), hashSha256: z.string().regex(/^[a-f0-9]{64}$/i), tamanhoBytes: z.number().int().nonnegative() });
const zLinha = z.object({ perfilId: z.string().optional(), recursoId: z.string().optional(), quantidade: zMinutos, valorHora: zCent, montante: zCent, origem: z.enum(['MANUAL', 'EXTRAIDA']) });
const zDecidir = z.object({ decisao: z.enum(['VALIDADA', 'INVALIDADA']), motivo: z.string().optional() });

function parse<T>(s: z.ZodType<T>, corpo: unknown): T { const r = s.safeParse(corpo); if (!r.success) throw new ErroValidacao('Corpo inválido.', r.error.issues); return r.data; }
function exigirGestorFaturas(papeis: import('@chora/domain').PapelAplicacional[]): void {
  if (!podeExecutar(papeis, 'gerir.faturas.compromissos')) throw new ErroProibido('Só o gestor de contrato gere faturas e compromissos.');
}

export function rotasFaturas(app: FastifyInstance, ctx: Contexto): void {
  const servico = new ServicoFaturas(ctx);

  app.get('/api/v1/contratos/:id/compromissos', async (req) => {
    exigirUtilizador(req);
    const { id } = req.params as { id: string };
    const dados = await ctx.repos.compromissos.todos((c) => c.contratoId === id);
    return { dados };
  });
  app.post('/api/v1/contratos/:id/compromissos', async (req, reply) => {
    const u = exigirUtilizador(req); exigirGestorFaturas(u.papeis);
    const { id } = req.params as { id: string };
    const d = parse(zCompromisso, req.body);
    await reply.status(201).send(await servico.criarCompromisso(id, d.numero, d.montante, d.ano, d.emitidoEm, u));
  });

  app.get('/api/v1/contratos/:id/faturas', async (req) => {
    exigirUtilizador(req);
    const { id } = req.params as { id: string };
    const dados = await ctx.repos.faturas.todos((f) => f.contratoId === id);
    return { dados };
  });
  app.post('/api/v1/contratos/:id/faturas', async (req, reply) => {
    const u = exigirUtilizador(req); exigirGestorFaturas(u.papeis);
    const { id } = req.params as { id: string };
    await reply.status(201).send(await servico.criarFatura(id, parse(zNovaFatura, req.body), u));
  });

  app.get('/api/v1/faturas/:id', async (req) => {
    exigirUtilizador(req);
    const { id } = req.params as { id: string };
    const f = await ctx.repos.faturas.obter(id);
    if (f === null) throw new ErroValidacao('Fatura inexistente.');
    return f;
  });
  app.post('/api/v1/faturas/:id/documentos', async (req, reply) => {
    const u = exigirUtilizador(req); exigirGestorFaturas(u.papeis);
    const { id } = req.params as { id: string };
    const doc = { ...parse(zDoc, req.body), recebidoEm: ctx.relogio.agora(), carregadoPor: u.utilizadorId };
    await reply.status(201).send(await servico.anexarDocumento(id, doc, u));
  });
  app.post('/api/v1/faturas/:id/linhas', async (req) => {
    const u = exigirUtilizador(req); exigirGestorFaturas(u.papeis);
    const { id } = req.params as { id: string };
    const linhas = parse(z.object({ linhas: z.array(zLinha) }), req.body).linhas;
    return servico.definirLinhas(id, linhas, u);
  });
  app.post('/api/v1/faturas/:id/iniciar-conferencia', async (req) => {
    const u = exigirUtilizador(req); exigirGestorFaturas(u.papeis);
    const { id } = req.params as { id: string };
    return servico.iniciarConferencia(id, u);
  });
  app.get('/api/v1/faturas/:id/conferir', async (req) => {
    exigirUtilizador(req);
    const { id } = req.params as { id: string };
    return servico.conferir(id);
  });
  app.post('/api/v1/faturas/:id/decidir', async (req) => {
    const u = exigirUtilizador(req); exigirGestorFaturas(u.papeis);
    const { id } = req.params as { id: string };
    const { decisao, motivo } = parse(zDecidir, req.body);
    return servico.decidir(id, decisao, motivo, u);
  });
  app.get('/api/v1/faturas/:id/relatorio-evidencia', async (req) => {
    exigirUtilizador(req);
    const { id } = req.params as { id: string };
    const f = await ctx.repos.faturas.obter(id);
    if (f?.relatorioEvidenciaId === undefined) throw new ErroValidacao('Fatura sem relatório de evidência.');
    return ctx.repos.relatoriosEvidencia.obter(f.relatorioEvidenciaId);
  });
}
