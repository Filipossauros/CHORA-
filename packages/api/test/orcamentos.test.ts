import { describe, it, expect, afterEach } from 'vitest';
import { montarApp, comoGestor, comoRecurso } from './helpers.js';
import type { Contexto } from '../src/contexto.js';

let fechar: (() => Promise<unknown>) | undefined;
afterEach(async () => { await fechar?.(); fechar = undefined; });

interface Resumo {
  ano: number;
  projetos: Array<{ projetoId: string; linhas: Array<{ id: string; origem: string; tipologia: string }>; totalAnoOrcamentado: number; totalPlurianual: number }>;
  cobertura: Array<{ ano: number; encargo: number; coberto: number; aCobrir: number; excedeCompetenciaCA: boolean }>;
  total: number;
  totalACobrir: number;
  anosAcimaDaCompetenciaCA: number[];
  limiteAnualCA: number;
}
interface Resposta { orcamento: { id: string; ano: number; estado: string; linhas: Array<Record<string, unknown>> }; resumo: Resumo; projetos: Array<{ id: string; nome: string }> }

describe('orçamentação da unidade', () => {
  it('a proposta nasce da carteira, com origem por contrato', async () => {
    const { app } = await montarApp();
    fechar = () => app.close();
    const r = await app.inject({ method: 'POST', url: '/api/v1/orcamentos', headers: comoGestor(), payload: { ano: 2027 } });
    expect(r.statusCode).toBe(201);
    const { orcamento, resumo, projetos } = r.json() as Resposta;
    expect(orcamento.estado).toBe('EM_PREPARACAO');
    expect(orcamento.linhas.length).toBeGreaterThan(0);
    // Os projetos vêm com nome — um orçamento com «proj-P1» não se apresenta.
    expect(projetos.find((p) => p.id === 'proj-P1')?.nome).toBe('Modernização documental');
    // Há pelo menos uma renovação: o seed tem licenciamentos.
    const origens = resumo.projetos.flatMap((p) => p.linhas.map((l) => l.origem));
    expect(origens).toContain('RENOVACAO');
  });

  it('o licenciamento entra como renovação e o chave-na-mão por entregáveis', async () => {
    const { app } = await montarApp();
    fechar = () => app.close();
    const { resumo } = (await app.inject({ method: 'POST', url: '/api/v1/orcamentos', headers: comoGestor(), payload: { ano: 2027 } })).json() as Resposta;
    const linhas = resumo.projetos.flatMap((p) => p.linhas);
    expect(linhas.some((l) => l.tipologia === 'LICENCIAMENTO' && l.origem === 'RENOVACAO')).toBe(true);
    expect(linhas.some((l) => l.tipologia === 'CHAVE_NA_MAO')).toBe(true);
  });

  it('editar uma linha recalcula o valor e o resumo', async () => {
    const { app } = await montarApp();
    fechar = () => app.close();
    const criado = (await app.inject({ method: 'POST', url: '/api/v1/orcamentos', headers: comoGestor(), payload: { ano: 2027 } })).json() as Resposta;
    const linha = criado.orcamento.linhas.find((l) => (l['perfis'] as unknown[]).length > 0) as Record<string, unknown>;
    const perfis = (linha['perfis'] as Array<Record<string, number>>).map((p) => ({ ...p, minutosPropostos: p['minutosReferencia']! * 2 }));
    const antes = criado.resumo.total;

    const r = await app.inject({
      method: 'PUT', url: `/api/v1/orcamentos/${criado.orcamento.id}/linhas/${String(linha['id'])}`,
      headers: comoGestor(), payload: { ...linha, perfis, variacao: 'AUMENTO' },
    });
    expect(r.statusCode).toBe(200);
    expect((r.json() as Resposta).resumo.total).toBeGreaterThan(antes);
  });

  it('o encargo já coberto por portaria não conta para o que falta autorizar', async () => {
    const { app, ctx } = await montarApp();
    fechar = () => app.close();
    // Compara com e sem a portaria: o que muda é a cobertura, não o encargo —
    // uma portaria já aprovada não é despesa nova, é despesa já autorizada.
    const antes = ((await app.inject({ method: 'POST', url: '/api/v1/orcamentos', headers: comoGestor(), payload: { ano: 2027 } })).json() as Resposta).resumo;

    const { app: app2, ctx: ctx2 } = await montarApp();
    await comPortariaPlurianual(ctx2, 2027, 60_000_00);
    const depois = ((await app2.inject({ method: 'POST', url: '/api/v1/orcamentos', headers: comoGestor(), payload: { ano: 2027 } })).json() as Resposta).resumo;
    await app2.close();

    const a = antes.cobertura.find((c) => c.ano === 2027)!;
    const d = depois.cobertura.find((c) => c.ano === 2027)!;
    expect(d.encargo).toBe(a.encargo);
    expect(d.coberto - a.coberto).toBe(60_000_00);
    expect(a.aCobrir - d.aCobrir).toBe(60_000_00);
    void ctx;
  });

  it('sinaliza o ano futuro acima da competência do CA (RN-115)', async () => {
    const { app } = await montarApp();
    fechar = () => app.close();
    const criado = (await app.inject({ method: 'POST', url: '/api/v1/orcamentos', headers: comoGestor(), payload: { ano: 2027 } })).json() as Resposta;
    expect(criado.resumo.limiteAnualCA).toBe(500_000_00);

    // Um entregável de 640 000 € em 2028: um só ano futuro chega para exigir
    // despacho conjunto.
    const linha = criado.orcamento.linhas[0]!;
    const r = await app.inject({
      method: 'PUT', url: `/api/v1/orcamentos/${criado.orcamento.id}/linhas/${String(linha['id'])}`,
      headers: comoGestor(),
      payload: { ...linha, entregaveis: [{ designacao: 'Fase 2', valor: 640_000_00, ano: 2028 }] },
    });
    const { resumo } = r.json() as Resposta;
    expect(resumo.anosAcimaDaCompetenciaCA).toContain(2028);
    expect(resumo.cobertura.find((c) => c.ano === 2028)?.excedeCompetenciaCA).toBe(true);
  });

  it('o ano orçamentado nunca é sinalizado: tem cabimento próprio', async () => {
    const { app } = await montarApp();
    fechar = () => app.close();
    const criado = (await app.inject({ method: 'POST', url: '/api/v1/orcamentos', headers: comoGestor(), payload: { ano: 2027 } })).json() as Resposta;
    const linha = criado.orcamento.linhas[0]!;
    const r = await app.inject({
      method: 'PUT', url: `/api/v1/orcamentos/${criado.orcamento.id}/linhas/${String(linha['id'])}`,
      headers: comoGestor(),
      payload: { ...linha, perfis: [], entregaveis: [{ designacao: 'Tudo em 2027', valor: 900_000_00, ano: 2027 }] },
    });
    expect((r.json() as Resposta).resumo.anosAcimaDaCompetenciaCA).not.toContain(2027);
  });

  it('fechar impede alterações; reabrir devolve-as', async () => {
    const { app } = await montarApp();
    fechar = () => app.close();
    const criado = (await app.inject({ method: 'POST', url: '/api/v1/orcamentos', headers: comoGestor(), payload: { ano: 2027 } })).json() as Resposta;
    const id = criado.orcamento.id;
    const linha = criado.orcamento.linhas[0]!;

    expect((await app.inject({ method: 'POST', url: `/api/v1/orcamentos/${id}/fechar`, headers: comoGestor() })).statusCode).toBe(200);
    const bloqueado = await app.inject({ method: 'PUT', url: `/api/v1/orcamentos/${id}/linhas/${String(linha['id'])}`, headers: comoGestor(), payload: linha });
    expect(bloqueado.statusCode).toBe(409);

    expect((await app.inject({ method: 'POST', url: `/api/v1/orcamentos/${id}/reabrir`, headers: comoGestor() })).statusCode).toBe(200);
    const livre = await app.inject({ method: 'PUT', url: `/api/v1/orcamentos/${id}/linhas/${String(linha['id'])}`, headers: comoGestor(), payload: linha });
    expect(livre.statusCode).toBe(200);
  });

  it('não há dois orçamentos para o mesmo ano', async () => {
    const { app } = await montarApp();
    fechar = () => app.close();
    await app.inject({ method: 'POST', url: '/api/v1/orcamentos', headers: comoGestor(), payload: { ano: 2027 } });
    const r = await app.inject({ method: 'POST', url: '/api/v1/orcamentos', headers: comoGestor(), payload: { ano: 2027 } });
    expect(r.statusCode).toBe(400);
  });

  it('orçamentar é competência do gestor de contrato', async () => {
    const { app } = await montarApp();
    fechar = () => app.close();
    const r = await app.inject({ method: 'POST', url: '/api/v1/orcamentos', headers: comoRecurso(), payload: { ano: 2027 } });
    expect(r.statusCode).toBe(403);
  });
});

describe('RN-613 — a fatura identifica o contrato e o prestador', () => {
  const base = {
    numero: 'FT-613', dataEmissao: '2026-07-01', dataRececao: '2026-07-01',
    periodoDe: '2026-06-01', periodoAte: '2026-06-30', montanteSemIva: 1000, montanteIva: 0,
  };

  async function contratoA(ctx: Contexto): Promise<{ id: string; numero: string; nipc: string }> {
    const c = (await ctx.repos.contratos.todos((x) => x.numero === 'C-2026-001'))[0]!;
    return { id: c.id, numero: c.numero, nipc: c.prestador.nipc };
  }

  it('aceita quando ambos conferem', async () => {
    const { app, ctx } = await montarApp();
    fechar = () => app.close();
    const c = await contratoA(ctx);
    const r = await app.inject({ method: 'POST', url: `/api/v1/contratos/${c.id}/faturas`, headers: comoGestor(), payload: { ...base, numeroContratoIndicado: c.numero, nifPrestadorIndicado: c.nipc } });
    expect(r.statusCode).toBe(201);
  });

  it('recusa a fatura de outro contrato', async () => {
    const { app, ctx } = await montarApp();
    fechar = () => app.close();
    const c = await contratoA(ctx);
    const r = await app.inject({ method: 'POST', url: `/api/v1/contratos/${c.id}/faturas`, headers: comoGestor(), payload: { ...base, numeroContratoIndicado: 'C-2026-999', nifPrestadorIndicado: c.nipc } });
    expect(r.statusCode).toBe(422);
    expect((r.json() as { regra?: string }).regra).toBe('RN-613');
  });

  it('recusa prestador diferente do adjudicatário', async () => {
    const { app, ctx } = await montarApp();
    fechar = () => app.close();
    const c = await contratoA(ctx);
    const r = await app.inject({ method: 'POST', url: `/api/v1/contratos/${c.id}/faturas`, headers: comoGestor(), payload: { ...base, numeroContratoIndicado: c.numero, nifPrestadorIndicado: '500000777' } });
    expect(r.statusCode).toBe(422);
    expect((r.json() as { regra?: string }).regra).toBe('RN-613');
  });

  it('resolve o contrato pelo número que vem na fatura', async () => {
    const { app, ctx } = await montarApp();
    fechar = () => app.close();
    const c = await contratoA(ctx);
    const r = await app.inject({ method: 'GET', url: `/api/v1/faturas:contrato-por-numero?numero=${encodeURIComponent(' c-2026-001 ')}`, headers: comoGestor() });
    expect(r.statusCode).toBe(200);
    expect((r.json() as { id: string }).id).toBe(c.id);
  });

  it('número inexistente não resolve', async () => {
    const { app } = await montarApp();
    fechar = () => app.close();
    const r = await app.inject({ method: 'GET', url: '/api/v1/faturas:contrato-por-numero?numero=C-INEXISTENTE', headers: comoGestor() });
    expect(r.statusCode).toBe(400);
  });
});

/** Põe uma portaria plurianual num contrato, para exercitar a cobertura. */
async function comPortariaPlurianual(ctx: Contexto, ano: number, montante: number): Promise<void> {
  const c = (await ctx.repos.contratos.todos((x) => x.numero === 'C-2026-001'))[0]!;
  await ctx.repos.contratos.guardar({
    ...c,
    portariaExtensaoEncargos: { numero: 'P-2026/1', data: '2026-02-01', reparticaoAnual: [{ ano, montante }] },
  });
}
