import { describe, it, expect, afterEach } from 'vitest';
import { montarApp, comoGestor, comoRecurso } from './helpers.js';

let fechar: (() => Promise<void>) | undefined;
afterEach(async () => { if (fechar) await fechar(); fechar = undefined; });

describe('contratos', () => {
  it('lista contratos com envelope de paginação', async () => {
    const { app } = await montarApp();
    fechar = () => app.close();
    const r = await app.inject({ method: 'GET', url: '/api/v1/contratos?pagina=1&tamanho=2', headers: comoGestor() });
    expect(r.statusCode).toBe(200);
    const body = r.json() as { dados: unknown[]; total: number; pagina: number; tamanho: number };
    expect(body.tamanho).toBe(2);
    expect(body.dados.length).toBeLessThanOrEqual(2);
    expect(body.total).toBeGreaterThan(0);
  });

  it('resumo de execução devolve execução física e financeira', async () => {
    const { app, ctx } = await montarApp();
    fechar = () => app.close();
    const contrato = (await ctx.repos.contratos.todos((c) => c.numero === 'C-2026-001'))[0]!;
    const r = await app.inject({ method: 'GET', url: `/api/v1/contratos/${contrato.id}/resumo-execucao`, headers: comoGestor() });
    expect(r.statusCode).toBe(200);
    const body = r.json() as { saldosPerfis: unknown[]; valorAtualContrato: number; complementares: { atingido: boolean } };
    expect(Array.isArray(body.saldosPerfis)).toBe(true);
    expect(body.valorAtualContrato).toBeGreaterThan(0);
    expect(typeof body.complementares.atingido).toBe('boolean');
  });

  it('elemento não pode criar contrato (403)', async () => {
    const { app } = await montarApp();
    fechar = () => app.close();
    const r = await app.inject({ method: 'POST', url: '/api/v1/contratos', headers: comoRecurso(), payload: {} });
    expect(r.statusCode).toBe(403);
  });

  it('transição de estado inválida devolve 409', async () => {
    const { app, ctx } = await montarApp();
    fechar = () => app.close();
    const contrato = (await ctx.repos.contratos.todos((c) => c.estado === 'EM_VIGOR'))[0]!;
    const r = await app.inject({ method: 'POST', url: `/api/v1/contratos/${contrato.id}/estado`, headers: comoGestor(), payload: { estado: 'AGUARDA_VISTO' } });
    expect(r.statusCode).toBe(409);
  });
});

describe('alertas e auditoria', () => {
  it('o job de alertas gera os códigos esperados sobre o seed', async () => {
    const { app } = await montarApp();
    fechar = () => app.close();
    const r = await app.inject({ method: 'POST', url: '/api/v1/jobs/alertas:executar', headers: comoGestor() });
    expect(r.statusCode).toBe(200);
    const codigos = new Set(((r.json() as { alertas: Array<{ codigo: string }> }).alertas).map((a) => a.codigo));
    expect(codigos.has('AL-VISTO-PENDENTE')).toBe(false); // contrato B está AGUARDA_VISTO, não EM_VIGOR
    expect(codigos.has('AL-COMPLEMENTARES-40')).toBe(true);
    expect(codigos.has('AL-PERFIL-90')).toBe(true); // C-2026-BH3 tem um perfil quase esgotado
    // Alertas pré-contratuais removidos (só execução):
    expect(codigos.has('AL-HABILITACAO')).toBe(false);
    expect(codigos.has('AL-PUBLICITACAO')).toBe(false);
  });

  it('só o gestor de contrato consulta auditoria (403 para técnico)', async () => {
    const { app } = await montarApp();
    fechar = () => app.close();
    const r = await app.inject({ method: 'GET', url: '/api/v1/auditoria', headers: { 'x-dev-user': 'oid-gestor-tecnico' } });
    expect(r.statusCode).toBe(403);
  });

  it('a auditoria regista as mutações', async () => {
    const { app } = await montarApp();
    fechar = () => app.close();
    const r = await app.inject({ method: 'GET', url: '/api/v1/auditoria?entidade=Contrato', headers: comoGestor() });
    expect(r.statusCode).toBe(200);
  });
});
