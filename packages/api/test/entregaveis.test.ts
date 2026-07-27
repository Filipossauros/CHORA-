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
    numeroContratoIndicado: 'C-2026-CM1', nifPrestadorIndicado: '500000001',
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

describe('licenciamento — uma fatura, pela totalidade', () => {
  async function licenciamento(ctx: Contexto, numero: string): Promise<{ id: string; preco: number; numeroC: string }> {
    const c = (await ctx.repos.contratos.todos((x) => x.numero === numero))[0]!;
    return { id: c.id, preco: c.precoContratualAtual, numeroC: c.numero };
  }
  const fat = (over: Record<string, unknown> & { numeroContratoIndicado: string }) => ({
    numero: 'FT-LIC-NOVA', nifPrestadorIndicado: '500000001',
    dataEmissao: '2026-07-01', dataRececao: '2026-07-01',
    periodoDe: '2026-07-01', periodoAte: '2027-06-30', montanteIva: 0, ...over,
  });

  it('fatura o contrato de licenciamento pela totalidade', async () => {
    const { app, ctx } = await montarApp();
    fechar = () => app.close();
    const { id, preco, numeroC } = await licenciamento(ctx, 'C-2026-LIC2');
    const r = await app.inject({ method: 'POST', url: `/api/v1/contratos/${id}/faturas`, headers: comoGestor(), payload: fat({ numeroContratoIndicado: numeroC, montanteSemIva: preco }) });
    expect(r.statusCode).toBe(201);
    // O tipo é derivado do contrato, sem ter de ser indicado.
    expect((r.json() as { tipo: string }).tipo).toBe('LICENCIAMENTO');
  });

  it('recusa faturação parcial de um licenciamento (RN-611)', async () => {
    const { app, ctx } = await montarApp();
    fechar = () => app.close();
    const { id, preco, numeroC } = await licenciamento(ctx, 'C-2026-LIC2');
    const r = await app.inject({ method: 'POST', url: `/api/v1/contratos/${id}/faturas`, headers: comoGestor(), payload: fat({ numeroContratoIndicado: numeroC, montanteSemIva: Math.floor(preco / 2) }) });
    expect(r.statusCode).toBe(422);
    expect((r.json() as { regra?: string }).regra).toBe('RN-611');
  });

  it('recusa a segunda fatura de um licenciamento (RN-610)', async () => {
    const { app, ctx } = await montarApp();
    fechar = () => app.close();
    // O C-2026-LIC1 já vem faturado no seed.
    const { id, preco, numeroC } = await licenciamento(ctx, 'C-2026-LIC1');
    const r = await app.inject({ method: 'POST', url: `/api/v1/contratos/${id}/faturas`, headers: comoGestor(), payload: fat({ numeroContratoIndicado: numeroC, montanteSemIva: preco }) });
    expect(r.statusCode).toBe(422);
    expect((r.json() as { regra?: string }).regra).toBe('RN-610');
  });

  it('a nota de crédito passa, porque corrige em vez de acrescentar', async () => {
    const { app, ctx } = await montarApp();
    fechar = () => app.close();
    const { id, numeroC } = await licenciamento(ctx, 'C-2026-LIC1');
    const r = await app.inject({ method: 'POST', url: `/api/v1/contratos/${id}/faturas`, headers: comoGestor(), payload: fat({ numeroContratoIndicado: numeroC, numero: 'NC-2026/1', montanteSemIva: -5_000_00 }) });
    expect(r.statusCode).toBe(201);
  });

  it('recusa criar licenciamento sem vigência da licença (RN-113)', async () => {
    const { app } = await montarApp();
    fechar = () => app.close();
    const r = await app.inject({ method: 'POST', url: '/api/v1/contratos', headers: comoGestor(), payload: {
      numero: 'C-2026-LICX', objeto: 'Licenças', tipologia: 'LICENCIAMENTO', estado: 'EM_VIGOR',
      precoContratualInicial: 10_000_00, precoContratualAtual: 10_000_00,
      prestador: { nome: 'X', nipc: '500000001' },
      dataAssinaturaCA: '2026-01-01', dataInicioVigencia: '2026-01-01', dataTerminoContratual: '2027-01-01',
      vistoTribunalContasNecessario: false, gestores: [{ utilizadorId: 'oid-gestor-contrato', principal: true }], excecoes: [],
    } });
    expect(r.statusCode).toBe(422);
    expect((r.json() as { regra?: string }).regra).toBe('RN-113');
  });

  it('recusa licença que ultrapassa a vigência do contrato (RN-114)', async () => {
    const { app } = await montarApp();
    fechar = () => app.close();
    const r = await app.inject({ method: 'POST', url: '/api/v1/contratos', headers: comoGestor(), payload: {
      numero: 'C-2026-LICY', objeto: 'Licenças', tipologia: 'LICENCIAMENTO', estado: 'EM_VIGOR',
      precoContratualInicial: 10_000_00, precoContratualAtual: 10_000_00,
      prestador: { nome: 'X', nipc: '500000001' },
      dataAssinaturaCA: '2026-01-01', dataInicioVigencia: '2026-01-01', dataTerminoContratual: '2027-01-01',
      vigenciaLicenciamento: { de: '2026-01-01', ate: '2028-01-01' },
      vistoTribunalContasNecessario: false, gestores: [{ utilizadorId: 'oid-gestor-contrato', principal: true }], excecoes: [],
    } });
    expect(r.statusCode).toBe(422);
    expect((r.json() as { regra?: string }).regra).toBe('RN-114');
  });
});

describe('receber e conferir numa transição', () => {
  it('recebe, extrai as linhas dos registos aprovados e devolve a conferência', async () => {
    const { app, ctx } = await montarApp();
    fechar = () => app.close();
    const contrato = (await ctx.repos.contratos.todos((c) => c.numero === 'C-2026-001'))[0]!;
    const aprovados = await ctx.repos.registosTempo.todos((r) => r.contratoId === contrato.id && r.estado === 'APROVADO');
    const total = aprovados.reduce((s, r) => s + r.valorImputado, 0);
    const compromisso = await app.inject({ method: 'POST', url: `/api/v1/contratos/${contrato.id}/compromissos`, headers: comoGestor(), payload: { numero: 'CMP-RC', montante: 100_000_00, ano: 2026, emitidoEm: '2026-01-01' } });

    const r = await app.inject({ method: 'POST', url: `/api/v1/contratos/${contrato.id}/faturas:receber-e-conferir`, headers: comoGestor(), payload: {
      compromissoId: (compromisso.json() as { id: string }).id, numero: 'FT-RC-001',
      numeroContratoIndicado: contrato.numero, nifPrestadorIndicado: contrato.prestador.nipc,
      dataEmissao: '2026-07-01', dataRececao: '2026-07-01',
      periodoDe: aprovados[0]!.data, periodoAte: aprovados[0]!.data,
      montanteSemIva: total, montanteIva: 0,
      // Um único ficheiro com fatura e relatório (RN-602).
      documentos: [{ tipo: 'FATURA_COM_RELATORIO', ficheiroRef: 'a', nomeOriginal: 'f.pdf', hashSha256: h('a'), tamanhoBytes: 1 }],
    } });
    expect(r.statusCode).toBe(201);
    const { fatura, conferencia } = r.json() as { fatura: { estado: string; linhas: unknown[] }; conferencia: { conforme: boolean; linhas: unknown[] } };
    // Uma só chamada deixa a fatura em conferência, com linhas e resultado.
    expect(fatura.estado).toBe('EM_CONFERENCIA');
    expect(fatura.linhas.length).toBeGreaterThan(0);
    expect(conferencia.conforme).toBe(true);
    expect(conferencia.linhas.length).toBeGreaterThan(0);
  });

  it('divergência traz o motivo já redigido', async () => {
    const { app, ctx } = await montarApp();
    fechar = () => app.close();
    const contrato = (await ctx.repos.contratos.todos((c) => c.numero === 'C-2026-001'))[0]!;
    const aprovado = (await ctx.repos.registosTempo.todos((r) => r.contratoId === contrato.id && r.estado === 'APROVADO'))[0]!;
    const compromisso = await app.inject({ method: 'POST', url: `/api/v1/contratos/${contrato.id}/compromissos`, headers: comoGestor(), payload: { numero: 'CMP-RC2', montante: 100_000_00, ano: 2026, emitidoEm: '2026-01-01' } });

    const r = await app.inject({ method: 'POST', url: `/api/v1/contratos/${contrato.id}/faturas:receber-e-conferir`, headers: comoGestor(), payload: {
      compromissoId: (compromisso.json() as { id: string }).id, numero: 'FT-RC-002',
      numeroContratoIndicado: contrato.numero, nifPrestadorIndicado: contrato.prestador.nipc,
      dataEmissao: '2026-07-01', dataRececao: '2026-07-01', periodoDe: aprovado.data, periodoAte: aprovado.data,
      montanteSemIva: 99_00, montanteIva: 0,
      documentos: [{ tipo: 'FATURA_COM_RELATORIO', ficheiroRef: 'a', nomeOriginal: 'f.pdf', hashSha256: h('a'), tamanhoBytes: 1 }],
      // Linhas com o dobro das horas efetivamente aprovadas.
      linhas: [{ perfilId: aprovado.perfilId, recursoId: aprovado.recursoId, quantidade: aprovado.duracao * 2, valorHora: aprovado.valorHoraAplicado, montante: aprovado.valorImputado * 2, origem: 'EXTRAIDA' }],
    } });
    const { conferencia } = r.json() as { conferencia: { conforme: boolean; motivo?: string } };
    expect(conferencia.conforme).toBe(false);
    expect(conferencia.motivo).toContain('Divergência');
    expect(conferencia.motivo).toContain('quantidade faturada');
  });
});
