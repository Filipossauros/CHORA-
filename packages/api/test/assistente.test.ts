import { describe, it, expect, afterEach } from 'vitest';
import { montarApp, comoGestor, comoRecurso } from './helpers.js';
import { encaminhar, numeroContratoNaFrase, valorHoraNaFrase } from '../src/assistente/router.js';
import { CAPACIDADES } from '../src/assistente/capacidades.js';

let fechar: (() => Promise<unknown>) | undefined;
afterEach(async () => { await fechar?.(); fechar = undefined; });

interface Resposta {
  capacidade?: { nome: string; tipo: string };
  parametros?: Record<string, unknown>;
  resultado?: { texto: string; tabela?: { colunas: string[]; linhas: unknown[][] }; exportavel?: { folhas: unknown[] }; ui?: { ecra: string }; semResultado?: boolean };
  simulacao?: { titulo: string; efeitos: string[]; regras: Array<{ codigo: string; ok: boolean }>; avisos: string[]; bloqueada: boolean };
  mensagem?: string;
  sugestoes?: string[];
}

const perguntar = async (app: Awaited<ReturnType<typeof montarApp>>['app'], frase: string, headers = comoGestor()): Promise<Resposta> =>
  (await app.inject({ method: 'POST', url: '/api/v1/assistente/interpretar', headers, payload: { frase } })).json() as Resposta;

describe('router determinístico', () => {
  it('apanha o número do contrato em várias formas', () => {
    expect(numeroContratoNaFrase('saldo do C-2026-001?')).toBe('C-2026-001');
    expect(numeroContratoNaFrase('e o c 2026 bh2')).toBe('C-2026-BH2');
    expect(numeroContratoNaFrase('sem contrato nenhum')).toBeUndefined();
  });

  it('apanha o valor/hora só quando a hora é mencionada', () => {
    expect(valorHoraNaFrase('um perfil a 45 euros por hora')).toBe(45);
    expect(valorHoraNaFrase('alguém a 60,50 €/h')).toBe(60.5);
    // 45 000 € é um valor de contrato, não um valor/hora: não deve ser apanhado.
    expect(valorHoraNaFrase('um contrato de 45000 euros')).toBeUndefined();
  });

  it('a substituição ganha à consulta quando a frase é de troca', () => {
    const e = encaminhar('Troca a Carla Andrade por Diogo Marques no perfil Arquiteto de Software Sénior do C-2026-001');
    expect(e?.capacidade).toBe('afetacao.substituir');
    expect(e?.parametros['pessoaSai']).toBe('Carla Andrade');
    expect(e?.parametros['pessoaEntra']).toBe('Diogo Marques');
  });

  it('o valor/hora tem prioridade sobre o perfil quando ambos cabem', () => {
    const e = encaminhar('Que contratos têm folga para comportar um perfil que custa 45 euros por hora?');
    expect(e?.capacidade).toBe('capacidade.folga-por-valor-hora');
    expect(e?.parametros['valorHoraEuros']).toBe(45);
  });

  it('não encaminha o que não percebe', () => {
    expect(encaminhar('qual é a capital da Noruega?')).toBeUndefined();
  });
});

describe('catálogo de capacidades', () => {
  it('nomes únicos e exemplos em todas', () => {
    const nomes = CAPACIDADES.map((c) => c.nome);
    expect(new Set(nomes).size).toBe(nomes.length);
    for (const c of CAPACIDADES) {
      expect(c.exemplos.length, `${c.nome} sem exemplos`).toBeGreaterThan(0);
      expect(c.descricao.length, `${c.nome} sem descrição`).toBeGreaterThan(10);
    }
  });

  it('toda a ação tem operação de permissão associada', () => {
    for (const c of CAPACIDADES.filter((x) => x.tipo === 'ACAO')) {
      expect(c.operacao, `${c.nome} não declara operação`).toBeDefined();
    }
  });

  it('o catálogo público é servido pela API', async () => {
    const { app } = await montarApp();
    fechar = () => app.close();
    const r = await app.inject({ method: 'GET', url: '/api/v1/assistente/capacidades', headers: comoGestor() });
    expect(r.statusCode).toBe(200);
    const { dados } = r.json() as { dados: Array<{ nome: string; tipo: string; papeis: string[] }> };
    expect(dados.length).toBe(CAPACIDADES.length);
    expect(dados.find((c) => c.nome === 'afetacao.substituir')?.papeis).toContain('GESTOR_CONTRATO');
  });
});

describe('consultas', () => {
  it('responde ao saldo de um contrato', async () => {
    const { app } = await montarApp();
    fechar = () => app.close();
    const r = await perguntar(app, 'Qual o saldo por executar do C-2026-001?');
    expect(r.capacidade?.nome).toBe('contrato.saldo');
    expect(r.resultado?.texto).toContain('C-2026-001');
  });

  it('folga por perfil devolve tabela com pessoas comportadas', async () => {
    const { app } = await montarApp();
    fechar = () => app.close();
    const r = await perguntar(app, 'Que contratos têm folga para comportar mais pessoas do perfil consultor funcional?');
    expect(r.capacidade?.nome).toBe('capacidade.folga-por-perfil');
    expect(r.resultado?.tabela?.colunas).toContain('Pessoas a tempo inteiro');
    expect((r.resultado?.tabela?.linhas.length ?? 0)).toBeGreaterThan(0);
  });

  it('folga por valor/hora devolve tabela e assinala perfil compatível', async () => {
    const { app } = await montarApp();
    fechar = () => app.close();
    const r = await perguntar(app, 'Que contratos têm folga para comportar um perfil que custa 40 euros por hora?');
    expect(r.capacidade?.nome).toBe('capacidade.folga-por-valor-hora');
    expect(r.resultado?.tabela?.colunas).toContain('Perfil compatível');
  });

  it('o executado de um projeto traz Excel com duas folhas', async () => {
    const { app } = await montarApp();
    fechar = () => app.close();
    const r = await perguntar(app, 'Qual o total de dinheiro já gasto no projeto Modernização documental?');
    expect(r.capacidade?.nome).toBe('projeto.executado');
    expect(r.resultado?.exportavel?.folhas.length).toBe(2);
    expect(r.resultado?.texto).toContain('Modernização documental');
  });

  it('o previsto de um projeto separa contratado de orçamentado', async () => {
    const { app } = await montarApp();
    fechar = () => app.close();
    const r = await perguntar(app, 'Qual o total previsto investir no projeto Modernização documental?');
    expect(r.capacidade?.nome).toBe('projeto.previsto');
    expect(r.resultado?.texto).toMatch(/contratos j[áa] em vigor/);
    expect(r.resultado?.exportavel).toBeDefined();
  });

  it('projeto desconhecido responde com os que existem, sem inventar', async () => {
    const { app } = await montarApp();
    fechar = () => app.close();
    const r = await app.inject({ method: 'POST', url: '/api/v1/assistente/interpretar', headers: comoGestor(), payload: { frase: 'Quanto já se gastou no projeto Inexistente?' } });
    expect(r.statusCode).toBe(400);
    expect((r.json() as { detail?: string }).detail).toContain('Não conheço o projeto');
  });

  it('o que não percebe não executa nada e sugere', async () => {
    const { app } = await montarApp();
    fechar = () => app.close();
    const r = await perguntar(app, 'qual é a capital da Noruega?');
    expect(r.capacidade).toBeUndefined();
    expect(r.mensagem).toContain('Funções do assistente');
    expect((r.sugestoes?.length ?? 0)).toBeGreaterThan(0);
  });
});

describe('ações — simular antes de executar', () => {
  const frase = 'Troca a Carla Andrade por Diogo Marques no perfil Arquiteto de Software Sénior do C-2026-001';

  it('a ação devolve simulação e NÃO executa', async () => {
    const { app, ctx } = await montarApp();
    fechar = () => app.close();
    const antes = (await ctx.repos.afetacoes.todos((a) => a.ativa)).length;
    const r = await perguntar(app, frase);
    expect(r.capacidade?.tipo).toBe('ACAO');
    expect(r.simulacao?.regras.map((x) => x.codigo)).toContain('RN-701');
    expect(r.simulacao?.efeitos.length).toBeGreaterThan(2);
    expect((await ctx.repos.afetacoes.todos((a) => a.ativa)).length).toBe(antes);
  });

  it('as implicações são calculadas, não redigidas', async () => {
    const { app } = await montarApp();
    fechar = () => app.close();
    const r = await perguntar(app, frase);
    // O efeito das horas já registadas sai da execução aprovada.
    expect(r.simulacao?.efeitos.some((x) => /\d+ h j[áa] registadas/.test(x))).toBe(true);
    expect(r.simulacao?.efeitos.some((x) => /Restam \d+ h no perfil/.test(x))).toBe(true);
  });

  it('confirmada, executa e a afetação muda', async () => {
    const { app, ctx } = await montarApp();
    fechar = () => app.close();
    const r = await perguntar(app, frase);
    expect(r.simulacao?.bloqueada).toBe(false);

    const exec = await app.inject({
      method: 'POST', url: '/api/v1/assistente/executar', headers: comoGestor(),
      payload: { capacidade: 'afetacao.substituir', parametros: r.parametros, frase },
    });
    expect(exec.statusCode).toBe(200);
    const sucessoras = await ctx.repos.afetacoes.todos((a) => a.substituiAfetacaoId !== undefined && a.ativa);
    expect(sucessoras.some((a) => a.recursoId === 'oid-recurso-02')).toBe(true);
  });

  it('a execução fica na auditoria com a frase que a originou', async () => {
    const { app, ctx } = await montarApp();
    fechar = () => app.close();
    const r = await perguntar(app, frase);
    await app.inject({
      method: 'POST', url: '/api/v1/assistente/executar', headers: comoGestor(),
      payload: { capacidade: 'afetacao.substituir', parametros: r.parametros, frase },
    });
    const eventos = await ctx.repos.eventosAuditoria.todos((e) => e.operacao === 'ASSISTENTE:EXECUTAR');
    expect(eventos.length).toBe(1);
    expect(JSON.stringify(eventos[0]?.depois)).toContain('Carla Andrade');
  });

  it('entidade executante diferente bloqueia a substituição (RN-701)', async () => {
    const { app } = await montarApp();
    fechar = () => app.close();
    // A Eva Nogueira é de um subcontratado — entidade diferente da do contrato.
    const r = await perguntar(app, 'Troca a Carla Andrade por Eva Nogueira no perfil Arquiteto de Software Sénior do C-2026-001');
    expect(r.simulacao?.bloqueada).toBe(true);
    expect(r.simulacao?.regras.find((x) => x.codigo === 'RN-701')?.ok).toBe(false);
    expect(r.simulacao?.avisos.some((a) => /entidades executantes n[ãa]o coincidem/i.test(a))).toBe(true);
  });

  it('executar uma ação bloqueada é recusado, mesmo com confirmação', async () => {
    const { app } = await montarApp();
    fechar = () => app.close();
    const r = await perguntar(app, 'Troca a Carla Andrade por Eva Nogueira no perfil Arquiteto de Software Sénior do C-2026-001');
    const exec = await app.inject({
      method: 'POST', url: '/api/v1/assistente/executar', headers: comoGestor(),
      payload: { capacidade: 'afetacao.substituir', parametros: r.parametros },
    });
    expect(exec.statusCode).toBe(400);
    expect((exec.json() as { detail?: string }).detail).toContain('RN-701');
  });

  it('um elemento da equipa não executa ações', async () => {
    const { app } = await montarApp();
    fechar = () => app.close();
    const r = await app.inject({
      method: 'POST', url: '/api/v1/assistente/executar', headers: comoRecurso(),
      payload: { capacidade: 'afetacao.substituir', parametros: { contratoNumero: 'C-2026-001', perfil: 'Arquiteto de Software Sénior', pessoaEntra: 'Diogo Marques' } },
    });
    expect(r.statusCode).toBe(403);
  });

  it('uma função inventada não executa nada', async () => {
    const { app } = await montarApp();
    fechar = () => app.close();
    const r = await app.inject({
      method: 'POST', url: '/api/v1/assistente/executar', headers: comoGestor(),
      payload: { capacidade: 'contrato.apagar', parametros: {} },
    });
    expect(r.statusCode).toBe(400);
  });

  it('um encaminhamento vindo de modelo é revalidado como qualquer outro', async () => {
    const { app } = await montarApp();
    fechar = () => app.close();
    const r = await app.inject({
      method: 'POST', url: '/api/v1/assistente/interpretar', headers: comoGestor(),
      payload: { frase: 'o que quer que seja', encaminhamento: { capacidade: 'nao.existe', parametros: {} } },
    });
    expect((r.json() as Resposta).mensagem).toContain('não existe');
  });
});

describe('faturação pelo chat', () => {
  it('pedir para validar uma fatura devolve a UI embebida', async () => {
    const { app } = await montarApp();
    fechar = () => app.close();
    const r = await perguntar(app, 'Quero validar uma fatura do C-2026-001');
    expect(r.capacidade?.nome).toBe('fatura.registar');
    expect(r.resultado?.ui?.ecra).toBe('FATURACAO');
  });
});
