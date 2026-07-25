import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { calcularConsumoPerfil, valorPrevistoPerfil, mesDeData } from '@chora/domain';
import type { Contexto } from '../contexto.js';
import { exigirUtilizador } from '../servidor/seguranca.js';
import { ErroProibido, ErroValidacao } from '../erros/problema.js';
import { podeExecutar } from '../auth/permissoes.js';
import { JobAlertas } from '../alertas/job-alertas.js';
import { ServicoAlertas } from '../servicos/alertas.js';

export function rotasRelatorios(app: FastifyInstance, ctx: Contexto): void {
  app.get('/api/v1/relatorios/horas-por-perfil', async (req) => {
    exigirUtilizador(req);
    const q = req.query as Record<string, string | undefined>;
    const contratoId = q['contratoId'];
    if (contratoId === undefined) throw new ErroValidacao('contratoId obrigatório.');
    const perfis = await ctx.repos.perfis.todos((p) => p.contratoId === contratoId);
    const aprovados = await ctx.repos.registosTempo.todos(
      (r) => r.contratoId === contratoId && r.estado === 'APROVADO' &&
        (q['de'] === undefined || r.data >= q['de']) && (q['ate'] === undefined || r.data <= q['ate']),
    );
    return {
      contratoId,
      perfis: perfis.map((p) => {
        const c = calcularConsumoPerfil(p, aprovados);
        return { perfilId: p.id, nome: p.nome, minutosConsumidos: c.minutosConsumidos, minutosDisponiveis: c.minutosDisponiveis, minutosPorTipo: c.minutosPorTipo, valorConsumido: c.valorConsumido, valorPrevisto: valorPrevistoPerfil(p) };
      }),
    };
  });

  app.get('/api/v1/relatorios/horas-por-recurso', async (req) => {
    exigirUtilizador(req);
    const q = req.query as Record<string, string | undefined>;
    const contratoId = q['contratoId'];
    if (contratoId === undefined) throw new ErroValidacao('contratoId obrigatório.');
    const aprovados = await ctx.repos.registosTempo.todos(
      (r) => r.contratoId === contratoId && r.estado === 'APROVADO' &&
        (q['mes'] === undefined || mesDeData(r.data) === q['mes']),
    );
    const porRecurso = new Map<string, number>();
    for (const r of aprovados) porRecurso.set(r.recursoId, (porRecurso.get(r.recursoId) ?? 0) + r.duracao);
    return { contratoId, recursos: [...porRecurso.entries()].map(([recursoId, minutos]) => ({ recursoId, minutos })) };
  });

  app.get('/api/v1/relatorios/execucao-financeira', async (req) => {
    exigirUtilizador(req);
    const q = req.query as Record<string, string | undefined>;
    const contratoId = q['contratoId'];
    if (contratoId === undefined) throw new ErroValidacao('contratoId obrigatório.');
    const contrato = await ctx.repos.contratos.obter(contratoId);
    const aprovados = await ctx.repos.registosTempo.todos((r) => r.contratoId === contratoId && r.estado === 'APROVADO');
    const valorImputado = aprovados.reduce((s, r) => s + r.valorImputado, 0);
    const faturas = await ctx.repos.faturas.todos((f) => f.contratoId === contratoId);
    const faturado = faturas.filter((f) => f.estado === 'VALIDADA' || f.estado === 'PAGA').reduce((s, f) => s + (f.montanteAprovado ?? 0), 0);
    return {
      contratoId,
      precoContratualAtual: contrato?.precoContratualAtual ?? 0,
      valorImputado, faturado,
      porDotacao: [...new Set(aprovados.map((r) => r.tipoDotacaoConsumida))].map((tipo) => ({
        tipo, valor: aprovados.filter((r) => r.tipoDotacaoConsumida === tipo).reduce((s, r) => s + r.valorImputado, 0),
      })),
    };
  });

  app.get('/api/v1/relatorios/indicadores-gestor', async (req) => {
    exigirUtilizador(req);
    const q = req.query as Record<string, string | undefined>;
    const contratoId = q['contratoId'];
    if (contratoId === undefined) throw new ErroValidacao('contratoId obrigatório.');
    const registos = await ctx.repos.registosTempo.todos((r) => r.contratoId === contratoId);
    return {
      contratoId,
      totalRegistos: registos.length,
      submetidos: registos.filter((r) => r.estado === 'SUBMETIDO').length,
      aprovados: registos.filter((r) => r.estado === 'APROVADO').length,
      rejeitados: registos.filter((r) => r.estado === 'REJEITADO').length,
      anulados: registos.filter((r) => r.estado === 'ANULADO').length,
    };
  });
}

export function rotasAlertas(app: FastifyInstance, ctx: Contexto): void {
  app.get('/api/v1/alertas', async (req) => {
    const u = exigirUtilizador(req);
    const q = req.query as Record<string, string | undefined>;
    const dados = await ctx.repos.alertas.todos(
      (a) =>
        (q['destinatarioId'] === undefined || a.destinatarioId === q['destinatarioId']) &&
        (q['lidos'] === undefined || (q['lidos'] === 'true' ? a.lidoEm !== undefined : a.lidoEm === undefined)) &&
        (podeExecutar(u.papeis, 'registo.ver.terceiros') || a.destinatarioId === u.utilizadorId),
    );
    return { dados, total: dados.length, pagina: 1, tamanho: dados.length };
  });

  app.post('/api/v1/alertas/:id/marcar-lido', async (req) => {
    const u = exigirUtilizador(req);
    const { id } = req.params as { id: string };
    const a = await ctx.repos.alertas.obter(id);
    if (a === null) throw new ErroValidacao('Alerta inexistente.');
    const atualizado = { ...a, lidoEm: ctx.relogio.agora() };
    await ctx.repos.alertas.guardar(atualizado);
    await ctx.auditoria.registar({ utilizadorId: u.utilizadorId, entidade: 'Alerta', entidadeId: id, operacao: 'MARCAR_LIDO', resultado: 'PERMITIDO' });
    return atualizado;
  });

  // Execução manual do job — apenas em modo dev.
  app.post('/api/v1/jobs/alertas/_executar', async (req) => {
    const u = exigirUtilizador(req);
    if (!podeExecutar(u.papeis, 'gerir.contratos')) throw new ErroProibido('Sem competência.');
    const r = await new JobAlertas(ctx).reconciliar();
    return { gerados: r.alertas.length, novas: r.novas.length, resolvidas: r.resolvidas.length, reabertas: r.reabertas.length, alertas: r.alertas };
  });

  const servicoAlertas = new ServicoAlertas(ctx);

  /** Decisões pendentes (abertas ou em curso), a base da fila "Hoje". */
  app.get('/api/v1/decisoes', async (req) => {
    exigirUtilizador(req);
    const q = req.query as Record<string, string | undefined>;
    return { dados: await servicoAlertas.pendentes(q['contratoId']) };
  });

  app.post('/api/v1/alertas/:id/em-curso', async (req) => {
    const u = exigirUtilizador(req);
    if (!podeExecutar(u.papeis, 'gerir.contratos')) throw new ErroProibido('Sem competência.');
    const { id } = req.params as { id: string };
    return servicoAlertas.marcarEmCurso(id, u);
  });

  app.post('/api/v1/alertas/:id/dispensar', async (req) => {
    const u = exigirUtilizador(req);
    if (!podeExecutar(u.papeis, 'gerir.contratos')) throw new ErroProibido('Sem competência.');
    const { id } = req.params as { id: string };
    const p = z.object({ motivo: z.string().min(1), dias: z.number().int().positive().default(30) }).safeParse(req.body);
    if (!p.success) throw new ErroValidacao('A dispensa exige motivo e período.', p.error.issues);
    return servicoAlertas.dispensar(id, p.data.motivo, p.data.dias, u);
  });

  app.post('/api/v1/alertas/:id/reabrir', async (req) => {
    const u = exigirUtilizador(req);
    if (!podeExecutar(u.papeis, 'gerir.contratos')) throw new ErroProibido('Sem competência.');
    const { id } = req.params as { id: string };
    return servicoAlertas.reabrir(id, u);
  });
}

export function rotasAuditoria(app: FastifyInstance, ctx: Contexto): void {
  app.get('/api/v1/auditoria', async (req) => {
    const u = exigirUtilizador(req);
    if (!podeExecutar(u.papeis, 'consultar.auditoria')) throw new ErroProibido('Só o gestor de contrato consulta auditoria.');
    const q = req.query as Record<string, string | undefined>;
    const dados = await ctx.repos.eventosAuditoria.todos(
      (e) =>
        (q['entidade'] === undefined || e.entidade === q['entidade']) &&
        (q['entidadeId'] === undefined || e.entidadeId === q['entidadeId']) &&
        (q['utilizadorId'] === undefined || e.utilizadorId === q['utilizadorId']) &&
        (q['de'] === undefined || e.ocorridoEm >= q['de']) &&
        (q['ate'] === undefined || e.ocorridoEm <= q['ate']),
    );
    return { dados, total: dados.length, pagina: 1, tamanho: dados.length };
  });
}
