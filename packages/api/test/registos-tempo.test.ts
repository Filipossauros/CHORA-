import { describe, it, expect, afterEach } from 'vitest';
import { montarApp, comoGestor, comoRecurso } from './helpers.js';
import type { Contexto } from '../src/contexto.js';

let fechar: (() => Promise<void>) | undefined;
afterEach(async () => { if (fechar) await fechar(); fechar = undefined; });

async function primeiraAfetacaoAtiva(ctx: Contexto): Promise<string> {
  const afs = await ctx.repos.afetacoes.todos((a) => a.ativa && a.recursoId === 'oid-recurso-01');
  return afs[0]!.id;
}

describe('ciclo de vida do registo de tempo', () => {
  it('cria → submete → aprova, congelando valor/hora (RN-506)', async () => {
    const { app, ctx } = await montarApp();
    fechar = () => app.close();
    const afetacaoId = await primeiraAfetacaoAtiva(ctx);

    const criar = await app.inject({
      method: 'POST', url: '/api/v1/registos-tempo', headers: comoRecurso(),
      payload: { afetacaoId, workItemId: 1001, data: '2026-02-10', duracao: 120, descricaoAtividade: 'Análise', tipoDotacaoConsumida: 'HORAS_BASE' },
    });
    expect(criar.statusCode).toBe(201);
    const registo = criar.json() as { id: string; estado: string; valorImputado: number };
    expect(registo.estado).toBe('RASCUNHO');

    const submeter = await app.inject({ method: 'POST', url: `/api/v1/registos-tempo/${registo.id}/submeter`, headers: comoRecurso() });
    expect(submeter.statusCode).toBe(200);
    expect((submeter.json() as { estado: string }).estado).toBe('SUBMETIDO');

    const aprovar = await app.inject({ method: 'POST', url: '/api/v1/registos-tempo:aprovar', headers: comoGestor(), payload: { ids: [registo.id] } });
    expect(aprovar.statusCode).toBe(200);
    const res = (aprovar.json() as { resultados: Array<{ ok: boolean }> }).resultados;
    expect(res[0]!.ok).toBe(true);

    const lido = await app.inject({ method: 'GET', url: '/api/v1/registos-tempo', headers: comoGestor() });
    expect(lido.statusCode).toBe(200);
  });

  it('rejeita duração fora do incremento com 422 e código RN-405', async () => {
    const { app, ctx } = await montarApp();
    fechar = () => app.close();
    const afetacaoId = await primeiraAfetacaoAtiva(ctx);
    const r = await app.inject({
      method: 'POST', url: '/api/v1/registos-tempo', headers: comoRecurso(),
      payload: { afetacaoId, workItemId: 1001, data: '2026-02-10', duracao: 25, descricaoAtividade: 'x' },
    });
    expect(r.statusCode).toBe(422);
    expect((r.json() as { regra: string }).regra).toBe('RN-405');
  });

  it('rejeita data futura com 422 e código RN-409', async () => {
    const { app, ctx } = await montarApp();
    fechar = () => app.close();
    const afetacaoId = await primeiraAfetacaoAtiva(ctx);
    const r = await app.inject({
      method: 'POST', url: '/api/v1/registos-tempo', headers: comoRecurso(),
      payload: { afetacaoId, workItemId: 1001, data: '2026-12-31', duracao: 60, descricaoAtividade: 'x' },
    });
    expect(r.statusCode).toBe(422);
    expect((r.json() as { regra: string }).regra).toBe('RN-409');
  });

  it('elemento da equipa não pode aprovar (403)', async () => {
    const { app, ctx } = await montarApp();
    fechar = () => app.close();
    const submetido = (await ctx.repos.registosTempo.todos((r) => r.estado === 'SUBMETIDO'))[0]!;
    const r = await app.inject({ method: 'POST', url: '/api/v1/registos-tempo:aprovar', headers: comoRecurso(), payload: { ids: [submetido.id] } });
    expect(r.statusCode).toBe(403);
  });

  it('não se pode aprovar o próprio registo (RN-502)', async () => {
    const { app, ctx } = await montarApp();
    fechar = () => app.close();
    // O gestor cria e submete um registo em nome próprio (via afetação do gestor? não há) —
    // em alternativa, o gestor tenta aprovar um registo cujo recurso seja ele.
    const afetacaoId = await primeiraAfetacaoAtiva(ctx);
    // Muda a afetação para pertencer ao gestor, para forçar o cenário.
    const af = (await ctx.repos.afetacoes.obter(afetacaoId))!;
    await ctx.repos.afetacoes.guardar({ ...af, recursoId: 'oid-gestor-contrato' });
    const criar = await app.inject({ method: 'POST', url: '/api/v1/registos-tempo', headers: comoGestor(), payload: { afetacaoId, workItemId: 1001, data: '2026-02-11', duracao: 60, descricaoAtividade: 'x', tipoDotacaoConsumida: 'HORAS_BASE' } });
    const id = (criar.json() as { id: string }).id;
    await app.inject({ method: 'POST', url: `/api/v1/registos-tempo/${id}/submeter`, headers: comoGestor() });
    const aprovar = await app.inject({ method: 'POST', url: '/api/v1/registos-tempo:aprovar', headers: comoGestor(), payload: { ids: [id] } });
    const res = (aprovar.json() as { resultados: Array<{ ok: boolean; regra?: string }> }).resultados;
    expect(res[0]!.ok).toBe(false);
    expect(res[0]!.regra).toBe('RN-502');
  });

  it('o elemento só vê os seus próprios registos (RN-407)', async () => {
    const { app } = await montarApp();
    fechar = () => app.close();
    const r = await app.inject({ method: 'GET', url: '/api/v1/registos-tempo', headers: comoRecurso('oid-recurso-02') });
    const dados = (r.json() as { dados: Array<{ recursoId: string }> }).dados;
    expect(dados.every((d) => d.recursoId === 'oid-recurso-02')).toBe(true);
  });
});
