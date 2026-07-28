import { describe, it, expect, afterEach } from 'vitest';
import { montarApp, comoGestor, comoRecurso } from './helpers.js';
import { encaminhar, numeroContratoNaFrase, valorHoraNaFrase, montanteNaFrase, referenciaContratoNaFrase } from '../src/assistente/router.js';
import { periodoNaFrase, periodoERelativo } from '../src/assistente/tempo.js';
import { CAPACIDADES } from '../src/assistente/capacidades/index.js';

let fechar: (() => Promise<unknown>) | undefined;
afterEach(async () => { await fechar?.(); fechar = undefined; });

interface Resposta {
  capacidade?: { nome: string; tipo: string };
  parametros?: Record<string, unknown>;
  resultado?: {
    texto: string; tabela?: { colunas: string[]; linhas: unknown[][] };
    exportavel?: { folhas: unknown[] }; ui?: { ecra: string };
    proximos?: Array<{ rotulo: string; frase: string }>; semResultado?: boolean;
  };
  simulacao?: { titulo: string; efeitos: string[]; regras: Array<{ codigo: string; ok: boolean }>; avisos: string[]; bloqueada: boolean };
  esclarecimento?: { pergunta: string; opcoes: Array<{ rotulo: string; parametros: Record<string, unknown> }> };
  mensagem?: string;
  sugestoes?: string[];
  conversa: Record<string, unknown>;
}

type App = Awaited<ReturnType<typeof montarApp>>['app'];

const perguntar = async (app: App, frase: string, conversa: Record<string, unknown> = {}, headers = comoGestor()): Promise<Resposta> =>
  (await app.inject({ method: 'POST', url: '/api/v1/assistente/interpretar', headers, payload: { frase, conversa } })).json() as Resposta;

// ─── ROUTER ──────────────────────────────────────────────────────────────────

describe('extração de entidades e tempo', () => {
  it('número de contrato em várias formas', () => {
    expect(numeroContratoNaFrase('saldo do C-2026-001?')).toBe('C-2026-001');
    expect(numeroContratoNaFrase('e o c 2026 bh2')).toBe('C-2026-BH2');
    expect(numeroContratoNaFrase('sem contrato nenhum')).toBeUndefined();
  });

  it('referência em linguagem corrente quando não há código', () => {
    expect(referenciaContratoNaFrase('qual o saldo do contrato de outsourcing?')).toBe('outsourcing');
    // O código ganha sempre à descrição.
    expect(referenciaContratoNaFrase('saldo do contrato de outsourcing C-2026-001')).toBe('C-2026-001');
  });

  it('valor/hora só quando a hora é mencionada', () => {
    expect(valorHoraNaFrase('um perfil a 45 euros por hora')).toBe(45);
    expect(valorHoraNaFrase('alguém a 60,50 €/h')).toBe(60.5);
    expect(valorHoraNaFrase('um contrato de 45000 euros')).toBeUndefined();
  });

  it('montante distingue-se de valor/hora', () => {
    expect(montanteNaFrase('acrescenta 20 000 euros de complementares')).toBe(20000);
    expect(montanteNaFrase('um perfil a 45 euros por hora')).toBeUndefined();
  });

  it('períodos em linguagem corrente', () => {
    const hoje = '2026-07-21';
    expect(periodoNaFrase('que contratos terminam este ano?', hoje)).toMatchObject({ de: '2026-01-01', ate: '2026-12-31' });
    expect(periodoNaFrase('e no próximo ano?', hoje)).toMatchObject({ de: '2027-01-01', ate: '2027-12-31' });
    expect(periodoNaFrase('os registos de maio', hoje)).toMatchObject({ de: '2026-05-01', ate: '2026-05-31' });
    expect(periodoNaFrase('nos últimos 3 meses', hoje)).toMatchObject({ de: '2026-04-01', ate: hoje });
    expect(periodoNaFrase('no 1.º trimestre de 2027', hoje)).toMatchObject({ de: '2027-01-01', ate: '2027-03-31' });
    // Um número de contrato não é um ano.
    expect(periodoNaFrase('o saldo do C-2026-001', hoje)).toBeUndefined();
    expect(periodoNaFrase('quanto falta executar?', hoje)).toBeUndefined();
  });

  it('distingue período relativo de período fixo — é o que decide o que um relatório guardado repete', () => {
    const hoje = '2026-07-21';
    // Relativos: acompanham o calendário de quem executa.
    expect(periodoERelativo('que contratos terminam este ano?', hoje)).toBe(true);
    expect(periodoERelativo('nos últimos 3 meses', hoje)).toBe(true);
    expect(periodoERelativo('e no próximo ano?', hoje)).toBe(true);
    expect(periodoERelativo('este trimestre', hoje)).toBe(true);
    // Fixos: fecham sobre um exercício concreto.
    expect(periodoERelativo('que contratos terminam em 2026?', hoje)).toBe(false);
    expect(periodoERelativo('no 1.º trimestre de 2027', hoje)).toBe(false);
    expect(periodoERelativo('em março de 2027', hoje)).toBe(false);
    // Sem recorte temporal não há nada a decidir.
    expect(periodoERelativo('quanto falta executar?', hoje)).toBe(false);
  });
});

describe('encaminhamento', () => {
  it('a ação ganha à consulta quando a frase é de ato', () => {
    expect(encaminhar('Troca a Carla Andrade por Diogo Marques no perfil Arquiteto do C-2026-001')?.capacidade).toBe('afetacao.substituir');
    expect(encaminhar('Prorroga a vigência do C-2026-001 até 2028-06-30')?.capacidade).toBe('modificacao.prorrogar');
    expect(encaminhar('Aprova os registos do C-2026-001')?.capacidade).toBe('registos.aprovar');
  });

  it('distingue consultar registos de aprovar registos', () => {
    expect(encaminhar('Que registos estão por aprovar?')?.capacidade).toBe('registos.por-aprovar');
    expect(encaminhar('Aprova os registos de maio')?.capacidade).toBe('registos.aprovar');
  });

  it('o valor/hora tem prioridade sobre o perfil quando ambos cabem', () => {
    const e = encaminhar('Que contratos têm folga para comportar um perfil que custa 45 euros por hora?');
    expect(e?.capacidade).toBe('capacidade.folga-por-valor-hora');
    expect(e?.parametros['valorHoraEuros']).toBe(45);
  });

  it('encaminha sem contrato: a resolução completa depois', () => {
    const e = encaminhar('Qual o saldo por executar?');
    expect(e?.capacidade).toBe('contrato.saldo');
    expect(e?.parametros['contratoNumero']).toBeUndefined();
  });

  it('elipses resolvem o que os padrões não apanham', () => {
    // «e a equipa?» não tem termo que algum padrão reconheça…
    expect(encaminhar('e a equipa?')).toBeUndefined();
    // …mas com um contrato na conversa passa a fazer sentido.
    expect(encaminhar('e a equipa?', { contratoNumero: 'C-2026-001' })?.capacidade).toBe('contrato.quem-esta');
  });

  it('não encaminha o que não percebe', () => {
    expect(encaminhar('qual é a capital da Noruega?')).toBeUndefined();
  });
});

// ─── CATÁLOGO ────────────────────────────────────────────────────────────────

describe('catálogo de capacidades', () => {
  it('nomes únicos, descrição e exemplos em todas', () => {
    const nomes = CAPACIDADES.map((c) => c.nome);
    expect(new Set(nomes).size).toBe(nomes.length);
    for (const c of CAPACIDADES) {
      expect(c.exemplos.length, `${c.nome} sem exemplos`).toBeGreaterThan(0);
      expect(c.descricao.length, `${c.nome} sem descrição`).toBeGreaterThan(10);
    }
  });

  it('toda a ação declara operação de permissão e sabe simular', () => {
    for (const c of CAPACIDADES.filter((x) => x.tipo === 'ACAO')) {
      expect(c.operacao, `${c.nome} não declara operação`).toBeDefined();
    }
    // Só duas ações dispensam simulação: a que apenas abre um ecrã, e a que
    // arquiva uma lista — não altera nada do contrato e apaga-se num clique.
    const semSimular = CAPACIDADES.filter((c) => c.tipo === 'ACAO' && c.simular === undefined).map((c) => c.nome);
    expect(semSimular.sort()).toEqual(['fatura.registar', 'tabela.guardar']);
  });

  it('cada exemplo do catálogo é encaminhado para a sua própria capacidade', () => {
    // As funções que compõem a lista só valem com uma lista em cima da mesa:
    // sem contexto, «acrescenta os consumos» não é sequer uma pergunta.
    const comLista = {
      tabela: {
        titulo: 'Lista', tipoEntidade: 'CONTRATO' as const, colunas: ['Contrato'], linhas: [['C-1']],
        chaves: [{ tipo: 'CONTRATO' as const, id: 'c1' }], origem: [],
      },
    };
    const falhas: string[] = [];
    for (const c of CAPACIDADES) {
      for (const exemplo of c.exemplos) {
        const e = encaminhar(exemplo, c.gereTabela === true ? comLista : {});
        if (e?.capacidade !== c.nome) falhas.push(`«${exemplo}» → ${e?.capacidade ?? 'nada'} (esperado ${c.nome})`);
      }
    }
    expect(falhas, falhas.join('\n')).toEqual([]);
  });

  it('o catálogo público é servido pela API', async () => {
    const { app } = await montarApp();
    fechar = () => app.close();
    const r = await app.inject({ method: 'GET', url: '/api/v1/assistente/capacidades', headers: comoGestor() });
    const { dados } = r.json() as { dados: Array<{ nome: string; papeis: string[] }> };
    expect(dados.length).toBe(CAPACIDADES.length);
    expect(dados.find((c) => c.nome === 'afetacao.substituir')?.papeis).toContain('GESTOR_CONTRATO');
  });
});

// ─── RESOLUÇÃO E CONVERSA ────────────────────────────────────────────────────

describe('resolução de entidades e memória', () => {
  it('resolve o contrato pelo objeto, sem código', async () => {
    const { app } = await montarApp();
    fechar = () => app.close();
    const r = await perguntar(app, 'Qual o saldo do contrato de licenciamento anual?');
    expect(r.resultado?.texto ?? r.esclarecimento?.pergunta).toBeDefined();
    if (r.resultado !== undefined) expect(r.resultado.texto).toContain('C-2026-LIC1');
  });

  it('sem contrato nenhum, pergunta de volta com opções', async () => {
    const { app } = await montarApp();
    fechar = () => app.close();
    const r = await perguntar(app, 'Qual o saldo por executar?');
    expect(r.esclarecimento?.pergunta).toContain('contrato');
    expect((r.esclarecimento?.opcoes.length ?? 0)).toBeGreaterThan(1);
    expect(r.esclarecimento?.opcoes[0]?.parametros['contratoNumero']).toBeDefined();
  });

  it('a conversa lembra o contrato e a elipse funciona', async () => {
    const { app } = await montarApp();
    fechar = () => app.close();
    const primeiro = await perguntar(app, 'Qual o saldo do C-2026-001?');
    expect(primeiro.conversa['contratoNumero']).toBe('C-2026-001');

    const segundo = await perguntar(app, 'e a vigência?', primeiro.conversa);
    expect(segundo.capacidade?.nome).toBe('contrato.vigencia');
    expect(segundo.resultado?.texto).toContain('C-2026-001');
  });

  it('uma referência ambígua pergunta em vez de adivinhar', async () => {
    const { app } = await montarApp();
    fechar = () => app.close();
    // Vários contratos têm «Prestação de serviços em outsourcing» por objeto.
    const r = await perguntar(app, 'Qual o saldo do contrato de outsourcing?');
    expect(r.esclarecimento).toBeDefined();
    expect((r.esclarecimento?.opcoes.length ?? 0)).toBeGreaterThan(1);
  });

  it('escolher uma opção do esclarecimento resolve o pedido', async () => {
    const { app } = await montarApp();
    fechar = () => app.close();
    const amb = await perguntar(app, 'Qual o saldo do contrato de outsourcing?');
    const escolha = amb.esclarecimento!.opcoes[0]!;
    const r = await app.inject({
      method: 'POST', url: '/api/v1/assistente/interpretar', headers: comoGestor(),
      payload: { frase: 'saldo', encaminhamento: { capacidade: 'contrato.saldo', parametros: escolha.parametros } },
    });
    expect((r.json() as Resposta).resultado?.texto).toContain(String(escolha.parametros['contratoNumero']));
  });
});

// ─── CONSULTAS ───────────────────────────────────────────────────────────────

describe('consultas transversais', () => {
  it('carteira em risco traz motivos com números', async () => {
    const { app } = await montarApp();
    fechar = () => app.close();
    const r = await perguntar(app, 'Que contratos estão em risco?');
    expect(r.capacidade?.nome).toBe('carteira.risco');
    expect((r.resultado?.tabela?.linhas.length ?? 0)).toBeGreaterThan(0);
    expect(r.resultado?.tabela?.colunas).toContain('Motivos');
  });

  it('contratos a terminar num período, com o prazo do procedimento', async () => {
    const { app } = await montarApp();
    fechar = () => app.close();
    const r = await perguntar(app, 'Que contratos terminam este ano?');
    expect(r.capacidade?.nome).toBe('carteira.terminam');
    expect(r.resultado?.tabela?.colunas).toContain('Lançar procedimento até');
  });

  it('retrato financeiro da carteira separa executado de faturado', async () => {
    const { app } = await montarApp();
    fechar = () => app.close();
    const r = await perguntar(app, 'Quanto temos contratado no total na carteira?');
    expect(r.capacidade?.nome).toBe('carteira.resumo');
    expect(r.resultado?.texto).toMatch(/faturas validadas/);
  });

  it('onde está afeta uma pessoa, com histórico', async () => {
    const { app } = await montarApp();
    fechar = () => app.close();
    const r = await perguntar(app, 'Onde está afeto o Diogo Marques?');
    expect(r.capacidade?.nome).toBe('pessoa.onde-esta');
    expect(r.resultado?.tabela?.colunas).toContain('Estado');
  });

  it('quem está num contrato', async () => {
    const { app } = await montarApp();
    fechar = () => app.close();
    const r = await perguntar(app, 'Quem está afeto ao C-2026-001?');
    expect(r.capacidade?.nome).toBe('contrato.quem-esta');
    expect((r.resultado?.tabela?.linhas.length ?? 0)).toBeGreaterThan(0);
  });

  it('registos por aprovar, agregados por pessoa', async () => {
    const { app } = await montarApp();
    fechar = () => app.close();
    const r = await perguntar(app, 'Que registos estão por aprovar?');
    expect(r.capacidade?.nome).toBe('registos.por-aprovar');
    expect(r.resultado?.texto).toBeDefined();
  });

  it('estado das faturas distingue por decidir de validadas', async () => {
    const { app } = await montarApp();
    fechar = () => app.close();
    const r = await perguntar(app, 'Que faturas estão por conferir?');
    expect(r.capacidade?.nome).toBe('faturas.estado');
    expect(r.resultado?.texto).toMatch(/validada|decidir/);
  });

  it('entregáveis por faturar', async () => {
    const { app } = await montarApp();
    fechar = () => app.close();
    const r = await perguntar(app, 'Como estão os entregáveis do C-2026-CM1?');
    expect(r.capacidade?.nome).toBe('entregaveis.estado');
    expect(r.resultado?.texto).toMatch(/entreg/i);
  });

  it('explicar uma decisão traz a escada de opções com prazos', async () => {
    const { app } = await montarApp();
    fechar = () => app.close();
    await app.inject({ method: 'POST', url: '/api/v1/jobs/alertas:executar', headers: comoGestor() });
    const r = await perguntar(app, 'Explica a decisão do contrato C-2026-EX1');
    expect(r.capacidade?.nome).toBe('decisoes.explicar');
    expect(r.resultado?.texto).toMatch(/AL-/);
  });

  it('resumo do orçamento com a competência do CA', async () => {
    const { app } = await montarApp();
    fechar = () => app.close();
    await app.inject({ method: 'POST', url: '/api/v1/orcamentos', headers: comoGestor(), payload: { ano: 2027 } });
    const r = await perguntar(app, 'Como está o orçamento de 2027?');
    expect(r.capacidade?.nome).toBe('orcamento.resumo');
    expect(r.resultado?.texto).toMatch(/Conselho de Administração|despacho conjunto/);
  });

  it('«o que sabes fazer» responde do catálogo', async () => {
    const { app } = await montarApp();
    fechar = () => app.close();
    const r = await perguntar(app, 'O que sabes fazer?');
    expect(r.capacidade?.nome).toBe('ajuda');
    expect(r.resultado?.tabela?.linhas.length).toBe(CAPACIDADES.length);
  });

  it('as respostas oferecem o passo seguinte', async () => {
    const { app } = await montarApp();
    fechar = () => app.close();
    const r = await perguntar(app, 'Qual o saldo do C-2026-001?');
    expect((r.resultado?.proximos?.length ?? 0)).toBeGreaterThan(0);
    expect(r.resultado?.proximos?.[0]?.frase).toContain('C-2026-001');
  });

  it('o que não percebe não executa nada e sugere', async () => {
    const { app } = await montarApp();
    fechar = () => app.close();
    const r = await perguntar(app, 'qual é a capital da Noruega?');
    expect(r.capacidade).toBeUndefined();
    expect((r.sugestoes?.length ?? 0)).toBeGreaterThan(0);
  });
});

// ─── AÇÕES ───────────────────────────────────────────────────────────────────

describe('ações — simular antes de executar', () => {
  const trocar = 'Troca a Carla Andrade por Diogo Marques no perfil Arquiteto de Software Sénior do C-2026-001';

  it('a ação devolve simulação e NÃO executa', async () => {
    const { app, ctx } = await montarApp();
    fechar = () => app.close();
    const antes = (await ctx.repos.afetacoes.todos((a) => a.ativa)).length;
    const r = await perguntar(app, trocar);
    expect(r.capacidade?.tipo).toBe('ACAO');
    expect(r.simulacao?.regras.map((x) => x.codigo)).toContain('RN-701');
    expect((await ctx.repos.afetacoes.todos((a) => a.ativa)).length).toBe(antes);
  });

  it('as implicações são calculadas, não redigidas', async () => {
    const { app } = await montarApp();
    fechar = () => app.close();
    const r = await perguntar(app, trocar);
    expect(r.simulacao?.efeitos.some((x) => /\d+ h j[áa] registadas/.test(x))).toBe(true);
    expect(r.simulacao?.efeitos.some((x) => /Restam \d+ h no perfil/.test(x))).toBe(true);
  });

  it('confirmada, executa e a afetação muda', async () => {
    const { app, ctx } = await montarApp();
    fechar = () => app.close();
    const r = await perguntar(app, trocar);
    expect(r.simulacao?.bloqueada).toBe(false);
    const exec = await app.inject({
      method: 'POST', url: '/api/v1/assistente/executar', headers: comoGestor(),
      payload: { capacidade: 'afetacao.substituir', parametros: r.parametros, frase: trocar },
    });
    expect(exec.statusCode).toBe(200);
    expect((await ctx.repos.afetacoes.todos((a) => a.substituiAfetacaoId !== undefined && a.ativa)).some((a) => a.recursoId === 'oid-recurso-02')).toBe(true);
  });

  it('entidade executante diferente bloqueia (RN-701)', async () => {
    const { app } = await montarApp();
    fechar = () => app.close();
    const r = await perguntar(app, 'Troca a Carla Andrade por Eva Nogueira no perfil Arquiteto de Software Sénior do C-2026-001');
    expect(r.simulacao?.bloqueada).toBe(true);
    expect(r.simulacao?.regras.find((x) => x.codigo === 'RN-701')?.ok).toBe(false);
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

  it('prorrogação simula o limite de 36 meses e a cobertura da portaria', async () => {
    const { app } = await montarApp();
    fechar = () => app.close();
    const r = await perguntar(app, 'Prorroga a vigência do C-2026-001 até 2030-12-31');
    expect(r.capacidade?.nome).toBe('modificacao.prorrogar');
    expect(r.simulacao?.regras.map((x) => x.codigo)).toContain('RN-202');
    // Ultrapassa os 36 meses sem exceção fundamentada: bloqueia.
    expect(r.simulacao?.regras.find((x) => x.codigo === 'RN-202')?.ok).toBe(false);
    expect(r.simulacao?.bloqueada).toBe(true);
  });

  it('prorrogação sem data pergunta até quando', async () => {
    const { app } = await montarApp();
    fechar = () => app.close();
    const r = await perguntar(app, 'Prorroga a vigência do C-2026-001');
    expect(r.esclarecimento?.pergunta).toMatch(/Até quando/i);
  });

  it('complementares acima do teto são bloqueados (RN-301)', async () => {
    const { app } = await montarApp();
    fechar = () => app.close();
    const r = await perguntar(app, 'Regista 90 000 euros de trabalhos complementares no C-2026-003');
    expect(r.capacidade?.nome).toBe('modificacao.complementares');
    expect(r.simulacao?.regras.find((x) => x.codigo === 'RN-301')?.ok).toBe(false);
    expect(r.simulacao?.bloqueada).toBe(true);
  });

  it('a RN-302 avisa mas não bloqueia', async () => {
    const { app } = await montarApp();
    fechar = () => app.close();
    // O C-2026-003 já está a 42%; um acréscimo pequeno mantém-se abaixo de 50%.
    const r = await perguntar(app, 'Regista 1 000 euros de trabalhos complementares no C-2026-003');
    const rn302 = r.simulacao?.regras.find((x) => x.codigo === 'RN-302');
    expect(rn302?.ok).toBe(false);
    // Só falta a fundamentação para deixar de estar bloqueada — não a RN-302.
    expect(r.simulacao?.avisos.some((a) => /fundamenta/i.test(a))).toBe(true);
  });

  it('transitar saldo propõe o saldo por executar', async () => {
    const { app } = await montarApp();
    fechar = () => app.close();
    const r = await perguntar(app, 'Transita o saldo do C-2026-001 para o ano seguinte');
    expect(r.capacidade?.nome).toBe('contrato.transitar-saldo');
    expect(r.simulacao?.efeitos.some((x) => /Transita .* de saldo/.test(x))).toBe(true);
  });

  it('aprovar registos em lote diz quantos e quanto antes de confirmar', async () => {
    const { app } = await montarApp();
    fechar = () => app.close();
    const r = await perguntar(app, 'Aprova os registos do C-2026-001');
    expect(r.capacidade?.nome).toBe('registos.aprovar');
    expect(r.simulacao).toBeDefined();
  });

  it('dispensar exige motivo', async () => {
    const { app } = await montarApp();
    fechar = () => app.close();
    await app.inject({ method: 'POST', url: '/api/v1/jobs/alertas:executar', headers: comoGestor() });
    const r = await perguntar(app, 'Dispensa a decisão AL-FIM-ANO-ECONOMICO do C-2026-001');
    expect(r.capacidade?.nome).toBe('decisoes.dispensar');
    expect(r.simulacao?.bloqueada).toBe(true);
    expect(r.simulacao?.avisos.some((a) => /motivo/i.test(a))).toBe(true);
  });

  it('a execução fica na auditoria com a frase que a originou', async () => {
    const { app, ctx } = await montarApp();
    fechar = () => app.close();
    const r = await perguntar(app, trocar);
    await app.inject({
      method: 'POST', url: '/api/v1/assistente/executar', headers: comoGestor(),
      payload: { capacidade: 'afetacao.substituir', parametros: r.parametros, frase: trocar },
    });
    const eventos = await ctx.repos.eventosAuditoria.todos((x) => x.operacao === 'ASSISTENTE:EXECUTAR');
    expect(eventos.length).toBe(1);
    expect(JSON.stringify(eventos[0]?.depois)).toContain('Carla Andrade');
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

// ─── COMPOSIÇÃO DE LISTAS E RELATÓRIOS AD-HOC ────────────────────────────────

describe('compor uma lista pergunta a pergunta', () => {
  it('uma consulta com chaves fica em cima da mesa para a pergunta seguinte', async () => {
    const { app } = await montarApp();
    fechar = () => app.close();
    const r = await perguntar(app, 'Que contratos comportam um perfil a 40 euros por hora?');
    const t = r.conversa['tabela'] as { tipoEntidade: string; chaves: unknown[]; origem: unknown[] } | undefined;
    expect(t?.tipoEntidade).toBe('CONTRATO');
    expect(t?.chaves.length).toBe(r.resultado?.tabela?.linhas.length);
    expect(t?.origem.length).toBe(1);
  });

  it('acrescentar consumos junta colunas às MESMAS linhas, por identificador', async () => {
    const { app } = await montarApp();
    fechar = () => app.close();
    const um = await perguntar(app, 'Que contratos comportam um perfil a 40 euros por hora?');
    const antes = um.resultado?.tabela;
    const dois = await perguntar(app, 'Acrescenta os consumos atuais de cada contrato', um.conversa);

    expect(dois.capacidade?.nome).toBe('tabela.acrescentar');
    expect(dois.resultado?.tabela?.linhas.length).toBe(antes?.linhas.length);
    expect(dois.resultado?.tabela?.colunas).toContain('Executado');
    expect(dois.resultado?.tabela?.colunas).toContain('Por executar');
    // A proveniência acumula: a pergunta original e o bloco acrescentado.
    expect((dois.conversa['tabela'] as { origem: unknown[] }).origem.length).toBe(2);
  });

  it('um bloco que não existe para aquele tipo de entidade pergunta de volta', async () => {
    const { app } = await montarApp();
    fechar = () => app.close();
    const um = await perguntar(app, 'Que contratos estão em risco?');
    const dois = await perguntar(app, 'Junta a essa lista o número de telefone', um.conversa);
    expect(dois.esclarecimento?.pergunta).toContain('Não sei calcular');
    expect(dois.esclarecimento!.opcoes.length).toBeGreaterThan(3);
  });

  it('sem lista em curso, as funções de composição explicam como se começa', async () => {
    const { app } = await montarApp();
    fechar = () => app.close();
    const r = await app.inject({
      method: 'POST', url: '/api/v1/assistente/interpretar', headers: comoGestor(),
      payload: { frase: 'exporta esta lista', encaminhamento: { capacidade: 'tabela.exportar', parametros: {} } },
    });
    const j = r.json() as Resposta;
    expect(j.resultado?.semResultado).toBe(true);
    expect(j.resultado?.texto).toContain('lista em cima da mesa');
  });

  it('filtrar corta pela coluna dita e mantém as chaves alinhadas', async () => {
    const { app } = await montarApp();
    fechar = () => app.close();
    const um = await perguntar(app, 'Que contratos comportam um perfil a 40 euros por hora?');
    const antes = um.conversa['tabela'] as { linhas: Array<Array<string | number>>; colunas: string[] };
    const coluna = antes.colunas.indexOf('Valor disponível');
    const maior = Math.max(...antes.linhas.map((l) => Number(l[coluna])));

    const dois = await perguntar(app, `Fica só com as linhas em que o valor disponível é superior a ${maior}`, um.conversa);
    const nova = dois.conversa['tabela'] as { linhas: unknown[][]; chaves: unknown[] };
    expect(dois.capacidade?.nome).toBe('tabela.filtrar');
    expect(dois.esclarecimento).toBeUndefined();
    // Só o contrato com o maior valor sobrevive ao corte.
    expect(nova.linhas.length).toBe(1);
    expect(nova.chaves.length).toBe(1);
    expect(dois.resultado?.tabela?.linhas.length).toBe(1);
  });

  it('ordenar pela coluna dita inverte a lista quando se pede o menor primeiro', async () => {
    const { app } = await montarApp();
    fechar = () => app.close();
    const um = await perguntar(app, 'Que contratos comportam um perfil a 40 euros por hora?');
    const coluna = um.resultado!.tabela!.colunas.indexOf('Valor disponível');
    const dois = await perguntar(app, 'Ordena a lista pelo valor disponível, do menor para o maior', um.conversa);
    const depois = dois.resultado!.tabela!.linhas as Array<Array<string | number>>;
    expect(dois.capacidade?.nome).toBe('tabela.ordenar');
    expect(dois.esclarecimento).toBeUndefined();
    expect(depois.length).toBe(um.resultado!.tabela!.linhas.length);
    const valores = depois.map((l) => Number(l[coluna]));
    expect(valores).toEqual([...valores].sort((a, b) => a - b));
  });

  it('exportar leva duas folhas: os dados e a proveniência', async () => {
    const { app } = await montarApp();
    fechar = () => app.close();
    const um = await perguntar(app, 'Que contratos estão em risco?');
    const dois = await perguntar(app, 'Exporta esta lista para Excel', um.conversa);
    expect(dois.resultado?.exportavel?.folhas.length).toBe(2);
  });

  it('guardar grava a RECEITA — funções e parâmetros, não as frases', async () => {
    const { app } = await montarApp();
    fechar = () => app.close();
    const um = await perguntar(app, 'Que contratos comportam um perfil a 40 euros por hora?');
    const dois = await perguntar(app, 'Acrescenta os consumos atuais de cada contrato', um.conversa);
    await perguntar(app, 'Guarda esta lista nos relatórios', dois.conversa);

    const lista = await app.inject({ method: 'GET', url: '/api/v1/relatorios/ad-hoc', headers: comoGestor() });
    const { dados } = lista.json() as { dados: Array<{ passos: Array<{ capacidade: string; parametros: Record<string, unknown> }>; periodoRelativo: boolean }> };
    expect(dados.length).toBe(1);
    expect(dados[0]!.passos.map((p) => p.capacidade)).toEqual(['capacidade.folga-por-valor-hora', 'tabela.acrescentar']);
    expect(dados[0]!.passos[0]!.parametros['valorHoraEuros']).toBe(40);
    expect(dados[0]!.passos[1]!.parametros['bloco']).toBe('execucao');
    // Sem recorte temporal na frase, o período não é relativo a nada.
    expect(dados[0]!.periodoRelativo).toBe(false);
  });

  it('executar responde com os dados de HOJE, não com os do dia em que foi guardado', async () => {
    const { app } = await montarApp();
    fechar = () => app.close();
    const um = await perguntar(app, 'Que registos estão por aprovar?');
    const linhasAoGuardar = um.resultado!.tabela!.linhas.length;
    expect(linhasAoGuardar).toBeGreaterThan(0);
    await perguntar(app, 'Guarda esta lista nos relatórios', um.conversa);

    const { dados } = (await app.inject({ method: 'GET', url: '/api/v1/relatorios/ad-hoc', headers: comoGestor() })).json() as { dados: Array<{ id: string }> };
    const id = dados[0]!.id;

    // Executar sem nada mudar reproduz a lista.
    const antes = await app.inject({ method: 'POST', url: `/api/v1/relatorios/ad-hoc/${id}/executar`, headers: comoGestor() });
    const rAntes = antes.json() as { tabela?: { linhas: unknown[]; colunas: string[] }; executadoEm: string };
    expect(rAntes.tabela?.linhas.length).toBe(linhasAoGuardar);
    expect(rAntes.tabela?.colunas).toEqual(um.resultado!.tabela!.colunas);

    // Aprovar tudo esvazia a fila — e o relatório passa a dizê-lo.
    const submetidos = await app.inject({ method: 'GET', url: '/api/v1/registos-tempo?estado=SUBMETIDO&tamanho=200', headers: comoGestor() });
    const ids = (submetidos.json() as { dados: Array<{ id: string }> }).dados.map((x) => x.id);
    await app.inject({ method: 'POST', url: '/api/v1/registos-tempo:aprovar', headers: comoGestor(), payload: { ids } });

    const depois = await app.inject({ method: 'POST', url: `/api/v1/relatorios/ad-hoc/${id}/executar`, headers: comoGestor() });
    const rDepois = depois.json() as { tabela?: { linhas: unknown[] }; problema?: { tipo: string } };
    const linhasDepois = rDepois.tabela?.linhas.length ?? 0;
    expect(linhasDepois).toBeLessThan(linhasAoGuardar);
  });

  it('a execução respeita as permissões de quem abre, não as de quem guardou', async () => {
    const { app } = await montarApp();
    fechar = () => app.close();
    // «faturas.estado» exige gerir.faturas.compromissos, que um elemento não tem.
    const um = await perguntar(app, 'Que faturas estão por conferir?');
    await perguntar(app, 'Guarda esta lista nos relatórios', um.conversa);
    const { dados } = (await app.inject({ method: 'GET', url: '/api/v1/relatorios/ad-hoc', headers: comoGestor() })).json() as { dados: Array<{ id: string }> };

    const r = await app.inject({ method: 'POST', url: `/api/v1/relatorios/ad-hoc/${dados[0]!.id}/executar`, headers: comoRecurso() });
    const j = r.json() as { tabela?: unknown; problema?: { tipo: string; passo: number } };
    expect(j.tabela).toBeUndefined();
    expect(j.problema?.tipo).toBe('SEM_COMPETENCIA');
    expect(j.problema?.passo).toBe(1);
  });

  it('um período dito em linguagem corrente fica marcado como relativo e é alterável', async () => {
    const { app } = await montarApp();
    fechar = () => app.close();
    const um = await perguntar(app, 'Que contratos terminam este ano?');
    await perguntar(app, 'Guarda esta lista nos relatórios', um.conversa);
    const { dados } = (await app.inject({ method: 'GET', url: '/api/v1/relatorios/ad-hoc', headers: comoGestor() })).json() as { dados: Array<{ id: string; periodoRelativo: boolean }> };
    expect(dados[0]!.periodoRelativo).toBe(true);

    const patch = await app.inject({
      method: 'PATCH', url: `/api/v1/relatorios/ad-hoc/${dados[0]!.id}`,
      headers: comoGestor(), payload: { periodoRelativo: false },
    });
    expect((patch.json() as { periodoRelativo: boolean }).periodoRelativo).toBe(false);

    // Fixo, o período executado é o que ficou nos parâmetros.
    const exec = await app.inject({ method: 'POST', url: `/api/v1/relatorios/ad-hoc/${dados[0]!.id}/executar`, headers: comoGestor() });
    expect((exec.json() as { periodo?: { de: string } }).periodo?.de).toMatch(/^\d{4}-01-01$/);
  });

  it('apagar exige quem gere contratos e limpa a definição', async () => {
    const { app } = await montarApp();
    fechar = () => app.close();
    const um = await perguntar(app, 'Que contratos estão em risco?');
    await perguntar(app, 'Guarda esta lista nos relatórios', um.conversa);
    const { dados } = (await app.inject({ method: 'GET', url: '/api/v1/relatorios/ad-hoc', headers: comoGestor() })).json() as { dados: Array<{ id: string }> };

    const negado = await app.inject({ method: 'DELETE', url: `/api/v1/relatorios/ad-hoc/${dados[0]!.id}`, headers: comoRecurso() });
    expect(negado.statusCode).toBe(403);

    const apagar = await app.inject({ method: 'DELETE', url: `/api/v1/relatorios/ad-hoc/${dados[0]!.id}`, headers: comoGestor() });
    expect(apagar.statusCode).toBe(204);
    const depois = await app.inject({ method: 'GET', url: '/api/v1/relatorios/ad-hoc', headers: comoGestor() });
    expect((depois.json() as { dados: unknown[] }).dados.length).toBe(0);
  });

  it('um elemento da equipa não arquiva relatórios da carteira', async () => {
    const { app } = await montarApp();
    fechar = () => app.close();
    const r = await app.inject({
      method: 'POST', url: '/api/v1/assistente/executar', headers: comoRecurso(),
      payload: { capacidade: 'tabela.guardar', parametros: {} },
    });
    expect(r.statusCode).toBe(403);
  });
});
