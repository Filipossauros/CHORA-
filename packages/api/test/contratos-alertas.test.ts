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

  it('os alertas compostos trazem janela de decisão, impacto e opções', async () => {
    const { app } = await montarApp();
    fechar = () => app.close();
    const r = await app.inject({ method: 'POST', url: '/api/v1/jobs/alertas:executar', headers: comoGestor() });
    const alertas = (r.json() as { alertas: Array<{ codigo: string; dataLimiteAcao?: string; diasParaLimite?: number; eventoAncora?: string; impactoValor?: number; opcoes?: Array<{ ordem: number; viabilidade: string; titulo: string }> }> }).alertas;

    // Janela de decisão: data-limite para agir + evento-âncora.
    const fimAno = alertas.find((a) => a.codigo === 'AL-FIM-ANO-ECONOMICO');
    expect(fimAno).toBeDefined();
    expect(fimAno!.dataLimiteAcao).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(fimAno!.eventoAncora).toContain('ano económico');
    expect(fimAno!.impactoValor).toBeGreaterThan(0); // saldo por executar quantificado

    // Escada de opções no alerta preditivo de perfil.
    const perfil = alertas.find((a) => a.codigo === 'AL-PERFIL-ESGOTA-ANTES-TERMINO');
    expect(perfil).toBeDefined();
    expect(perfil!.opcoes!.length).toBeGreaterThan(0);
    expect(perfil!.opcoes!.map((o) => o.ordem)).toEqual(perfil!.opcoes!.map((_, i) => i + 1));
    expect(perfil!.opcoes![perfil!.opcoes!.length - 1]!.titulo).toBe('Preparar novo procedimento');

    // Fim de ciclo com lead time (procedimento + visto).
    expect(alertas.some((a) => a.codigo === 'AL-NOVO-PROCEDIMENTO' && a.dataLimiteAcao !== undefined)).toBe(true);
  });

  it('gera AL-PORTARIA-LIMITA-VIGENCIA quando a portaria trava a vigência abaixo do máximo legal', async () => {
    const { app, ctx } = await montarApp();
    fechar = () => app.close();
    const c = (await ctx.repos.contratos.todos((x) => x.estado === 'EM_VIGOR'))[0]!;
    // Vigência curta (1 ano) coberta pela portaria: há margem até aos 36 meses.
    await ctx.repos.contratos.guardar({
      ...c, dataInicioVigencia: '2026-01-01', dataTerminoContratual: '2026-12-31',
      portariaExtensaoEncargos: { numero: 'P-77', data: '2025-12-01', reparticaoAnual: [{ ano: 2026, montante: 100_000_00 }] },
    });
    const r = await app.inject({ method: 'POST', url: '/api/v1/jobs/alertas:executar', headers: comoGestor() });
    const alertas = (r.json() as { alertas: Array<{ codigo: string; contratoId: string; dataLimiteAcao?: string }> }).alertas;
    const a = alertas.find((x) => x.codigo === 'AL-PORTARIA-LIMITA-VIGENCIA' && x.contratoId === c.id);
    expect(a).toBeDefined();
    expect(a!.dataLimiteAcao).toBeDefined();
  });

  it('gera AL-EXECUCAO-FORA-VIGENCIA quando há registos aprovados fora da vigência', async () => {
    const { app, ctx } = await montarApp();
    fechar = () => app.close();
    const c = (await ctx.repos.contratos.todos((x) => x.estado === 'EM_VIGOR'))[0]!;
    const reg = (await ctx.repos.registosTempo.todos((r) => r.contratoId === c.id && r.estado === 'APROVADO'))[0]!;
    await ctx.repos.registosTempo.guardar({ ...reg, id: 'rt-fora', data: '2020-01-15' }); // muito antes da vigência
    const r = await app.inject({ method: 'POST', url: '/api/v1/jobs/alertas:executar', headers: comoGestor() });
    const alertas = (r.json() as { alertas: Array<{ codigo: string; contratoId: string }> }).alertas;
    expect(alertas.some((a) => a.codigo === 'AL-EXECUCAO-FORA-VIGENCIA' && a.contratoId === c.id)).toBe(true);
  });

  it('gera AL-PORTARIA-REPROGRAMAR quando a vigência ultrapassa o ano coberto pela portaria', async () => {
    const { app, ctx } = await montarApp();
    fechar = () => app.close();
    const c = (await ctx.repos.contratos.todos((x) => x.estado === 'EM_VIGOR'))[0]!;
    // Término em 2027; portaria cobre só até 2026 → reprogramação necessária.
    await ctx.repos.contratos.guardar({ ...c, portariaExtensaoEncargos: { numero: 'P-99', data: '2025-12-01', reparticaoAnual: [{ ano: 2026, montante: 100_000_00 }] } });
    const r = await app.inject({ method: 'POST', url: '/api/v1/jobs/alertas:executar', headers: comoGestor() });
    const alertas = (r.json() as { alertas: Array<{ codigo: string; contratoId: string }> }).alertas;
    expect(alertas.some((a) => a.codigo === 'AL-PORTARIA-REPROGRAMAR' && a.contratoId === c.id)).toBe(true);
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
