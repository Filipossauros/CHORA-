import { describe, it, expect, afterEach } from 'vitest';
import { CATALOGO_ALERTAS } from '@chora/domain';
import { ServicoAlertas } from '../src/servicos/alertas.js';
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
    const { app, ctx } = await montarApp();
    fechar = () => app.close();
    const r = await app.inject({ method: 'POST', url: '/api/v1/jobs/alertas:executar', headers: comoGestor() });
    expect(r.statusCode).toBe(200);
    const alertas = (r.json() as { alertas: Array<{ codigo: string; contratoId: string }> }).alertas;
    const codigos = new Set(alertas.map((a) => a.codigo));
    // O contrato B está AGUARDA_VISTO (não EM_VIGOR), pelo que não é ele a
    // acionar o visto pendente — é o C-2026-TC1, que está em execução sem visto.
    const contratoB = (await ctx.repos.contratos.todos((c) => c.numero === 'C-2026-002'))[0]!;
    expect(alertas.some((a) => a.codigo === 'AL-VISTO-PENDENTE' && a.contratoId === contratoB.id)).toBe(false);
    expect(codigos.has('AL-COMPLEMENTARES-40')).toBe(true);
    expect(codigos.has('AL-PERFIL-90')).toBe(true); // C-2026-BH3 tem um perfil quase esgotado
    // Alertas pré-contratuais removidos (só execução):
    expect(codigos.has('AL-HABILITACAO')).toBe(false);
    expect(codigos.has('AL-PUBLICITACAO')).toBe(false);
  });

  it('o seed exercita TODAS as regras de alerta do catálogo', async () => {
    const { app } = await montarApp();
    fechar = () => app.close();
    const r = await app.inject({ method: 'POST', url: '/api/v1/jobs/alertas:executar', headers: comoGestor() });
    const gerados = new Set(((r.json() as { alertas: Array<{ codigo: string }> }).alertas).map((a) => a.codigo));
    const porAcionar = CATALOGO_ALERTAS.map((a) => a.codigo).filter((c) => !gerados.has(c));
    // Se falhar, o seed deixou de cobrir algum alerta — ajustar os cenários.
    expect(porAcionar, `alertas sem cenário no seed: ${porAcionar.join(', ')}`).toEqual([]);
  });

  it('reexecutar o job não duplica decisões (identidade estável)', async () => {
    const { app } = await montarApp();
    fechar = () => app.close();
    const p = () => app.inject({ method: 'POST', url: '/api/v1/jobs/alertas:executar', headers: comoGestor() });
    const r1 = (await p()).json() as { gerados: number; novas: number };
    const r2 = (await p()).json() as { gerados: number; novas: number };
    expect(r1.novas).toBeGreaterThan(0);
    expect(r2.gerados).toBe(r1.gerados); // mesmo total
    expect(r2.novas).toBe(0); // nada é novo na segunda passagem
  });

  it('dispensar tira a decisão da fila e reabre quando agrava', async () => {
    const { app, ctx } = await montarApp();
    fechar = () => app.close();
    await app.inject({ method: 'POST', url: '/api/v1/jobs/alertas:executar', headers: comoGestor() });
    const antes = (await app.inject({ method: 'GET', url: '/api/v1/decisoes', headers: comoGestor() })).json() as { dados: Array<{ id: string; codigo: string; severidade: string }> };
    const alvo = antes.dados.find((a) => a.severidade !== 'CRITICO')!;

    const d = await app.inject({ method: 'POST', url: `/api/v1/alertas/${alvo.id}/dispensar`, headers: comoGestor(), payload: { motivo: 'tratado fora', dias: 30 } });
    expect(d.statusCode).toBe(200);
    const depois = (await app.inject({ method: 'GET', url: '/api/v1/decisoes', headers: comoGestor() })).json() as { dados: unknown[] };
    expect(depois.dados.length).toBe(antes.dados.length - 1);

    // Reexecutar não a traz de volta enquanto a dispensa durar.
    await app.inject({ method: 'POST', url: '/api/v1/jobs/alertas:executar', headers: comoGestor() });
    const aindaDispensada = await ctx.repos.alertas.obter(alvo.id);
    expect(aindaDispensada?.estado).toBe('DISPENSADA');

    // Agravar a severidade reabre.
    await ctx.repos.alertas.guardar({ ...aindaDispensada!, severidade: 'INFO' });
    await app.inject({ method: 'POST', url: '/api/v1/jobs/alertas:executar', headers: comoGestor() });
    expect((await ctx.repos.alertas.obter(alvo.id))?.estado).toBe('ABERTA');
  });

  it('a lista de dispensadas mostra as vivas e esquece as de contratos findos', async () => {
    const { app, ctx } = await montarApp();
    fechar = () => app.close();
    await app.inject({ method: 'POST', url: '/api/v1/jobs/alertas:executar', headers: comoGestor() });
    const abertas = (await app.inject({ method: 'GET', url: '/api/v1/decisoes', headers: comoGestor() })).json() as { dados: Array<{ id: string; contratoId: string; severidade: string }> };
    const alvo = abertas.dados.find((a) => a.severidade !== 'CRITICO')!;
    await app.inject({ method: 'POST', url: `/api/v1/alertas/${alvo.id}/dispensar`, headers: comoGestor(), payload: { motivo: 'tratado fora', dias: 30 } });

    const servico = new ServicoAlertas(ctx);
    expect((await servico.dispensadas()).map((a) => a.id)).toContain(alvo.id);

    // Terminada a vigência, a dispensa deixa de ser decisão adiada: sai da
    // lista e fica só no registo de auditoria.
    const contrato = (await ctx.repos.contratos.obter(alvo.contratoId))!;
    await ctx.repos.contratos.guardar({ ...contrato, estado: 'TERMINADO' });
    expect((await servico.dispensadas()).map((a) => a.id)).not.toContain(alvo.id);

    // O rasto da dispensa permanece em auditoria.
    const eventos = await ctx.repos.eventosAuditoria.todos((e) => e.entidadeId === alvo.id);
    expect(eventos.some((e) => e.operacao === 'ALERTA:DISPENSAR')).toBe(true);
  });

  it('a decisão com escada traz prazo por opção, destino e nota jurídica', async () => {
    const { app, ctx } = await montarApp();
    fechar = () => app.close();
    await app.inject({ method: 'POST', url: '/api/v1/jobs/alertas:executar', headers: comoGestor() });
    const comEscada = (await ctx.repos.alertas.todos((a) => a.codigo === 'AL-PERFIL-ESGOTA-ANTES-TERMINO'))[0]!;

    expect(comEscada.opcoes!.length).toBeGreaterThan(1);
    // Toda a opção viável tem prazo próprio e um sítio onde se pratica o ato.
    for (const o of comEscada.opcoes!.filter((x) => x.viabilidade !== 'INVIAVEL')) {
      expect(o.dataLimite, o.titulo).toBeDefined();
      expect(o.acao, o.titulo).toBeDefined();
    }
    // O prazo do alerta é o mais curto das opções — a primeira a perder-se.
    const maisCurta = comEscada.opcoes!
      .filter((o) => o.dataLimite !== undefined && o.viabilidade !== 'INVIAVEL')
      .map((o) => o.dataLimite!)
      .sort()[0];
    expect(comEscada.dataLimiteAcao).toBe(maisCurta);
    expect(comEscada.eventoAncora).toContain('primeira a perder-se');
    // Impacto legível em dias úteis, e reserva jurídica das opções.
    expect(comEscada.diasUteisRestantes).toBeGreaterThan(0);
    expect(comEscada.notaJuridica).toContain('não dispensa');
  });

  it('dispensar sem motivo falha; o elemento não pode dispensar', async () => {
    const { app } = await montarApp();
    fechar = () => app.close();
    await app.inject({ method: 'POST', url: '/api/v1/jobs/alertas:executar', headers: comoGestor() });
    const lista = (await app.inject({ method: 'GET', url: '/api/v1/decisoes', headers: comoGestor() })).json() as { dados: Array<{ id: string }> };
    const id = lista.dados[0]!.id;
    expect((await app.inject({ method: 'POST', url: `/api/v1/alertas/${id}/dispensar`, headers: comoGestor(), payload: { dias: 30 } })).statusCode).toBe(400);
    expect((await app.inject({ method: 'POST', url: `/api/v1/alertas/${id}/dispensar`, headers: comoRecurso(), payload: { motivo: 'x', dias: 30 } })).statusCode).toBe(403);
  });

  it('registar a transição resolve automaticamente a decisão que a pedia', async () => {
    const { app, ctx } = await montarApp();
    fechar = () => app.close();
    await app.inject({ method: 'POST', url: '/api/v1/jobs/alertas:executar', headers: comoGestor() });
    const pendentes = (await app.inject({ method: 'GET', url: '/api/v1/decisoes', headers: comoGestor() })).json() as { dados: Array<{ id: string; codigo: string; contratoId: string }> };
    const fimAno = pendentes.dados.find((a) => a.codigo === 'AL-FIM-ANO-ECONOMICO')!;
    expect(fimAno).toBeDefined();

    const { ServicoContratos } = await import('../src/servicos/contratos.js');
    await new ServicoContratos(ctx).transitarAnoEconomico(
      fimAno.contratoId, 1000_00, '2027-06-30', 'Saldo por executar.',
      { utilizadorId: 'oid-gestor-contrato', papeis: ['GESTOR_CONTRATO'], projetoId: 'proj-P1', validoAte: '2030-01-01T00:00:00.000Z' },
    );
    const resolvida = await ctx.repos.alertas.obter(fimAno.id);
    expect(resolvida?.estado).toBe('RESOLVIDA');
    expect(resolvida?.motivoResolucao).toContain('Transição');
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
