import { z } from 'zod';
import {
  RN_701, RN_702, RN_208, RN_110, RN_202, RN_301, RN_302,
  complementaresAcumulados, vigenciaLiquidaMeses, valorLegal, LIMITE_VIGENCIA_MESES,
  estadoEntregavel, eurosTexto, dataTexto,
} from '@chora/domain';
import type { Capacidade, RegraAvaliada, Simulacao } from '../tipos.js';
import { ServicoAfetacoes } from '../../servicos/afetacoes.js';
import { ServicoAlertas } from '../../servicos/alertas.js';
import { ServicoContratos } from '../../servicos/contratos.js';
import { ServicoEstrutura } from '../../servicos/estrutura.js';
import { ServicoRegistosTempo } from '../../servicos/registos-tempo.js';
import { ServicoEntregaveis } from '../../servicos/entregaveis.js';
import { ErroEsclarecimento } from '../erros.js';
import { F, horas, avaliar, contratoDe, pessoaDe, perfilDe, periodoDe, DESC_CONTRATO, DESC_PERIODO } from './comum.js';

/** Um euro em cêntimos, para converter os montantes ditos em linguagem corrente. */
const cent = (euros: number): number => Math.round(euros * 100);

// ─── AFETAÇÕES ──────────────────────────────────────────────────────────────

const zSubstituir = z.object({
  contratoNumero: z.string().optional(),
  perfil: z.string().optional(),
  pessoaEntra: z.string().optional(),
  pessoaSai: z.string().optional(),
});
type PSubstituir = z.infer<typeof zSubstituir>;

/** Resolve tudo o que a substituição precisa, perguntando o que faltar. */
async function alvoSubstituicao(p: PSubstituir, e: Parameters<NonNullable<Capacidade<PSubstituir>['simular']>>[1]): Promise<{
  contrato: import('@chora/domain').Contrato;
  perfil: import('@chora/domain').PerfilContratual;
  afetacao: import('@chora/domain').Afetacao;
  entra: { id: string; nome: string };
  nomeSai: string;
}> {
  const contrato = await contratoDe(p.contratoNumero, e);
  const perfis = await e.ctx.repos.perfis.todos((x) => x.contratoId === contrato.id);
  const perfil = perfilDe(p.perfil, perfis, contrato, e);

  const ativas = await e.ctx.repos.afetacoes.todos((a) => a.perfilId === perfil.id && a.ativa);
  if (ativas.length === 0) {
    throw new ErroEsclarecimento(`Não há ninguém afeto ao perfil ${perfil.nome} do ${contrato.numero}: não há substituição a fazer.`, []);
  }

  let afetacao = ativas[0]!;
  if (p.pessoaSai !== undefined) {
    const sai = pessoaDe(p.pessoaSai, e, 'quem sai');
    const encontrada = ativas.find((a) => a.recursoId === sai.id);
    if (encontrada === undefined) {
      throw new ErroEsclarecimento(`${sai.nome} não está afeto ao perfil ${perfil.nome} do ${contrato.numero}. Quem sai?`,
        ativas.map((a) => ({ rotulo: e.ctx.diretorio.nome(a.recursoId) ?? a.recursoId, parametros: { ...p, pessoaSai: e.ctx.diretorio.nome(a.recursoId) } })));
    }
    afetacao = encontrada;
  } else if (ativas.length > 1) {
    throw new ErroEsclarecimento(`Há ${ativas.length} pessoas no perfil ${perfil.nome}. Quem sai?`,
      ativas.map((a) => ({ rotulo: e.ctx.diretorio.nome(a.recursoId) ?? a.recursoId, parametros: { ...p, pessoaSai: e.ctx.diretorio.nome(a.recursoId) } })));
  }

  const entra = pessoaDe(p.pessoaEntra, e, 'quem entra');
  return { contrato, perfil, afetacao, entra, nomeSai: e.ctx.diretorio.nome(afetacao.recursoId) ?? afetacao.recursoId };
}

export const substituirAfetacao: Capacidade<PSubstituir> = {
  nome: 'afetacao.substituir',
  titulo: 'Substituir a pessoa afeta a um perfil',
  descricao: 'Encerra a afetação atual e cria a sucessora com outra pessoa, no mesmo perfil e na mesma entidade executante.',
  tipo: 'ACAO',
  parametros: zSubstituir,
  parametrosDescricao: [
    DESC_CONTRATO,
    { nome: 'perfil', tipo: 'texto', obrigatorio: false, descricao: 'Perfil onde a troca acontece' },
    { nome: 'pessoaEntra', tipo: 'texto', obrigatorio: false, descricao: 'Quem passa a estar afeto' },
    { nome: 'pessoaSai', tipo: 'texto', obrigatorio: false, descricao: 'Quem sai; necessário se houver mais do que uma pessoa no perfil' },
  ],
  operacao: 'gerir.afetacoes',
  regras: ['RN-701', 'RN-702', 'RN-208'],
  exemplos: ['Troca a Carla Andrade por Diogo Marques no perfil Arquiteto do C-2026-001'],

  async simular(p, e): Promise<Simulacao> {
    const { contrato, perfil, afetacao, entra, nomeSai } = await alvoSubstituicao(p, e);
    const [antigo, novo] = await Promise.all([
      e.ctx.repos.recursos.obter(afetacao.recursoId),
      e.ctx.repos.recursos.obter(entra.id),
    ]);
    const aprovados = await e.ctx.repos.registosTempo.todos((r) => r.perfilId === perfil.id && r.estado === 'APROVADO');
    const consumidos = aprovados.reduce((s, r) => s + r.duracao, 0);
    const doQueSai = aprovados.filter((r) => r.recursoId === afetacao.recursoId).reduce((s, r) => s + r.duracao, 0);
    const restantes = Math.max(0, perfil.quantidadePrevista - consumidos);
    const entidadeAntiga = antigo?.entidadeExecutanteNipc ?? '';
    const entidadeNova = novo?.entidadeExecutanteNipc ?? '';

    const regras: RegraAvaliada[] = [
      avaliar(RN_701, { perfilAntigo: perfil.id, perfilNovo: perfil.id, entidadeAntiga, entidadeNova, encerraAnterior: true }),
      avaliar(RN_702, { entidadeExecutanteNipc: entidadeNova }),
      avaliar(RN_208, { estado: contrato.estado }),
    ];
    const avisos: string[] = [];
    if (novo === null) avisos.push(`${entra.nome} ainda não está registado como recurso: será preciso criá-lo antes de o afetar.`);
    else if (!novo.ativo) avisos.push(`${entra.nome} está inativo.`);
    if (entidadeNova !== '' && entidadeNova !== entidadeAntiga) {
      avisos.push(`As entidades executantes não coincidem (${entidadeAntiga} → ${entidadeNova}): não é substituição, é subcontratação ou cessão.`);
    }
    if (restantes === 0) avisos.push('O perfil não tem horas por consumir: a sucessora não teria trabalho imputável.');

    return {
      titulo: `Substituição de afetação · ${contrato.numero} · ${perfil.nome}`,
      efeitos: [
        `Sai ${nomeSai}${entidadeAntiga !== '' ? ` (entidade ${entidadeAntiga})` : ''}.`,
        `Entra ${entra.nome}${entidadeNova !== '' ? ` (entidade ${entidadeNova})` : ''}.`,
        `A afetação atual é encerrada em ${dataTexto(e.hoje)} e criada uma sucessora que a referencia.`,
        `As ${horas(doQueSai)} h já registadas por ${nomeSai} mantêm-se imputadas ao perfil e não são afetadas.`,
        `Restam ${horas(restantes)} h no perfil, que passam a poder ser executadas por ${entra.nome}.`,
      ],
      regras, avisos,
      bloqueada: regras.some((r) => !r.ok) || novo === null,
    };
  },

  async executar(p, e) {
    const { contrato, perfil, afetacao, entra, nomeSai } = await alvoSubstituicao(p, e);
    const r = await new ServicoAfetacoes(e.ctx).substituir(afetacao.id, entra.id, e.utilizador);
    return {
      texto:
        `Substituição registada no ${contrato.numero}, perfil ${perfil.nome}: ${nomeSai} sai e ${entra.nome} entra. ` +
        `A afetação anterior foi encerrada e criada a sucessora ${r.sucessora.id}, que a referencia para o histórico.`,
      fontes: [F('REGRA', 'RN-701 — perfil e entidade coincidentes'), F('REGRA', 'Auditoria da operação SUBSTITUIR')],
      proximos: [{ rotulo: 'Ver quem está no contrato', frase: `Quem está afeto ao ${contrato.numero}?` }],
    };
  },
};

const zAfetar = z.object({ contratoNumero: z.string().optional(), perfil: z.string().optional(), pessoa: z.string().optional() });

export const criarAfetacao: Capacidade<z.infer<typeof zAfetar>> = {
  nome: 'afetacao.criar',
  titulo: 'Afetar uma pessoa a um perfil',
  descricao: 'Cria uma afetação nova de uma pessoa a um perfil contratual, a partir de hoje.',
  tipo: 'ACAO',
  parametros: zAfetar,
  parametrosDescricao: [
    DESC_CONTRATO,
    { nome: 'perfil', tipo: 'texto', obrigatorio: false, descricao: 'Perfil a que a pessoa fica afeta' },
    { nome: 'pessoa', tipo: 'texto', obrigatorio: false, descricao: 'Quem passa a estar afeto' },
  ],
  operacao: 'gerir.afetacoes',
  regras: ['RN-702', 'RN-208'],
  exemplos: ['Afeta o Diogo Marques ao perfil Programador Júnior do C-2026-001'],

  async simular(p, e) {
    const contrato = await contratoDe(p.contratoNumero, e);
    const perfis = await e.ctx.repos.perfis.todos((x) => x.contratoId === contrato.id);
    const perfil = perfilDe(p.perfil, perfis, contrato, e);
    const pessoa = pessoaDe(p.pessoa, e, 'quem fica afeto');
    const recurso = await e.ctx.repos.recursos.obter(pessoa.id);
    const aprovados = await e.ctx.repos.registosTempo.todos((r) => r.perfilId === perfil.id && r.estado === 'APROVADO');
    const restantes = Math.max(0, perfil.quantidadePrevista - aprovados.reduce((s, r) => s + r.duracao, 0));
    const jaAfeto = (await e.ctx.repos.afetacoes.todos((a) => a.perfilId === perfil.id && a.recursoId === pessoa.id && a.ativa)).length > 0;

    const entidade = recurso?.entidadeExecutanteNipc ?? '';
    const regras: RegraAvaliada[] = [
      avaliar(RN_702, { entidadeExecutanteNipc: entidade }),
      avaliar(RN_208, { estado: contrato.estado }),
    ];
    const avisos: string[] = [];
    if (recurso === null) avisos.push(`${pessoa.nome} não está registado como recurso: crie-o primeiro em «Recursos».`);
    if (jaAfeto) avisos.push(`${pessoa.nome} já está afeto a este perfil.`);
    if (entidade !== '' && entidade !== contrato.prestador.nipc) {
      avisos.push(`A entidade de ${pessoa.nome} (${entidade}) não é a adjudicatária (${contrato.prestador.nipc}): exige subcontratação autorizada (RN-702).`);
    }
    if (restantes === 0) avisos.push('O perfil não tem horas por consumir.');

    return {
      titulo: `Nova afetação · ${contrato.numero} · ${perfil.nome}`,
      efeitos: [
        `${pessoa.nome} fica afeto ao perfil ${perfil.nome} a partir de ${dataTexto(e.hoje)}.`,
        `O perfil tem ${horas(restantes)} h por consumir, a ${eurosTexto(perfil.precos[perfil.precos.length - 1]?.valorHora ?? 0)}/h.`,
        'A afetação habilita o registo de tempo; não altera o valor contratado.',
      ],
      regras, avisos,
      bloqueada: regras.some((r) => !r.ok) || recurso === null || jaAfeto,
    };
  },

  async executar(p, e) {
    const contrato = await contratoDe(p.contratoNumero, e);
    const perfis = await e.ctx.repos.perfis.todos((x) => x.contratoId === contrato.id);
    const perfil = perfilDe(p.perfil, perfis, contrato, e);
    const pessoa = pessoaDe(p.pessoa, e, 'quem fica afeto');
    await new ServicoAfetacoes(e.ctx).criar(
      { contratoId: contrato.id, perfilId: perfil.id, recursoId: pessoa.id },
      e.utilizador,
    );
    return {
      texto: `${pessoa.nome} ficou afeto ao perfil ${perfil.nome} do ${contrato.numero}, com efeitos a ${dataTexto(e.hoje)}.`,
      fontes: [F('REGRA', 'RN-702 — entidade executante identificada')],
      proximos: [{ rotulo: 'Ver quem está no contrato', frase: `Quem está afeto ao ${contrato.numero}?` }],
    };
  },
};

// ─── MODIFICAÇÕES ───────────────────────────────────────────────────────────

const zProrrogar = z.object({
  contratoNumero: z.string().optional(),
  novaDataTermino: z.string().optional(),
  fundamentacao: z.string().optional(),
});

export const prorrogarVigencia: Capacidade<z.infer<typeof zProrrogar>> = {
  nome: 'modificacao.prorrogar',
  titulo: 'Prorrogar a vigência de um contrato',
  descricao: 'Regista uma prorrogação do prazo de vigência, verificando o limite legal de 36 meses e a cobertura da portaria.',
  tipo: 'ACAO',
  parametros: zProrrogar,
  parametrosDescricao: [
    DESC_CONTRATO,
    { nome: 'novaDataTermino', tipo: 'data', obrigatorio: false, descricao: 'Nova data de término (AAAA-MM-DD)' },
    { nome: 'fundamentacao', tipo: 'texto', obrigatorio: false, descricao: 'Fundamentação do ato (RN-110)' },
  ],
  operacao: 'gerir.contratos',
  regras: ['RN-110', 'RN-202'],
  exemplos: ['Prorroga a vigência do C-2026-001 até 2028-06-30'],

  async simular(p, e) {
    const contrato = await contratoDe(p.contratoNumero, e);
    if (p.novaDataTermino === undefined) {
      throw new ErroEsclarecimento(`Até quando quer prorrogar o ${contrato.numero}? Termina em ${contrato.dataTerminoContratual}.`, []);
    }
    const alteracoes = await e.ctx.repos.alteracoes.todos((a) => a.contratoId === contrato.id);
    const liquidaAtual = vigenciaLiquidaMeses(contrato.dataInicioVigencia, contrato.dataTerminoContratual, alteracoes);
    const liquidaNova = vigenciaLiquidaMeses(contrato.dataInicioVigencia, p.novaDataTermino, alteracoes);
    const temExcecao = contrato.excecoes.some((x) => x.regra === 'RN-202' || x.regra === 'RN-204');
    const portaria = contrato.portariaExtensaoEncargos;
    const anoNovo = Number(p.novaDataTermino.slice(0, 4));
    const cobreAno = portaria === undefined || portaria.reparticaoAnual.some((r) => r.ano >= anoNovo);

    const regras: RegraAvaliada[] = [
      avaliar(RN_110, { fundamentacao: p.fundamentacao ?? '', dataEfeito: e.hoje }),
      avaliar(RN_202, { dataInicioVigencia: contrato.dataInicioVigencia, dataTerminoContratual: p.novaDataTermino, temExcecao }),
    ];
    const avisos: string[] = [];
    if (p.novaDataTermino <= contrato.dataTerminoContratual) {
      avisos.push(`A data indicada (${p.novaDataTermino}) não é posterior ao término atual (${contrato.dataTerminoContratual}).`);
    }
    if (!cobreAno) {
      avisos.push(`A portaria de extensão de encargos só reparte até ${Math.max(...portaria!.reparticaoAnual.map((r) => r.ano))}: sem reprogramação não há cobertura orçamental para ${anoNovo}.`);
    }
    if ((p.fundamentacao ?? '').trim() === '') avisos.push('A prorrogação exige fundamentação escrita (RN-110).');

    return {
      titulo: `Prorrogação de vigência · ${contrato.numero}`,
      efeitos: [
        `O término passa de ${dataTexto(contrato.dataTerminoContratual)} para ${dataTexto(p.novaDataTermino)}.`,
        `A vigência líquida passa de ${liquidaAtual.toFixed(1)} para ${liquidaNova.toFixed(1)} meses (limite legal: ${LIMITE_VIGENCIA_MESES}).`,
        'Fica registada uma alteração contratual do tipo PRORROGACAO, com data de efeito de hoje.',
        cobreAno ? 'A cobertura orçamental do período acrescido mantém-se.' : 'A cobertura orçamental do período acrescido fica por assegurar.',
      ],
      regras, avisos,
      bloqueada: regras.some((r) => !r.ok) || p.novaDataTermino <= contrato.dataTerminoContratual,
    };
  },

  async executar(p, e) {
    const contrato = await contratoDe(p.contratoNumero, e);
    if (p.novaDataTermino === undefined) throw new ErroEsclarecimento('Indique a nova data de término.', []);
    await new ServicoEstrutura(e.ctx).registarAlteracao(contrato.id, {
      tipo: 'PRORROGACAO', dataEfeito: e.hoje,
      descricao: `Prorrogação da vigência até ${p.novaDataTermino}`,
      fundamentacao: p.fundamentacao ?? '',
      novaDataTermino: p.novaDataTermino,
    }, e.utilizador);
    return {
      texto: `Prorrogação registada no ${contrato.numero}: a vigência passa a terminar em ${dataTexto(p.novaDataTermino)}.`,
      fontes: [F('REGRA', 'RN-110 — fundamentação obrigatória'), F('REGRA', 'RN-202 — limite de 36 meses')],
      proximos: [{ rotulo: 'Ver a vigência', frase: `Qual a vigência do ${contrato.numero}?` }],
    };
  },
};

const zComplementares = z.object({
  contratoNumero: z.string().optional(),
  valorEuros: z.number().positive().optional(),
  fundamentacao: z.string().optional(),
});

export const registarComplementares: Capacidade<z.infer<typeof zComplementares>> = {
  nome: 'modificacao.complementares',
  titulo: 'Registar trabalhos complementares',
  descricao: 'Acrescenta serviços complementares ao contrato, verificando o teto legal de 50% do preço inicial.',
  tipo: 'ACAO',
  parametros: zComplementares,
  parametrosDescricao: [
    DESC_CONTRATO,
    { nome: 'valorEuros', tipo: 'número', obrigatorio: false, descricao: 'Valor a acrescentar, em euros' },
    { nome: 'fundamentacao', tipo: 'texto', obrigatorio: false, descricao: 'Fundamentação do ato (RN-110)' },
  ],
  operacao: 'gerir.contratos',
  regras: ['RN-110', 'RN-301', 'RN-302'],
  exemplos: ['Regista 20 000 euros de trabalhos complementares no C-2026-003'],

  async simular(p, e) {
    const contrato = await contratoDe(p.contratoNumero, e);
    if (p.valorEuros === undefined) {
      const alteracoes = await e.ctx.repos.alteracoes.todos((a) => a.contratoId === contrato.id);
      const folga = Math.max(0, Math.floor(contrato.precoContratualInicial * valorLegal('COMPLEMENTARES_MAX_PCT', 0.5)) - complementaresAcumulados(alteracoes));
      throw new ErroEsclarecimento(`Que valor quer acrescentar ao ${contrato.numero}? Ainda cabem ${eurosTexto(folga)} dentro do teto legal.`, []);
    }
    const alteracoes = await e.ctx.repos.alteracoes.todos((a) => a.contratoId === contrato.id);
    const acumulado = complementaresAcumulados(alteracoes);
    const novo = cent(p.valorEuros);
    const pct = valorLegal('COMPLEMENTARES_MAX_PCT', 0.5);

    const regras: RegraAvaliada[] = [
      avaliar(RN_110, { fundamentacao: p.fundamentacao ?? '', dataEfeito: e.hoje }),
      avaliar(RN_301, { precoContratualInicial: contrato.precoContratualInicial, complementaresAcumulados: acumulado + novo }),
      avaliar(RN_302, { precoContratualInicial: contrato.precoContratualInicial, complementaresAcumulados: acumulado + novo }),
    ];
    const rácio = contrato.precoContratualInicial > 0 ? (acumulado + novo) / contrato.precoContratualInicial : 0;
    const avisos: string[] = [];
    if ((p.fundamentacao ?? '').trim() === '') avisos.push('O ato exige fundamentação escrita (RN-110).');
    if (rácio >= 0.4 && rácio < 0.5) avisos.push(`Os complementares passam a ${Math.round(rácio * 100)}% do preço inicial: acima de 40% é achado frequente em auditoria (RN-302).`);

    return {
      titulo: `Trabalhos complementares · ${contrato.numero}`,
      efeitos: [
        `Acrescenta ${eurosTexto(novo)} ao contrato, que passa de ${eurosTexto(contrato.precoContratualAtual)} para ${eurosTexto(contrato.precoContratualAtual + novo)}.`,
        `Os complementares acumulados passam de ${eurosTexto(acumulado)} para ${eurosTexto(acumulado + novo)} — ${Math.round(rácio * 100)}% do preço inicial (teto: ${Math.round(pct * 100)}%).`,
        'Fica registada uma alteração contratual do tipo SERVICOS_COMPLEMENTARES.',
      ],
      regras,
      avisos,
      // A RN-302 é consultiva: avisa aos 40%, não bloqueia. Só a RN-301 impede.
      bloqueada: regras.filter((r) => r.codigo !== 'RN-302').some((r) => !r.ok),
    };
  },

  async executar(p, e) {
    const contrato = await contratoDe(p.contratoNumero, e);
    if (p.valorEuros === undefined) throw new ErroEsclarecimento('Indique o valor a acrescentar.', []);
    await new ServicoEstrutura(e.ctx).registarAlteracao(contrato.id, {
      tipo: 'SERVICOS_COMPLEMENTARES', dataEfeito: e.hoje,
      descricao: `Trabalhos complementares de ${eurosTexto(cent(p.valorEuros))}`,
      fundamentacao: p.fundamentacao ?? '',
      valorAcrescido: cent(p.valorEuros),
    }, e.utilizador);
    return {
      texto: `Trabalhos complementares de ${eurosTexto(cent(p.valorEuros))} registados no ${contrato.numero}.`,
      fontes: [F('REGRA', 'RN-301 — limite de 50% (CCP, art. 370.º n.º 4)')],
      proximos: [{ rotulo: 'Ver a margem que resta', frase: `Quanto posso ainda gastar em complementares no ${contrato.numero}?` }],
    };
  },
};

const zTransitar = z.object({
  contratoNumero: z.string().optional(),
  montanteEuros: z.number().positive().optional(),
  executavelAte: z.string().optional(),
  fundamentacao: z.string().optional(),
});

export const transitarSaldo: Capacidade<z.infer<typeof zTransitar>> = {
  nome: 'contrato.transitar-saldo',
  titulo: 'Transitar saldo para o ano económico seguinte',
  descricao: 'Regista a transição do saldo por executar, para que possa ser consumido no ano seguinte sem portaria.',
  tipo: 'ACAO',
  parametros: zTransitar,
  parametrosDescricao: [
    DESC_CONTRATO,
    { nome: 'montanteEuros', tipo: 'número', obrigatorio: false, descricao: 'Montante a transitar; por omissão, o saldo por executar' },
    { nome: 'executavelAte', tipo: 'data', obrigatorio: false, descricao: 'Data-limite de execução do saldo transitado' },
    { nome: 'fundamentacao', tipo: 'texto', obrigatorio: false, descricao: 'Fundamentação do pedido' },
  ],
  operacao: 'gerir.contratos',
  regras: ['RN-110'],
  exemplos: ['Transita o saldo do C-2026-001 para o ano seguinte'],

  async simular(p, e) {
    const contrato = await contratoDe(p.contratoNumero, e);
    const aprovados = await e.ctx.repos.registosTempo.todos((r) => r.contratoId === contrato.id && r.estado === 'APROVADO');
    const executado = aprovados.reduce((s, r) => s + r.valorImputado, 0);
    const saldo = Math.max(0, contrato.precoContratualAtual - executado);
    const montante = p.montanteEuros !== undefined ? cent(p.montanteEuros) : saldo;
    const anoSeguinte = Number(e.hoje.slice(0, 4)) + 1;
    const ate = p.executavelAte ?? `${anoSeguinte}-12-31`;

    const regras: RegraAvaliada[] = [avaliar(RN_110, { fundamentacao: p.fundamentacao ?? '', dataEfeito: e.hoje })];
    const avisos: string[] = [];
    if ((p.fundamentacao ?? '').trim() === '') avisos.push('A transição exige fundamentação escrita (RN-110).');
    if (montante > saldo) avisos.push(`O montante indicado (${eurosTexto(montante)}) excede o saldo por executar (${eurosTexto(saldo)}).`);
    if (ate > contrato.dataTerminoContratual) {
      avisos.push(`A data de execução (${ate}) é posterior ao término do contrato (${contrato.dataTerminoContratual}): a execução tem de caber na vigência.`);
    }

    return {
      titulo: `Transição para o ano económico seguinte · ${contrato.numero}`,
      efeitos: [
        `Transita ${eurosTexto(montante)} de saldo por executar, de um total disponível de ${eurosTexto(saldo)}.`,
        `O saldo transitado passa a poder ser executado até ${dataTexto(ate)}.`,
        'Não altera o preço contratual nem a vigência: muda o ano em que a despesa pode ser realizada.',
      ],
      regras, avisos,
      bloqueada: regras.some((r) => !r.ok) || montante > saldo || montante === 0,
    };
  },

  async executar(p, e) {
    const contrato = await contratoDe(p.contratoNumero, e);
    const aprovados = await e.ctx.repos.registosTempo.todos((r) => r.contratoId === contrato.id && r.estado === 'APROVADO');
    const saldo = Math.max(0, contrato.precoContratualAtual - aprovados.reduce((s, r) => s + r.valorImputado, 0));
    const montante = p.montanteEuros !== undefined ? cent(p.montanteEuros) : saldo;
    const ate = p.executavelAte ?? `${Number(e.hoje.slice(0, 4)) + 1}-12-31`;
    await new ServicoContratos(e.ctx).transitarAnoEconomico(contrato.id, montante, ate, p.fundamentacao ?? '', e.utilizador);
    return {
      texto: `Transição registada no ${contrato.numero}: ${eurosTexto(montante)} executáveis até ${dataTexto(ate)}.`,
      fontes: [F('REGRA', 'RN-110 — fundamentação obrigatória')],
    };
  },
};

// ─── OPERAÇÃO ───────────────────────────────────────────────────────────────

const zAprovar = z.object({
  contratoNumero: z.string().optional(), pessoa: z.string().optional(),
  periodoDe: z.string().optional(), periodoAte: z.string().optional(),
});

export const aprovarRegistos: Capacidade<z.infer<typeof zAprovar>> = {
  nome: 'registos.aprovar',
  titulo: 'Aprovar registos de tempo em lote',
  descricao: 'Aprova todos os registos submetidos que correspondam ao contrato, pessoa e período indicados.',
  tipo: 'ACAO',
  parametros: zAprovar,
  parametrosDescricao: [
    DESC_CONTRATO,
    { nome: 'pessoa', tipo: 'texto', obrigatorio: false, descricao: 'Restringe a uma pessoa' },
    ...DESC_PERIODO,
  ],
  operacao: 'registo.aprovar',
  regras: ['RN-406', 'RN-407', 'RN-411'],
  exemplos: ['Aprova os registos de maio do C-2026-001', 'Aprova os registos do Diogo'],

  async simular(p, e) {
    const { lista, ambito } = await registosAlvo(p, e);
    const minutos = lista.reduce((s, r) => s + r.duracao, 0);
    const valor = lista.reduce((s, r) => s + r.valorImputado, 0);
    const pessoas = new Set(lista.map((r) => r.recursoId));
    return {
      titulo: `Aprovação de registos · ${ambito}`,
      efeitos: lista.length === 0
        ? ['Não há registos submetidos que correspondam ao pedido.']
        : [
          `Aprova ${lista.length} registo(s) de ${pessoas.size} pessoa(s): ${horas(minutos)} h.`,
          `Passa a contar ${eurosTexto(valor)} como execução do contrato — é a aprovação que consome a dotação.`,
          'Cada registo é avaliado à parte: os que violarem uma regra ficam por aprovar e são reportados.',
        ],
      regras: [],
      avisos: lista.length === 0 ? [] : ['A aprovação é o ato que torna o tempo faturável. Rever antes de confirmar em lote.'],
      bloqueada: lista.length === 0,
    };
  },

  async executar(p, e) {
    const { lista, ambito } = await registosAlvo(p, e);
    // O serviço aprova em lote e devolve o resultado item a item — cada registo
    // é avaliado à parte, e um que viole uma regra não arrasta os outros.
    const resultados = await new ServicoRegistosTempo(e.ctx).aprovar(lista.map((r) => r.id), e.utilizador);
    const okIds = new Set(resultados.filter((r) => r.ok).map((r) => r.id));
    const aprovados = lista.filter((r) => okIds.has(r.id));
    const recusados = resultados.filter((r) => !r.ok);
    return {
      texto:
        `Aprovados ${aprovados.length} de ${lista.length} registo(s) ${ambito}: ` +
        `${horas(aprovados.reduce((s, r) => s + r.duracao, 0))} h, ${eurosTexto(aprovados.reduce((s, r) => s + r.valorImputado, 0))}.` +
        (recusados.length > 0 ? ` ${recusados.length} ficaram por aprovar por violarem uma regra.` : ''),
      ...(recusados.length > 0
        ? {
          tabela: {
            titulo: 'Registos recusados',
            colunas: ['Data', 'Pessoa', 'Regra', 'Motivo'],
            linhas: recusados.map((r) => {
              const reg = lista.find((x) => x.id === r.id);
              return [reg?.data ?? r.id, e.ctx.diretorio.nome(reg?.recursoId ?? '') ?? '—', r.regra ?? '—', r.detalhe ?? '—'];
            }),
          },
        }
        : {}),
      fontes: [F('REGRA', 'RN-502/503/509 — regras de aprovação, avaliadas por registo')],
    };
  },
};

/** Registos submetidos que correspondem ao pedido, e como descrever o âmbito. */
async function registosAlvo(
  p: z.infer<typeof zAprovar>,
  e: Parameters<NonNullable<Capacidade<z.infer<typeof zAprovar>>['simular']>>[1],
): Promise<{ lista: Awaited<ReturnType<typeof e.ctx.repos.registosTempo.todos>>; ambito: string }> {
  const partes: string[] = [];
  let contratoId: string | undefined;
  if (p.contratoNumero !== undefined) {
    const c = await contratoDe(p.contratoNumero, e);
    contratoId = c.id; partes.push(`no ${c.numero}`);
  }
  let recursoId: string | undefined;
  if (p.pessoa !== undefined) {
    const pessoa = pessoaDe(p.pessoa, e);
    recursoId = pessoa.id; partes.push(`de ${pessoa.nome}`);
  }
  const temPeriodo = p.periodoDe !== undefined || p.periodoAte !== undefined;
  const periodo = temPeriodo ? periodoDe(p, e) : undefined;
  if (periodo !== undefined) partes.push(`em ${periodo.rotulo}`);

  const lista = await e.ctx.repos.registosTempo.todos((r) =>
    r.estado === 'SUBMETIDO' &&
    (contratoId === undefined || r.contratoId === contratoId) &&
    (recursoId === undefined || r.recursoId === recursoId) &&
    (periodo === undefined || (r.data >= periodo.de && r.data <= periodo.ate)));
  return { lista, ambito: partes.join(' ') || 'na carteira' };
}

const zEntrega = z.object({
  contratoNumero: z.string().optional(), entregavel: z.string().optional(), data: z.string().optional(),
});

export const registarEntrega: Capacidade<z.infer<typeof zEntrega>> = {
  nome: 'entregavel.registar-entrega',
  titulo: 'Registar a entrega de um entregável',
  descricao: 'Assinala um entregável como entregue, o que é o facto gerador da sua faturação.',
  tipo: 'ACAO',
  parametros: zEntrega,
  parametrosDescricao: [
    DESC_CONTRATO,
    { nome: 'entregavel', tipo: 'texto', obrigatorio: false, descricao: 'Designação do entregável' },
    { nome: 'data', tipo: 'data', obrigatorio: false, descricao: 'Data da entrega; por omissão, hoje' },
  ],
  operacao: 'gerir.contratos',
  regras: ['RN-608'],
  exemplos: ['Regista a entrega do módulo de gestão documental no C-2026-CM1'],

  async simular(p, e) {
    const { contrato, entregavel, data } = await alvoEntrega(p, e);
    return {
      titulo: `Entrega de entregável · ${contrato.numero}`,
      efeitos: [
        `«${entregavel.designacao}» passa a entregue em ${dataTexto(data)}.`,
        `Fica faturável pelo valor exato de ${eurosTexto(entregavel.valor)} — no preço fixo não há faturação parcial (RN-609).`,
        'A entrega é o facto gerador da faturação: antes dela, a fatura é recusada (RN-608).',
      ],
      regras: [],
      avisos: entregavel.entregue ? ['Este entregável já está assinalado como entregue.'] : [],
      bloqueada: entregavel.entregue,
    };
  },

  async executar(p, e) {
    const { contrato, entregavel, data } = await alvoEntrega(p, e);
    await new ServicoEntregaveis(e.ctx).registarEntrega(entregavel.id, data, undefined, e.utilizador);
    return {
      texto: `«${entregavel.designacao}» registado como entregue em ${dataTexto(data)}. Pode agora ser faturado por ${eurosTexto(entregavel.valor)}.`,
      fontes: [F('REGRA', 'RN-608 — só se fatura o que está entregue')],
      proximos: [{ rotulo: 'Registar a fatura', frase: `Registar uma fatura do ${contrato.numero}` }],
    };
  },
};

async function alvoEntrega(
  p: z.infer<typeof zEntrega>,
  e: Parameters<NonNullable<Capacidade<z.infer<typeof zEntrega>>['simular']>>[1],
): Promise<{ contrato: import('@chora/domain').Contrato; entregavel: import('@chora/domain').Entregavel; data: string }> {
  const contrato = await contratoDe(p.contratoNumero, e);
  const todos = await e.ctx.repos.entregaveis.todos((x) => x.contratoId === contrato.id);
  if (todos.length === 0) throw new ErroEsclarecimento(`O contrato ${contrato.numero} não tem entregáveis registados.`, []);
  const porEntregar = todos.filter((x) => estadoEntregavel(x) !== 'ENTREGUE' && estadoEntregavel(x) !== 'FATURADO');
  const opcoes = (porEntregar.length > 0 ? porEntregar : todos).map((x) => ({
    rotulo: x.designacao, detalhe: eurosTexto(x.valor), parametros: { ...p, contratoNumero: contrato.numero, entregavel: x.designacao },
  }));

  if (p.entregavel === undefined) throw new ErroEsclarecimento(`Que entregável do ${contrato.numero} foi entregue?`, opcoes);
  const alvo = p.entregavel.toLowerCase();
  const achados = todos.filter((x) => x.designacao.toLowerCase().includes(alvo) || alvo.includes(x.designacao.toLowerCase()));
  if (achados.length === 1) return { contrato, entregavel: achados[0]!, data: p.data ?? e.hoje };
  throw new ErroEsclarecimento(
    achados.length === 0 ? `Não encontrei «${p.entregavel}» no ${contrato.numero}.` : `«${p.entregavel}» corresponde a mais do que um entregável.`,
    opcoes,
  );
}

// ─── DECISÕES ───────────────────────────────────────────────────────────────

const zDispensar = z.object({
  contratoNumero: z.string().optional(), codigo: z.string().optional(),
  motivo: z.string().optional(), dias: z.number().int().positive().optional(),
});

export const dispensarDecisao: Capacidade<z.infer<typeof zDispensar>> = {
  nome: 'decisoes.dispensar',
  titulo: 'Dispensar uma decisão pendente',
  descricao: 'Tira uma decisão da fila por um período, com motivo. Reaparece no fim do prazo ou se a situação agravar.',
  tipo: 'ACAO',
  parametros: zDispensar,
  parametrosDescricao: [
    DESC_CONTRATO,
    { nome: 'codigo', tipo: 'texto', obrigatorio: false, descricao: 'Código do alerta a dispensar' },
    { nome: 'motivo', tipo: 'texto', obrigatorio: false, descricao: 'Porque se dispensa — fica em auditoria' },
    { nome: 'dias', tipo: 'número', obrigatorio: false, descricao: 'Dias de dispensa; por omissão 30' },
  ],
  operacao: 'gerir.contratos',
  regras: [],
  exemplos: ['Dispensa a decisão AL-TERMINO-6M do C-2026-001 por 60 dias'],

  async simular(p, e) {
    const { contrato, alerta, dias } = await alvoDispensa(p, e);
    return {
      titulo: `Dispensa de decisão · ${contrato.numero}`,
      efeitos: [
        `«${alerta.titulo}» (${alerta.codigo}) sai da fila do «Hoje» durante ${dias} dias.`,
        'Reaparece no fim do prazo, ou antes se a situação agravar — a dispensa não a resolve, adia-a.',
        'Fica registada em auditoria com o motivo indicado.',
      ],
      regras: [],
      avisos: (p.motivo ?? '').trim() === '' ? ['A dispensa exige motivo: é o que fica no registo para quem auditar.'] : [],
      bloqueada: (p.motivo ?? '').trim() === '',
    };
  },

  async executar(p, e) {
    const { contrato, alerta, dias } = await alvoDispensa(p, e);
    await new ServicoAlertas(e.ctx).dispensar(alerta.id, p.motivo ?? '', dias, e.utilizador);
    return {
      texto: `«${alerta.titulo}» dispensada por ${dias} dias no ${contrato.numero}. Reaparece se a situação agravar.`,
      fontes: [F('REGRA', 'Ciclo de vida das decisões — dispensa temporária')],
    };
  },
};

async function alvoDispensa(
  p: z.infer<typeof zDispensar>,
  e: Parameters<NonNullable<Capacidade<z.infer<typeof zDispensar>>['simular']>>[1],
): Promise<{ contrato: import('@chora/domain').Contrato; alerta: import('@chora/domain').Alerta; dias: number }> {
  const contrato = await contratoDe(p.contratoNumero, e);
  const pendentes = await new ServicoAlertas(e.ctx).pendentes(contrato.id);
  if (pendentes.length === 0) throw new ErroEsclarecimento(`O contrato ${contrato.numero} não tem decisões pendentes.`, []);
  const opcoes = pendentes.map((a) => ({
    rotulo: a.titulo, detalhe: a.codigo, parametros: { ...p, contratoNumero: contrato.numero, codigo: a.codigo },
  }));
  if (p.codigo === undefined) throw new ErroEsclarecimento(`Que decisão do ${contrato.numero} quer dispensar?`, opcoes);
  const alerta = pendentes.find((a) => a.codigo.toUpperCase() === p.codigo!.toUpperCase());
  if (alerta === undefined) throw new ErroEsclarecimento(`Não há decisão ${p.codigo} pendente no ${contrato.numero}.`, opcoes);
  return { contrato, alerta, dias: p.dias ?? 30 };
}

// ─── FATURAÇÃO (abre o ecrã) ────────────────────────────────────────────────

export const registarFatura: Capacidade<{ contratoNumero?: string; numeroFatura?: string; nifPrestador?: string; montanteSemIvaEuros?: number }> = {
  nome: 'fatura.registar',
  titulo: 'Registar e conferir uma fatura',
  descricao: 'Abre o ecrã de conferência de faturas na conversa, com os campos já preenchidos a partir do que foi lido nos documentos.',
  tipo: 'ACAO',
  parametros: z.object({
    contratoNumero: z.string().optional(), numeroFatura: z.string().optional(),
    nifPrestador: z.string().optional(), montanteSemIvaEuros: z.number().optional(),
  }),
  parametrosDescricao: [
    DESC_CONTRATO,
    { nome: 'numeroFatura', tipo: 'texto', obrigatorio: false, descricao: 'Número da fatura' },
    { nome: 'nifPrestador', tipo: 'texto', obrigatorio: false, descricao: 'NIF do prestador lido na fatura' },
    { nome: 'montanteSemIvaEuros', tipo: 'número', obrigatorio: false, descricao: 'Montante sem IVA, em euros' },
  ],
  operacao: 'gerir.faturas.compromissos',
  regras: ['RN-601', 'RN-602', 'RN-603', 'RN-604', 'RN-607', 'RN-613'],
  exemplos: ['Quero validar uma fatura', 'Regista esta fatura do C-2026-001'],
  async executar(p, e) {
    let numero = p.contratoNumero;
    let descricao = '';
    if (numero !== undefined) {
      try {
        const c = await contratoDe(numero, e);
        numero = c.numero;
        descricao = ` do contrato ${c.numero} (${c.prestador.nome})`;
      } catch { /* o ecrã resolve e sinaliza; não vale a pena travar aqui */ }
    }
    return {
      texto: `Registo de fatura${descricao}. Confirme os campos e siga a conferência aqui mesmo.`,
      ui: {
        ecra: 'FATURACAO', titulo: 'Registar e conferir fatura',
        props: {
          numeroContrato: numero ?? '',
          numero: p.numeroFatura ?? '',
          nifPrestador: p.nifPrestador ?? '',
          montanteSemIva: p.montanteSemIvaEuros !== undefined ? String(p.montanteSemIvaEuros) : '',
        },
      },
      fontes: [F('REGRA', 'RN-613 — a fatura identifica o contrato e o prestador')],
    };
  },
};
