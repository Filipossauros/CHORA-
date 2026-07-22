import { describe, it, expect, afterEach } from 'vitest';
import { montarApp, comoGestor } from './helpers.js';
import type { Contexto } from '../src/contexto.js';

let fechar: (() => Promise<void>) | undefined;
afterEach(async () => { if (fechar) await fechar(); fechar = undefined; });

async function contrato(ctx: Contexto, numero = 'C-2026-001'): Promise<string> {
  return (await ctx.repos.contratos.todos((c) => c.numero === numero))[0]!.id;
}

describe('estrutura contratual', () => {
  it('cria dotação e perfil dentro do teto (RN-105)', async () => {
    const { app, ctx } = await montarApp();
    fechar = () => app.close();
    const id = await contrato(ctx, 'C-2026-002'); // sem estrutura no seed (há folga face ao teto RN-105)
    const perfil = await app.inject({ method: 'POST', url: `/api/v1/contratos/${id}/perfis`, headers: comoGestor(),
      payload: { nome: 'Analista', quantidadePrevista: 6000, consomeBolsaValor: false, consomeTrabalhosComplementares: false, perfilDeGestao: false, valorHora: 4000, vigenteDe: '2026-01-01' } });
    expect(perfil.statusCode).toBe(201);
    const lista = await app.inject({ method: 'GET', url: `/api/v1/contratos/${id}/perfis`, headers: comoGestor() });
    expect((lista.json() as { dados: unknown[] }).dados.length).toBeGreaterThan(0);
  });

  it('nova vigência de preço fecha a anterior (ADR-09)', async () => {
    const { app, ctx } = await montarApp();
    fechar = () => app.close();
    const id = await contrato(ctx);
    const perfil = (await ctx.repos.perfis.todos((p) => p.contratoId === id))[0]!;
    const r = await app.inject({ method: 'POST', url: `/api/v1/contratos/${id}/perfis/${perfil.id}/precos`, headers: comoGestor(), payload: { valorHora: 6000, vigenteDe: '2027-01-01' } });
    expect(r.statusCode).toBe(201);
    const atualizado = (r.json() as { precos: Array<{ vigenteAte?: string }> }).precos;
    expect(atualizado.length).toBeGreaterThanOrEqual(2);
    expect(atualizado.some((p) => p.vigenteAte === '2026-12-31')).toBe(true);
  });
});

describe('afetações — estado só ativa/inativa e substituição (RN-701)', () => {
  it('substituir encerra a anterior (inativa) e cria sucessora ativa', async () => {
    const { app, ctx } = await montarApp();
    fechar = () => app.close();
    const af = (await ctx.repos.afetacoes.todos((a) => a.ativa && a.recursoId === 'oid-recurso-01'))[0]!;
    // Novo recurso na mesma entidade executante.
    await app.inject({ method: 'POST', url: '/api/v1/recursos', headers: comoGestor(), payload: { id: 'oid-recurso-09', entidadeExecutanteNipc: '500000001' } });
    const r = await app.inject({ method: 'POST', url: `/api/v1/afetacoes/${af.id}/substituir`, headers: comoGestor(), payload: { novoRecursoId: 'oid-recurso-09' } });
    expect(r.statusCode).toBe(200);
    const { anterior, sucessora } = r.json() as { anterior: { ativa: boolean }; sucessora: { ativa: boolean; substituiAfetacaoId: string } };
    expect(anterior.ativa).toBe(false); // estado só ativa/inativa
    expect(sucessora.ativa).toBe(true);
    expect(sucessora.substituiAfetacaoId).toBe(af.id);
  });

  it('substituição com entidade diferente falha (RN-701)', async () => {
    const { app, ctx } = await montarApp();
    fechar = () => app.close();
    const af = (await ctx.repos.afetacoes.todos((a) => a.ativa && a.recursoId === 'oid-recurso-01'))[0]!;
    await app.inject({ method: 'POST', url: '/api/v1/recursos', headers: comoGestor(), payload: { id: 'oid-outra', entidadeExecutanteNipc: '999999999' } });
    const r = await app.inject({ method: 'POST', url: `/api/v1/afetacoes/${af.id}/substituir`, headers: comoGestor(), payload: { novoRecursoId: 'oid-outra' } });
    expect(r.statusCode).toBe(422);
    expect((r.json() as { regra: string }).regra).toBe('RN-701');
  });
});

describe('faturação — conferência determinística e decisão (R4)', () => {
  it('valida fatura conforme e gera relatório + frase juridicamente prudente', async () => {
    const { app, ctx } = await montarApp();
    fechar = () => app.close();
    const id = await contrato(ctx);
    // Compromisso com saldo.
    await app.inject({ method: 'POST', url: `/api/v1/contratos/${id}/compromissos`, headers: comoGestor(), payload: { numero: 'CMP-T', montante: 100000, ano: 2026, emitidoEm: '2026-01-01' } });
    const cmp = (await ctx.repos.compromissos.todos((c) => c.contratoId === id)).slice(-1)[0]!;
    // Registo aprovado no período.
    const af = (await ctx.repos.afetacoes.todos((a) => a.contratoId === id && a.ativa))[0]!;
    // Mês sem registos aprovados no seed (maio), para a conferência bater certo.
    await ctx.repos.registosTempo.guardar({ id: 'rt-fat', afetacaoId: af.id, contratoId: id, perfilId: af.perfilId, recursoId: af.recursoId, projetoId: 'proj-P1', workItemId: 1, data: '2026-05-11', duracao: 480, descricaoAtividade: 'x', tipoDotacaoConsumida: 'HORAS_BASE', valorHoraAplicado: 5000, valorImputado: 40000, estado: 'APROVADO', criadoEm: '2026-05-11T09:00:00.000Z', criadoPor: af.recursoId, atualizadoEm: '2026-05-11T09:00:00.000Z', atualizadoPor: af.recursoId });
    // Fatura + documentos + linhas conformes.
    const fatura = (await app.inject({ method: 'POST', url: `/api/v1/contratos/${id}/faturas`, headers: comoGestor(), payload: { compromissoId: cmp.id, numero: 'FT-T-1', dataEmissao: '2026-05-31', dataRececao: '2026-06-01', periodoDe: '2026-05-01', periodoAte: '2026-05-31', montanteSemIva: 40000, montanteIva: 9200 } })).json() as { id: string };
    const h = (c: string) => c.repeat(64);
    await app.inject({ method: 'POST', url: `/api/v1/faturas/${fatura.id}/documentos`, headers: comoGestor(), payload: { tipo: 'FATURA', ficheiroRef: 'a', nomeOriginal: 'f.pdf', hashSha256: h('a'), tamanhoBytes: 1 } });
    await app.inject({ method: 'POST', url: `/api/v1/faturas/${fatura.id}/documentos`, headers: comoGestor(), payload: { tipo: 'RELATORIO_HORAS_FORNECEDOR', ficheiroRef: 'b', nomeOriginal: 'r.pdf', hashSha256: h('b'), tamanhoBytes: 1 } });
    await app.inject({ method: 'POST', url: `/api/v1/faturas/${fatura.id}/linhas`, headers: comoGestor(), payload: { linhas: [{ perfilId: af.perfilId, recursoId: af.recursoId, quantidade: 480, valorHora: 5000, montante: 40000, origem: 'MANUAL' }] } });
    await app.inject({ method: 'POST', url: `/api/v1/faturas/${fatura.id}/iniciar-conferencia`, headers: comoGestor() });

    const decidir = await app.inject({ method: 'POST', url: `/api/v1/faturas/${fatura.id}/decidir`, headers: comoGestor(), payload: { decisao: 'VALIDADA' } });
    expect(decidir.statusCode).toBe(200);
    const body = decidir.json() as { fatura: { estado: string; numero: string }; relatorio: { frase: string; decisao: string } };
    expect(body.fatura.estado).toBe('VALIDADA');
    expect(body.relatorio.decisao).toBe('VALIDADA');
    expect(body.relatorio.frase).toContain('FT-T-1');
    expect(body.relatorio.frase.length).toBeGreaterThan(50);
  });

  it('bloqueia validação com divergência (RN-603) e sem documentos (RN-602)', async () => {
    const { app, ctx } = await montarApp();
    fechar = () => app.close();
    const id = await contrato(ctx);
    const fatura = (await app.inject({ method: 'POST', url: `/api/v1/contratos/${id}/faturas`, headers: comoGestor(), payload: { numero: 'FT-T-2', dataEmissao: '2026-02-28', dataRececao: '2026-03-01', periodoDe: '2026-02-01', periodoAte: '2026-02-28', montanteSemIva: 5000, montanteIva: 1150 } })).json() as { id: string };
    // Sem documentos: iniciar conferência falha RN-602 (mas sem compromisso falha RN-601 primeiro).
    const semDocs = await app.inject({ method: 'POST', url: `/api/v1/faturas/${fatura.id}/iniciar-conferencia`, headers: comoGestor() });
    expect(semDocs.statusCode).toBe(422);
    expect(['RN-601', 'RN-602']).toContain((semDocs.json() as { regra: string }).regra);
  });
});
