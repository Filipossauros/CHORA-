import { preverContrato, complementaresAcumulados, valorLegal, diasEntre } from '@chora/domain';
import type { Contexto } from '../contexto.js';
import type { TipoEntidade } from './tipos.js';
import { ServicoAlertas } from '../servicos/alertas.js';

/**
 * ENRIQUECIMENTOS — as colunas que se podem acrescentar a uma tabela.
 *
 * É uma lista FECHADA, e é isso que mantém a composição determinística. Não é
 * «acrescenta o que quiseres»: é escolher um bloco com nome, colunas fixas e um
 * cálculo próprio. O que se pede ao assistente é o nome do bloco; os números
 * vêm dos mesmos cálculos do domínio que alimentam os ecrãs.
 *
 * Cada enriquecimento declara o TIPO DE ENTIDADE a que se aplica. Pedir a
 * execução de contratos a uma tabela de faturas não é um erro a tratar mais à
 * frente: é uma junção que não existe, e o assistente diz isso.
 */

export interface Enriquecimento {
  nome: string;
  titulo: string;
  descricao: string;
  tipoEntidade: TipoEntidade;
  colunas: string[];
  /** Termos que o encaminhamento reconhece para pedir este bloco. */
  termos: string[];
  /** Valores por identificador; a ordem segue `colunas`. */
  calcular(ids: string[], ctx: Contexto, hoje: string): Promise<Map<string, Array<string | number>>>;
}

const euros = (c: number): number => +(c / 100).toFixed(2);
const horas = (min: number): number => Math.round(min / 60);
const vazio = (n: number): Array<string | number> => Array.from({ length: n }, () => '—');

const execucao: Enriquecimento = {
  nome: 'execucao',
  titulo: 'Execução atual',
  descricao: 'Valor contratado, executado, percentagem de consumo e o que falta executar.',
  tipoEntidade: 'CONTRATO',
  colunas: ['Contratado', 'Executado', 'Consumo', 'Por executar'],
  termos: ['consumo', 'consumos', 'execucao', 'executado', 'gasto', 'gastos'],
  async calcular(ids, ctx) {
    const contratos = await ctx.repos.contratos.todos((c) => ids.includes(c.id));
    const aprovados = await ctx.repos.registosTempo.todos((r) => ids.includes(r.contratoId) && r.estado === 'APROVADO');
    const out = new Map<string, Array<string | number>>();
    for (const c of contratos) {
      const executado = aprovados.filter((r) => r.contratoId === c.id).reduce((s, r) => s + r.valorImputado, 0);
      const pct = c.precoContratualAtual > 0 ? Math.round((executado / c.precoContratualAtual) * 100) : 0;
      out.set(c.id, [euros(c.precoContratualAtual), euros(executado), `${pct}%`, euros(Math.max(0, c.precoContratualAtual - executado))]);
    }
    return out;
  },
};

const vigencia: Enriquecimento = {
  nome: 'vigencia',
  titulo: 'Vigência',
  descricao: 'Início, término e dias que faltam até ao fim do contrato.',
  tipoEntidade: 'CONTRATO',
  colunas: ['Início', 'Término', 'Dias até ao fim'],
  termos: ['vigencia', 'prazo', 'prazos', 'datas', 'termino'],
  async calcular(ids, ctx, hoje) {
    const contratos = await ctx.repos.contratos.todos((c) => ids.includes(c.id));
    return new Map(contratos.map((c) => [
      c.id,
      [c.dataInicioVigencia, c.dataTerminoContratual, Math.max(0, diasEntre(hoje, c.dataTerminoContratual))],
    ]));
  },
};

const ritmo: Enriquecimento = {
  nome: 'ritmo',
  titulo: 'Ritmo e projeção',
  descricao: 'Ritmo de execução recente e o que sobra por executar no término, à luz desse ritmo.',
  tipoEntidade: 'CONTRATO',
  colunas: ['Ritmo (€/dia)', 'Execução projetada', 'Sobra no término'],
  termos: ['ritmo', 'projecao', 'projetado', 'previsao'],
  async calcular(ids, ctx, hoje) {
    const contratos = await ctx.repos.contratos.todos((c) => ids.includes(c.id));
    const aprovados = await ctx.repos.registosTempo.todos((r) => ids.includes(r.contratoId) && r.estado === 'APROVADO');
    return new Map(contratos.map((c) => {
      const p = preverContrato(c, aprovados.filter((r) => r.contratoId === c.id), hoje);
      return [c.id, [euros(Math.round(p.ritmoValorDia)), `${Math.round(p.execucaoProjetadaPct * 100)}%`, euros(p.gapNoTermino)]];
    }));
  },
};

const decisoes: Enriquecimento = {
  nome: 'decisoes',
  titulo: 'Decisões pendentes',
  descricao: 'Quantas decisões estão abertas e qual o prazo mais apertado.',
  tipoEntidade: 'CONTRATO',
  colunas: ['Decisões pendentes', 'Prazo mais curto', 'Dias'],
  termos: ['decisao', 'decisoes', 'alerta', 'alertas', 'pendencias'],
  async calcular(ids, ctx) {
    const pendentes = await new ServicoAlertas(ctx).pendentes();
    return new Map(ids.map((id) => {
      const suas = pendentes.filter((a) => a.contratoId === id);
      if (suas.length === 0) return [id, [0, '—', '—']];
      const proxima = [...suas].sort((a, b) => (a.diasParaLimite ?? 9e9) - (b.diasParaLimite ?? 9e9))[0]!;
      return [id, [suas.length, proxima.dataLimiteAcao ?? '—', proxima.diasParaLimite ?? '—']];
    }));
  },
};

const faturacao: Enriquecimento = {
  nome: 'faturacao',
  titulo: 'Faturação',
  descricao: 'Montante já validado em faturas e o que está por decidir.',
  tipoEntidade: 'CONTRATO',
  colunas: ['Faturado e validado', 'Faturas por decidir'],
  termos: ['fatura', 'faturas', 'faturacao', 'faturado'],
  async calcular(ids, ctx) {
    const faturas = await ctx.repos.faturas.todos((f) => ids.includes(f.contratoId));
    return new Map(ids.map((id) => {
      const suas = faturas.filter((f) => f.contratoId === id);
      const validado = suas.filter((f) => f.estado === 'VALIDADA').reduce((s, f) => s + (f.montanteAprovado ?? f.montanteSemIva), 0);
      const abertas = suas.filter((f) => f.estado !== 'VALIDADA' && f.estado !== 'INVALIDADA').length;
      return [id, [euros(validado), abertas]];
    }));
  },
};

const equipa: Enriquecimento = {
  nome: 'equipa',
  titulo: 'Equipa afeta',
  descricao: 'Quantas pessoas estão afetas e quantos perfis ficaram por preencher.',
  tipoEntidade: 'CONTRATO',
  colunas: ['Pessoas afetas', 'Perfis sem ninguém'],
  termos: ['equipa', 'pessoas', 'afetacoes', 'afetos', 'quem'],
  async calcular(ids, ctx) {
    const [afetacoes, perfis] = await Promise.all([
      ctx.repos.afetacoes.todos((a) => ids.includes(a.contratoId) && a.ativa),
      ctx.repos.perfis.todos((p) => ids.includes(p.contratoId)),
    ]);
    return new Map(ids.map((id) => {
      const dos = perfis.filter((p) => p.contratoId === id);
      const semGente = dos.filter((p) => !afetacoes.some((a) => a.perfilId === p.id)).length;
      return [id, [afetacoes.filter((a) => a.contratoId === id).length, semGente]];
    }));
  },
};

const complementares: Enriquecimento = {
  nome: 'complementares',
  titulo: 'Trabalhos complementares',
  descricao: 'Complementares acumulados, percentagem do preço inicial e margem até ao teto legal.',
  tipoEntidade: 'CONTRATO',
  colunas: ['Complementares', '% do inicial', 'Margem até ao teto'],
  termos: ['complementar', 'complementares'],
  async calcular(ids, ctx) {
    const contratos = await ctx.repos.contratos.todos((c) => ids.includes(c.id));
    const alteracoes = await ctx.repos.alteracoes.todos((a) => ids.includes(a.contratoId));
    const pct = valorLegal('COMPLEMENTARES_MAX_PCT', 0.5);
    return new Map(contratos.map((c) => {
      const acumulado = complementaresAcumulados(alteracoes.filter((a) => a.contratoId === c.id));
      const teto = Math.floor(c.precoContratualInicial * pct);
      const racio = c.precoContratualInicial > 0 ? Math.round((acumulado / c.precoContratualInicial) * 100) : 0;
      return [c.id, [euros(acumulado), `${racio}%`, euros(Math.max(0, teto - acumulado))]];
    }));
  },
};

const projetos: Enriquecimento = {
  nome: 'projetos',
  titulo: 'Projetos',
  descricao: 'Projetos a que o contrato está associado.',
  tipoEntidade: 'CONTRATO',
  colunas: ['Projetos'],
  termos: ['projeto', 'projetos'],
  async calcular(ids, ctx) {
    const [associacoes, todos] = await Promise.all([
      ctx.repos.contratoProjetos.todos((a) => ids.includes(a.contratoId)),
      ctx.repos.projetos.todos(),
    ]);
    return new Map(ids.map((id) => {
      const nomes = associacoes.filter((a) => a.contratoId === id)
        .map((a) => todos.find((p) => p.id === a.projetoId)?.nome ?? a.projetoId);
      return [id, [nomes.join(', ') || '—']];
    }));
  },
};

const afetacoesPessoa: Enriquecimento = {
  nome: 'afetacoes',
  titulo: 'Afetações e horas',
  descricao: 'Contratos ativos de cada pessoa e horas aprovadas no total.',
  tipoEntidade: 'PESSOA',
  colunas: ['Contratos ativos', 'Horas aprovadas'],
  termos: ['afetacoes', 'contratos', 'horas', 'consumo', 'consumos'],
  async calcular(ids, ctx) {
    const [afetacoes, registos] = await Promise.all([
      ctx.repos.afetacoes.todos((a) => ids.includes(a.recursoId) && a.ativa),
      ctx.repos.registosTempo.todos((r) => ids.includes(r.recursoId) && r.estado === 'APROVADO'),
    ]);
    return new Map(ids.map((id) => [
      id,
      [
        new Set(afetacoes.filter((a) => a.recursoId === id).map((a) => a.contratoId)).size,
        horas(registos.filter((r) => r.recursoId === id).reduce((s, r) => s + r.duracao, 0)),
      ],
    ]));
  },
};

export const ENRIQUECIMENTOS: ReadonlyArray<Enriquecimento> = [
  execucao, vigencia, ritmo, decisoes, faturacao, equipa, complementares, projetos, afetacoesPessoa,
];

/** Enriquecimentos aplicáveis a um tipo de entidade. */
export function enriquecimentosPara(tipo: TipoEntidade): Enriquecimento[] {
  return ENRIQUECIMENTOS.filter((e) => e.tipoEntidade === tipo);
}

/**
 * Encontra o enriquecimento pedido: pelo nome exato, ou pelos termos ditos na
 * frase. Restringe-se ao tipo de entidade da tabela — pedir «consumos» a uma
 * tabela de pessoas dá o bloco das pessoas, não o dos contratos.
 */
export function enriquecimentoPedido(texto: string, tipo: TipoEntidade): Enriquecimento | undefined {
  const t = texto.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const candidatos = enriquecimentosPara(tipo);
  return candidatos.find((e) => e.nome === t)
    ?? candidatos.find((e) => e.termos.some((termo) => t.includes(termo)));
}

/** Linha de valores vazios, para as entidades sem dados no bloco pedido. */
export const semDados = (e: Enriquecimento): Array<string | number> => vazio(e.colunas.length);
