import { describe, it, expect, afterEach } from 'vitest';
import { montarApp, comoGestor, comoRecurso } from './helpers.js';
import type { Contexto } from '../src/contexto.js';

let fechar: (() => Promise<void>) | undefined;
afterEach(async () => { if (fechar) await fechar(); fechar = undefined; });

/** Contrato chave-na-mão do seed (200 000 € · bolsa de horas de 30 000 €). */
async function chaveNaMao(ctx: Contexto): Promise<string> {
  return (await ctx.repos.contratos.todos((c) => c.numero === 'C-2026-CM1'))[0]!.id;
}
async function bolsaHoras(ctx: Contexto): Promise<string> {
  return (await ctx.repos.contratos.todos((c) => c.numero === 'C-2026-001'))[0]!.id;
}
const h = (c: string): string => c.repeat(64);

describe('entregáveis de contratos chave-na-mão', () => {
  it('cria entregável indicando o valor em euros', async () => {
    const { app, ctx } = await montarApp();
    fechar = () => app.close();
    const id = await chaveNaMao(ctx);
    const r = await app.inject({ method: 'POST', url: `/api/v1/contratos/${id}/entregaveis`, headers: comoGestor(), payload: { designacao: 'E5 · Formação', valor: 10_000_00 } });
    expect(r.statusCode).toBe(201);
    const e = r.json() as { valor: number; percentagemContrato: number; entregue: boolean };
    expect(e.valor).toBe(10_000_00);
    expect(e.percentagemContrato).toBeCloseTo(0.05, 5);
    expect(e.entregue).toBe(false);
  });

  it('cria entregável indicando a percentagem do contrato', async () => {
    const { app, ctx } = await montarApp();
    fechar = () => app.close();
    const id = await chaveNaMao(ctx);
    const r = await app.inject({ method: 'POST', url: `/api/v1/contratos/${id}/entregaveis`, headers: comoGestor(), payload: { designacao: 'E5 · Formação', percentagemContrato: 0.05 } });
    expect(r.statusCode).toBe(201);
    expect((r.json() as { valor: number }).valor).toBe(10_000_00);
  });

  it('recusa entregável sem valor nem percentagem', async () => {
    const { app, ctx } = await montarApp();
    fechar = () => app.close();
    const id = await chaveNaMao(ctx);
    const r = await app.inject({ method: 'POST', url: `/api/v1/contratos/${id}/entregaveis`, headers: comoGestor(), payload: { designacao: 'E5' } });
    expect(r.statusCode).toBe(400);
  });

  it('recusa entregáveis que, com a bolsa, excedam o preço contratual (RN-112)', async () => {
    const { app, ctx } = await montarApp();
    fechar = () => app.close();
    const id = await chaveNaMao(ctx);
    // No seed: 160 000 € em entregáveis + 30 000 € de bolsa, sobram 10 000 €.
    const r = await app.inject({ method: 'POST', url: `/api/v1/contratos/${id}/entregaveis`, headers: comoGestor(), payload: { designacao: 'E5', valor: 10_000_01 } });
    expect(r.statusCode).toBe(422);
    expect((r.json() as { regra?: string }).regra).toBe('RN-112');
  });

  it('recusa entregáveis num contrato de bolsa de horas', async () => {
    const { app, ctx } = await montarApp();
    fechar = () => app.close();
    const id = await bolsaHoras(ctx);
    const r = await app.inject({ method: 'POST', url: `/api/v1/contratos/${id}/entregaveis`, headers: comoGestor(), payload: { designacao: 'E1', valor: 1_000_00 } });
    expect(r.statusCode).toBe(400);
  });

  it('a entrega é reversível enquanto não houver fatura', async () => {
    const { app, ctx } = await montarApp();
    fechar = () => app.close();
    const id = await chaveNaMao(ctx);
    const e3 = (await ctx.repos.entregaveis.todos((x) => x.contratoId === id && !x.entregue))[0]!;
    const entrega = await app.inject({ method: 'POST', url: `/api/v1/entregaveis/${e3.id}/entrega`, headers: comoGestor(), payload: { entregueEm: '2026-07-01', nota: 'aceite sem reservas' } });
    expect(entrega.statusCode).toBe(200);
    expect((entrega.json() as { entregue: boolean; entregueEm: string }).entregueEm).toBe('2026-07-01');
    const anular = await app.inject({ method: 'POST', url: `/api/v1/entregaveis/${e3.id}/anular-entrega`, headers: comoGestor(), payload: { motivo: 'entrega registada por engano' } });
    expect(anular.statusCode).toBe(200);
    expect((anular.json() as { entregue: boolean }).entregue).toBe(false);
  });

  it('um entregável já faturado não pode ser removido nem ter a entrega anulada', async () => {
    const { app, ctx } = await montarApp();
    fechar = () => app.close();
    const id = await chaveNaMao(ctx);
    const faturado = (await ctx.repos.entregaveis.todos((x) => x.contratoId === id && x.faturaId !== undefined))[0]!;
    expect((await app.inject({ method: 'DELETE', url: `/api/v1/entregaveis/${faturado.id}`, headers: comoGestor() })).statusCode).toBe(400);
    expect((await app.inject({ method: 'POST', url: `/api/v1/entregaveis/${faturado.id}/anular-entrega`, headers: comoGestor(), payload: { motivo: 'x' } })).statusCode).toBe(400);
  });

  it('o elemento não gere entregáveis', async () => {
    const { app, ctx } = await montarApp();
    fechar = () => app.close();
    const id = await chaveNaMao(ctx);
    const r = await app.inject({ method: 'POST', url: `/api/v1/contratos/${id}/entregaveis`, headers: comoRecurso(), payload: { designacao: 'E5', valor: 1_000_00 } });
    expect(r.statusCode).toBe(403);
  });

  it('a repartição separa entregue, faturado e por atribuir', async () => {
    const { app, ctx } = await montarApp();
    fechar = () => app.close();
    const id = await chaveNaMao(ctx);
    const r = await app.inject({ method: 'GET', url: `/api/v1/contratos/${id}/entregaveis`, headers: comoGestor() });
    const { dados, reparticao } = r.json() as { dados: unknown[]; reparticao: { totalEntregaveis: number; bolsaHorasValor: number; porAtribuir: number; faturavelAgora: number } };
    expect(dados.length).toBe(4);
    expect(reparticao.totalEntregaveis).toBe(160_000_00);
    expect(reparticao.bolsaHorasValor).toBe(30_000_00);
    expect(reparticao.porAtribuir).toBe(10_000_00);
    // E1 entregue e faturado; E2 entregue por faturar.
    expect(reparticao.faturavelAgora).toBe(60_000_00);
  });
});

describe('faturação de entregáveis (RN-608 e RN-609)', () => {
  /** Contrato chave-na-mão com compromisso com saldo, para faturar. */
  async function preparar(): Promise<{ app: Awaited<ReturnType<typeof montarApp>>['app']; ctx: Contexto; id: string; compromissoId: string }> {
    const { app, ctx } = await montarApp();
    const id = await chaveNaMao(ctx);
    const compromisso = await app.inject({ method: 'POST', url: `/api/v1/contratos/${id}/compromissos`, headers: comoGestor(), payload: { numero: 'CMP-TESTE', montante: 100_000_00, ano: 2026, emitidoEm: '2026-01-01' } });
    return { app, ctx, id, compromissoId: (compromisso.json() as { id: string }).id };
  }
  const fat = (compromissoId: string, over: Record<string, unknown>) => ({
    compromissoId, numero: 'FT-CM-002', tipo: 'ENTREGAVEL',
    dataEmissao: '2026-07-01', dataRececao: '2026-07-01', periodoDe: '2026-06-01', periodoAte: '2026-06-30',
    montanteSemIva: 60_000_00, montanteIva: 13_800_00, ...over,
  });

  it('fatura um entregável entregue pelo valor exato', async () => {
    const { app, ctx, id, compromissoId } = await preparar();
    fechar = () => app.close();
    const e2 = (await ctx.repos.entregaveis.todos((x) => x.contratoId === id && x.entregue && x.faturaId === undefined))[0]!;
    const r = await app.inject({ method: 'POST', url: `/api/v1/contratos/${id}/faturas`, headers: comoGestor(), payload: fat(compromissoId, { entregavelId: e2.id, montanteSemIva: e2.valor }) });
    expect(r.statusCode).toBe(201);
    expect((r.json() as { tipo: string }).tipo).toBe('ENTREGAVEL');
    // O entregável passa a faturado.
    expect((await ctx.repos.entregaveis.obter(e2.id))!.faturaId).toBe((r.json() as { id: string }).id);
  });

  it('recusa faturar um entregável ainda não entregue (RN-608)', async () => {
    const { app, ctx, id, compromissoId } = await preparar();
    fechar = () => app.close();
    const previsto = (await ctx.repos.entregaveis.todos((x) => x.contratoId === id && !x.entregue))[0]!;
    const r = await app.inject({ method: 'POST', url: `/api/v1/contratos/${id}/faturas`, headers: comoGestor(), payload: fat(compromissoId, { entregavelId: previsto.id, montanteSemIva: previsto.valor }) });
    expect(r.statusCode).toBe(422);
    expect((r.json() as { regra?: string }).regra).toBe('RN-608');
  });

  it('recusa uma fatura de entregável sem entregável identificado (RN-608)', async () => {
    const { app, id, compromissoId } = await preparar();
    fechar = () => app.close();
    const r = await app.inject({ method: 'POST', url: `/api/v1/contratos/${id}/faturas`, headers: comoGestor(), payload: fat(compromissoId, {}) });
    expect(r.statusCode).toBe(422);
    expect((r.json() as { regra?: string }).regra).toBe('RN-608');
  });

  it('recusa faturação parcial de um entregável (RN-609)', async () => {
    const { app, ctx, id, compromissoId } = await preparar();
    fechar = () => app.close();
    const e2 = (await ctx.repos.entregaveis.todos((x) => x.contratoId === id && x.entregue && x.faturaId === undefined))[0]!;
    const r = await app.inject({ method: 'POST', url: `/api/v1/contratos/${id}/faturas`, headers: comoGestor(), payload: fat(compromissoId, { entregavelId: e2.id, montanteSemIva: Math.floor(e2.valor / 2) }) });
    expect(r.statusCode).toBe(422);
    expect((r.json() as { regra?: string }).regra).toBe('RN-609');
  });

  it('recusa faturar duas vezes o mesmo entregável', async () => {
    const { app, ctx, id, compromissoId } = await preparar();
    fechar = () => app.close();
    const faturado = (await ctx.repos.entregaveis.todos((x) => x.contratoId === id && x.faturaId !== undefined))[0]!;
    const r = await app.inject({ method: 'POST', url: `/api/v1/contratos/${id}/faturas`, headers: comoGestor(), payload: fat(compromissoId, { entregavelId: faturado.id, montanteSemIva: faturado.valor }) });
    expect(r.statusCode).toBe(400);
  });

  it('a conferência de uma fatura de entregável exige o auto de entrega (RN-602) e valida sem linhas de tempo', async () => {
    const { app, ctx, id, compromissoId } = await preparar();
    fechar = () => app.close();
    const e2 = (await ctx.repos.entregaveis.todos((x) => x.contratoId === id && x.entregue && x.faturaId === undefined))[0]!;
    const criada = await app.inject({ method: 'POST', url: `/api/v1/contratos/${id}/faturas`, headers: comoGestor(), payload: fat(compromissoId, { entregavelId: e2.id, montanteSemIva: e2.valor }) });
    const fatura = criada.json() as { id: string };

    await app.inject({ method: 'POST', url: `/api/v1/faturas/${fatura.id}/documentos`, headers: comoGestor(), payload: { tipo: 'FATURA', ficheiroRef: 'a', nomeOriginal: 'f.pdf', hashSha256: h('a'), tamanhoBytes: 1 } });
    // Só com a fatura, a conferência não arranca.
    const semAuto = await app.inject({ method: 'POST', url: `/api/v1/faturas/${fatura.id}/iniciar-conferencia`, headers: comoGestor() });
    expect(semAuto.statusCode).toBe(422);
    expect((semAuto.json() as { regra?: string }).regra).toBe('RN-602');

    await app.inject({ method: 'POST', url: `/api/v1/faturas/${fatura.id}/documentos`, headers: comoGestor(), payload: { tipo: 'AUTO_ENTREGA', ficheiroRef: 'b', nomeOriginal: 'auto.pdf', hashSha256: h('b'), tamanhoBytes: 1 } });
    expect((await app.inject({ method: 'POST', url: `/api/v1/faturas/${fatura.id}/iniciar-conferencia`, headers: comoGestor() })).statusCode).toBe(200);

    const conf = await app.inject({ method: 'GET', url: `/api/v1/faturas/${fatura.id}/conferir`, headers: comoGestor() });
    const { linhas, conforme, entregavel } = conf.json() as { linhas: unknown[]; conforme: boolean; entregavel: { designacao: string } };
    expect(linhas).toEqual([]);
    expect(conforme).toBe(true);
    expect(entregavel.designacao).toBe(e2.designacao);

    const decidir = await app.inject({ method: 'POST', url: `/api/v1/faturas/${fatura.id}/decidir`, headers: comoGestor(), payload: { decisao: 'VALIDADA' } });
    expect(decidir.statusCode).toBe(200);
    const { relatorio } = decidir.json() as { relatorio: { frase: string } };
    // A frase reporta a entrega, não registos de tempo que não existem.
    expect(relatorio.frase).toContain('entregável');
    expect(relatorio.frase).not.toContain('registos de tempo aprovados');
  });
});
