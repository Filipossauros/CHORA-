import { describe, it, expect } from 'vitest';
import { relogioFixo, decisoesPendentes, estadoEntregavel, CATALOGO_ALERTAS } from '@chora/domain';
import { criarContexto, type Contexto } from '../src/contexto.js';
import { FakeTokenValidator } from '../src/auth/fake-token-validator.js';
import { UTILIZADORES_DEV } from '../src/seed/utilizadores.js';
import { DIRETORIO_SEED } from '../src/seed/diretorio.js';
import { criarGeradorSequencial } from '../src/util/id.js';
import { CATALOGO_CENARIOS, CENARIO_OMISSAO, cenarioPorId } from '../src/seed/cenarios/index.js';
import { JobAlertas } from '../src/alertas/job-alertas.js';
import { ServicoAssistente } from '../src/servicos/assistente.js';
import { encaminhar } from '../src/assistente/router.js';

const INSTANTE = '2026-07-21T09:00:00.000Z';

function contexto(): Contexto {
  const relogio = relogioFixo(INSTANTE);
  return criarContexto({
    tokenValidator: new FakeTokenValidator(UTILIZADORES_DEV, relogio),
    relogio, ids: criarGeradorSequencial(), diretorio: DIRETORIO_SEED,
  });
}

/** Carrega um cenário num contexto novo e corre o job de decisões. */
async function carregar(id: string): Promise<Contexto> {
  const ctx = contexto();
  const cenario = cenarioPorId(id);
  if (cenario === undefined) throw new Error(`cenário ${id} inexistente`);
  await cenario.semear(ctx);
  await new JobAlertas(ctx).executar();
  return ctx;
}

const GESTOR = { utilizadorId: 'oid-gestor-contrato', papeis: ['GESTOR_CONTRATO' as const], validoAte: INSTANTE };

describe('catálogo de cenários', () => {
  it('identificadores únicos, com nome, descrição e conteúdo anunciado', () => {
    const ids = CATALOGO_CENARIOS.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const c of CATALOGO_CENARIOS) {
      expect(c.nome.length, `${c.id} sem nome`).toBeGreaterThan(2);
      expect(c.descricao.length, `${c.id} sem descrição`).toBeGreaterThan(40);
      expect(c.conteudo.length, `${c.id} sem conteúdo anunciado`).toBeGreaterThan(4);
    }
    expect(cenarioPorId(CENARIO_OMISSAO)).toBeDefined();
  });

  it('todos semeiam sem erro e nenhum deixa afetações sem contrato', async () => {
    for (const c of CATALOGO_CENARIOS) {
      const ctx = await carregar(c.id);
      const contratos = new Set((await ctx.repos.contratos.todos()).map((x) => x.id));
      const perfis = new Set((await ctx.repos.perfis.todos()).map((x) => x.id));
      for (const a of await ctx.repos.afetacoes.todos()) {
        expect(contratos.has(a.contratoId), `${c.id}: afetação sem contrato`).toBe(true);
        expect(perfis.has(a.perfilId), `${c.id}: afetação sem perfil`).toBe(true);
      }
      for (const r of await ctx.repos.registosTempo.todos()) {
        expect(contratos.has(r.contratoId), `${c.id}: registo sem contrato`).toBe(true);
      }
      for (const f of await ctx.repos.faturas.todos()) {
        expect(contratos.has(f.contratoId), `${c.id}: fatura sem contrato`).toBe(true);
      }
    }
  });

  it('«vazio» é mesmo vazio — é isso que o torna um percurso a testar', async () => {
    const ctx = await carregar('vazio');
    for (const nome of ['contratos', 'procedimentos', 'perfis', 'afetacoes', 'registosTempo', 'faturas'] as const) {
      expect((await ctx.repos[nome].todos()).length, nome).toBe(0);
    }
    expect((await new ServicoAssistente(ctx).capacidades()).length).toBeGreaterThan(0);
  });

  it('o conteúdo anunciado bate certo com o que é semeado', async () => {
    // Um cenário que promete «4 contratos» e semeia sete não engana ninguém por
    // muito tempo — mas engana o suficiente para se escolher o errado.
    for (const c of CATALOGO_CENARIOS) {
      const prometidos = Number(c.conteudo.match(/^(\d+) contratos/)?.[1]);
      if (Number.isNaN(prometidos)) continue;
      const reais = (await (await carregar(c.id)).repos.contratos.todos()).length;
      expect(reais, `${c.id} anuncia ${prometidos} contratos e semeia ${reais}`).toBe(prometidos);
    }
  });

  it('os cenários de demonstração são pequenos — é a razão de existirem', async () => {
    const cobertura = (await (await carregar('cobertura')).repos.contratos.todos()).length;
    for (const id of ['assistente', 'hoje', 'faturacao']) {
      const n = (await (await carregar(id)).repos.contratos.todos()).length;
      expect(n, `${id} tem ${n} contratos`).toBeLessThanOrEqual(6);
      expect(n).toBeLessThan(cobertura / 2);
    }
  });
});

describe('cenário do assistente', () => {
  it('as perguntas que o cenário existe para demonstrar têm resposta', async () => {
    const ctx = await carregar('assistente');
    const servico = new ServicoAssistente(ctx);

    // Ambiguidade deliberada: dois contratos de outsourcing → pergunta de volta.
    const ambigua = await servico.interpretar('Qual o saldo do contrato de outsourcing?', GESTOR, encaminhar('Qual o saldo do contrato de outsourcing?'));
    expect(ambigua.esclarecimento?.opcoes.length).toBeGreaterThan(1);

    // A lista que se compõe: tem de trazer linhas e chaves.
    const frase = 'Que contratos comportam um perfil a 40 euros por hora?';
    const folga = await servico.interpretar(frase, GESTOR, encaminhar(frase));
    expect(folga.resultado?.tabela?.linhas.length).toBeGreaterThan(1);
    expect(folga.conversa.tabela?.chaves?.length).toBe(folga.resultado?.tabela?.linhas.length);

    // Há registos por aprovar, senão a consulta responde «não há nada».
    const porAprovar = await servico.interpretar('Que registos estão por aprovar?', GESTOR, encaminhar('Que registos estão por aprovar?'));
    expect(porAprovar.resultado?.semResultado).not.toBe(true);

    // E há risco na carteira, senão o cartão de risco fica vazio.
    const risco = await servico.interpretar('Que contratos estão em risco?', GESTOR, encaminhar('Que contratos estão em risco?'));
    expect(risco.resultado?.tabela?.linhas.length).toBeGreaterThan(0);
  });

  it('o mesmo perfil existe em dois contratos — é o que torna a substituição interessante', async () => {
    const ctx = await carregar('assistente');
    const perfis = await ctx.repos.perfis.todos((p) => p.nome === 'Arquiteto de Software Sénior');
    expect(new Set(perfis.map((p) => p.contratoId)).size).toBeGreaterThan(1);
  });
});

describe('cenário do «Hoje»', () => {
  it('produz decisões de famílias diferentes, e não dezenas da mesma', async () => {
    const ctx = await carregar('hoje');
    const abertas = decisoesPendentes(await ctx.repos.alertas.todos());
    expect(abertas.length).toBeGreaterThan(2);
    // A família vive no catálogo, não no alerta gravado.
    const familiaDe = (codigo: string): string => CATALOGO_ALERTAS.find((x) => x.codigo === codigo)?.familia ?? codigo;
    const familias = new Set(abertas.map((a) => familiaDe(a.codigo)));
    expect(familias.size, 'poucas famílias representadas').toBeGreaterThanOrEqual(3);
  });

  it('a fila é legível — bastante menor do que a da cobertura de regras', async () => {
    const doHoje = decisoesPendentes(await (await carregar('hoje')).repos.alertas.todos()).length;
    const daCobertura = decisoesPendentes(await (await carregar('cobertura')).repos.alertas.todos()).length;
    expect(doHoje).toBeLessThan(daCobertura);
  });
});

describe('cenário de faturação', () => {
  it('traz as três situações da conferência', async () => {
    const ctx = await carregar('faturacao');
    const faturas = await ctx.repos.faturas.todos();
    expect(faturas.some((f) => f.estado === 'VALIDADA')).toBe(true);
    expect(faturas.some((f) => f.estado === 'AGUARDA_NOTA_CREDITO')).toBe(true);

    const entregaveis = await ctx.repos.entregaveis.todos();
    const estados = entregaveis.map((e) => estadoEntregavel(e));
    // Um por faturar (entregue), um já faturado e um ainda por entregar.
    expect(estados).toContain('ENTREGUE');
    expect(estados).toContain('FATURADO');
    expect(estados).toContain('PREVISTO');
  });

  it('a fatura por decidir tem execução aprovada contra a qual conferir', async () => {
    const ctx = await carregar('faturacao');
    const aberta = (await ctx.repos.faturas.todos()).find((f) => f.estado === 'AGUARDA_NOTA_CREDITO');
    expect(aberta).toBeDefined();
    const aprovados = await ctx.repos.registosTempo.todos((r) => r.contratoId === aberta!.contratoId && r.estado === 'APROVADO');
    expect(aprovados.length).toBeGreaterThan(0);
  });
});
