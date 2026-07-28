import { z } from 'zod';
import type { Capacidade, ContextoExecucao, ResultadoCapacidade, TabelaTrabalho } from '../tipos.js';
import { ErroEsclarecimento } from '../erros.js';
import { enriquecimentoPedido, enriquecimentosPara, semDados } from '../enriquecimentos.js';
import { ServicoRelatoriosAdHoc } from '../../servicos/relatorios-adhoc.js';
import { periodoERelativo } from '../tempo.js';
import { F } from './comum.js';

/**
 * TABELA DE TRABALHO — compor a resposta em vez de a receber feita.
 *
 * A pergunta que a aplicação nunca soube responder não é uma pergunta difícil:
 * é a junção de duas fáceis. «Que contratos comportam um perfil a 40 €/h» tem
 * resposta; «e quanto já consumiram» também tem; o que faltava era poder pedir
 * a segunda **sobre** a primeira. Estas funções fazem isso — e fazem-no sobre
 * identificadores, nunca sobre texto, porque cruzar listas por nome é como se
 * constroem relatórios errados com ar de certos.
 *
 * A composição é fechada dos dois lados: as colunas que se podem acrescentar
 * vêm de um catálogo (`enriquecimentos.ts`) e os cálculos são os mesmos que
 * alimentam os ecrãs. Não há aqui nada que o assistente invente.
 */

const norm = (t: string): string => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
const rotulos = (t: TabelaTrabalho): string[] => t.colunas;

/** A tabela em curso, ou uma resposta que explica como se começa uma. */
function tabelaDe(e: ContextoExecucao): TabelaTrabalho | undefined {
  return e.conversa.tabela;
}

const SEM_TABELA: ResultadoCapacidade = {
  texto:
    'Ainda não há nenhuma lista em cima da mesa. Comece por uma pergunta que devolva uma — que contratos comportam um ' +
    'perfil a um dado preço/hora, quais estão em risco, quais terminam este ano — e depois acrescente-lhe colunas, ' +
    'filtre-a, ordene-a e leve-a para uma folha de cálculo.',
  fontes: [],
  semResultado: true,
  proximos: [
    { rotulo: 'Contratos com folga a 40 €/h', frase: 'Que contratos comportam um perfil a 40 euros por hora?' },
    { rotulo: 'Contratos em risco', frase: 'Que contratos estão em risco?' },
    { rotulo: 'Contratos a terminar', frase: 'Que contratos terminam este ano?' },
  ],
};

/** Índice da coluna referida, ou uma pergunta com as colunas todas. */
function colunaDe(referencia: string | undefined, t: TabelaTrabalho, verbo: string): number {
  const opcoes = rotulos(t).map((c) => ({ rotulo: c, parametros: { coluna: c } }));
  if (referencia === undefined || referencia.trim() === '') {
    throw new ErroEsclarecimento(`Que coluna quer ${verbo}?`, opcoes);
  }
  const alvo = norm(referencia);
  const exata = t.colunas.findIndex((c) => norm(c) === alvo);
  if (exata >= 0) return exata;
  const parcial = t.colunas.findIndex((c) => norm(c).includes(alvo) || alvo.includes(norm(c)));
  if (parcial >= 0) return parcial;
  throw new ErroEsclarecimento(`A lista não tem coluna «${referencia}». Qual destas?`, opcoes);
}

/**
 * Valor de uma célula como número. Aceita o que as tabelas escrevem — «12%»,
 * «1 234,56», «45.5» — e devolve `undefined` no que não é número, que é o sinal
 * de que aquela coluna não se compara por grandeza.
 */
function numero(v: string | number): number | undefined {
  if (typeof v === 'number') return v;
  const limpo = v.replace(/[\s €%]/g, '').replace(/\.(?=\d{3}\b)/g, '').replace(',', '.');
  const n = Number(limpo);
  return limpo !== '' && Number.isFinite(n) ? n : undefined;
}

/** Reconstrói a tabela mantendo chaves e proveniência alinhadas com as linhas. */
function comLinhas(t: TabelaTrabalho, indices: number[], passo: TabelaTrabalho['origem'][number]): TabelaTrabalho {
  return {
    ...t,
    linhas: indices.map((i) => t.linhas[i]!),
    ...(t.chaves !== undefined ? { chaves: indices.map((i) => t.chaves![i]!) } : {}),
    origem: [...t.origem, passo],
  };
}

// ─── ACRESCENTAR COLUNAS ────────────────────────────────────────────────────

const zAcrescentar = z.object({ bloco: z.string().optional() });

export const acrescentarColunas: Capacidade<z.infer<typeof zAcrescentar>> = {
  nome: 'tabela.acrescentar',
  titulo: 'Acrescentar colunas à lista em curso',
  descricao:
    'Junta à última lista um bloco de colunas calculadas — execução, vigência, ritmo, decisões, faturação, equipa, ' +
    'complementares ou projetos. A junção faz-se por identificador, não por nome.',
  tipo: 'CONSULTA',
  gereTabela: true,
  parametros: zAcrescentar,
  parametrosDescricao: [{
    nome: 'bloco', tipo: 'texto', obrigatorio: false,
    descricao: 'Bloco de colunas a juntar, ex.: consumos, vigência, decisões, faturação, equipa',
  }],
  regras: [],
  exemplos: ['Acrescenta os consumos atuais de cada contrato', 'Junta a essa lista a vigência'],
  async executar({ bloco }, e) {
    const t = tabelaDe(e);
    if (t === undefined) return SEM_TABELA;
    const disponiveis = enriquecimentosPara(t.tipoEntidade);
    const opcoes = disponiveis.map((x) => ({ rotulo: x.titulo, detalhe: x.descricao, parametros: { bloco: x.nome } }));

    if (disponiveis.length === 0) {
      return {
        texto: `Não há colunas para acrescentar a uma lista de ${t.tipoEntidade.toLowerCase()}s.`,
        fontes: [], semResultado: true,
      };
    }
    if (bloco === undefined || bloco.trim() === '') {
      throw new ErroEsclarecimento(`O que quer juntar a «${t.titulo}»?`, opcoes);
    }
    const enr = enriquecimentoPedido(bloco, t.tipoEntidade);
    if (enr === undefined) {
      throw new ErroEsclarecimento(`Não sei calcular «${bloco}» para esta lista. Destes, qual?`, opcoes);
    }
    if (t.chaves === undefined) {
      return {
        texto: `A lista «${t.titulo}» não identifica as entidades de cada linha, pelo que não lhe posso juntar colunas com segurança. Refaça a pergunta que a gerou.`,
        fontes: [], semResultado: true,
      };
    }
    const novas = enr.colunas.filter((c) => !t.colunas.includes(c));
    if (novas.length === 0) {
      return { texto: `A lista já tem as colunas de «${enr.titulo}».`, tabela: t, fontes: [] };
    }

    const ids = t.chaves.map((k) => k.id);
    const valores = await enr.calcular(ids, e.ctx, e.hoje);
    const vazia = semDados(enr);
    const nova: TabelaTrabalho = {
      ...t,
      colunas: [...t.colunas, ...enr.colunas],
      linhas: t.linhas.map((l, i) => [...l, ...(valores.get(ids[i]!) ?? vazia)]),
      origem: [...t.origem, { frase: `+ ${enr.titulo}`, capacidade: 'tabela.acrescentar', parametros: { bloco: enr.nome } }],
    };
    e.lembrar({ tabela: nova });
    const semValor = t.linhas.filter((_l, i) => valores.get(ids[i]!) === undefined).length;

    return {
      texto:
        `«${enr.titulo}» acrescentado a «${t.titulo}»: ${enr.colunas.length} coluna(s) novas em ${nova.linhas.length} linha(s).` +
        (semValor > 0 ? ` ${semValor} linha(s) ficaram sem valor — não há dados para essas entidades.` : '') +
        ' A lista fica em cima da mesa: pode filtrá-la, ordená-la, exportá-la ou guardá-la nos relatórios.',
      tabela: nova,
      fontes: [F('REGRA', `Enriquecimento «${enr.nome}» — ${enr.descricao}`)],
      proximos: [
        { rotulo: 'Exportar para Excel', frase: 'Exporta esta lista para Excel' },
        { rotulo: 'Guardar nos relatórios', frase: 'Guarda esta lista nos relatórios' },
      ],
    };
  },
};

// ─── FILTRAR ────────────────────────────────────────────────────────────────

const zFiltrar = z.object({
  coluna: z.string().optional(),
  minimo: z.number().optional(),
  maximo: z.number().optional(),
  contem: z.string().optional(),
});

export const filtrarTabela: Capacidade<z.infer<typeof zFiltrar>> = {
  nome: 'tabela.filtrar',
  titulo: 'Filtrar a lista em curso',
  descricao: 'Fica só com as linhas que cumprem um critério numa coluna: acima de, abaixo de, ou que contenha um texto.',
  tipo: 'CONSULTA',
  gereTabela: true,
  parametros: zFiltrar,
  parametrosDescricao: [
    { nome: 'coluna', tipo: 'texto', obrigatorio: false, descricao: 'Coluna sobre a qual filtrar' },
    { nome: 'minimo', tipo: 'número', obrigatorio: false, descricao: 'Fica com as linhas de valor igual ou superior' },
    { nome: 'maximo', tipo: 'número', obrigatorio: false, descricao: 'Fica com as linhas de valor igual ou inferior' },
    { nome: 'contem', tipo: 'texto', obrigatorio: false, descricao: 'Fica com as linhas cuja coluna contenha este texto' },
  ],
  regras: [],
  exemplos: ['Fica só com as linhas em que o consumo é superior a 50', 'Filtra a lista pelas que contêm Alfa'],
  async executar(p, e) {
    const t = tabelaDe(e);
    if (t === undefined) return SEM_TABELA;
    if (p.minimo === undefined && p.maximo === undefined && (p.contem === undefined || p.contem.trim() === '')) {
      throw new ErroEsclarecimento(
        'Que critério quer aplicar? Diga, por exemplo, «fica só com as que têm mais de 100 000 por executar».',
        rotulos(t).map((c) => ({ rotulo: `Ordenar por ${c}`, parametros: { coluna: c } })),
      );
    }
    const idx = colunaDe(p.coluna, t, 'filtrar');
    const criterio =
      p.contem !== undefined && p.contem.trim() !== ''
        ? (v: string | number): boolean => norm(String(v)).includes(norm(p.contem!))
        : (v: string | number): boolean => {
          const n = numero(v);
          if (n === undefined) return false;
          return (p.minimo === undefined || n >= p.minimo) && (p.maximo === undefined || n <= p.maximo);
        };

    const descricao =
      p.contem !== undefined && p.contem.trim() !== ''
        ? `contém «${p.contem}»`
        : [p.minimo !== undefined ? `≥ ${p.minimo}` : '', p.maximo !== undefined ? `≤ ${p.maximo}` : ''].filter(Boolean).join(' e ');

    const indices = t.linhas.map((_l, i) => i).filter((i) => criterio(t.linhas[i]![idx]!));
    if (indices.length === 0) {
      return {
        texto: `Nenhuma linha de «${t.titulo}» tem ${t.colunas[idx]} ${descricao}. A lista fica como estava.`,
        tabela: t, fontes: [], semResultado: true,
      };
    }
    const nova = comLinhas(t, indices, {
      frase: `filtro: ${t.colunas[idx]} ${descricao}`, capacidade: 'tabela.filtrar',
      // Guarda-se a coluna pelo rótulo que ela tem AGORA. Se um bloco lhe mudar
      // o nome, a execução seguinte diz que o passo se partiu — melhor do que
      // filtrar silenciosamente pela coluna errada.
      parametros: { coluna: t.colunas[idx]!, ...(p.contem !== undefined ? { contem: p.contem } : {}), ...(p.minimo !== undefined ? { minimo: p.minimo } : {}), ...(p.maximo !== undefined ? { maximo: p.maximo } : {}) },
    });
    e.lembrar({ tabela: nova });
    return {
      texto: `${indices.length} de ${t.linhas.length} linha(s) têm ${t.colunas[idx]} ${descricao}.`,
      tabela: nova,
      fontes: [F('REGRA', 'Filtro aplicado à lista em curso')],
      proximos: [{ rotulo: 'Exportar para Excel', frase: 'Exporta esta lista para Excel' }],
    };
  },
};

// ─── ORDENAR ────────────────────────────────────────────────────────────────

const zOrdenar = z.object({ coluna: z.string().optional(), ascendente: z.boolean().optional() });

export const ordenarTabela: Capacidade<z.infer<typeof zOrdenar>> = {
  nome: 'tabela.ordenar',
  titulo: 'Ordenar a lista em curso',
  descricao: 'Ordena as linhas por uma coluna, do maior para o menor por omissão.',
  tipo: 'CONSULTA',
  gereTabela: true,
  parametros: zOrdenar,
  parametrosDescricao: [
    { nome: 'coluna', tipo: 'texto', obrigatorio: false, descricao: 'Coluna pela qual ordenar' },
    { nome: 'ascendente', tipo: 'booleano', obrigatorio: false, descricao: 'Do menor para o maior; por omissão é o contrário' },
  ],
  regras: [],
  exemplos: ['Ordena a lista pelo valor por executar', 'Ordena por consumo, do menor para o maior'],
  async executar(p, e) {
    const t = tabelaDe(e);
    if (t === undefined) return SEM_TABELA;
    const idx = colunaDe(p.coluna, t, 'ordenar');
    const sentido = p.ascendente === true ? 1 : -1;
    const indices = t.linhas.map((_l, i) => i).sort((a, b) => {
      const va = t.linhas[a]![idx]!;
      const vb = t.linhas[b]![idx]!;
      const na = numero(va);
      const nb = numero(vb);
      if (na !== undefined && nb !== undefined) return (na - nb) * sentido;
      return String(va).localeCompare(String(vb), 'pt-PT') * sentido;
    });
    const nova = comLinhas(t, indices, {
      frase: `ordem: ${t.colunas[idx]} ${p.ascendente === true ? 'crescente' : 'decrescente'}`,
      capacidade: 'tabela.ordenar',
      parametros: { coluna: t.colunas[idx]!, ...(p.ascendente === true ? { ascendente: true } : {}) },
    });
    e.lembrar({ tabela: nova });
    return {
      texto: `Lista ordenada por ${t.colunas[idx]}, do ${p.ascendente === true ? 'menor para o maior' : 'maior para o menor'}.`,
      tabela: nova,
      fontes: [F('REGRA', 'Ordenação aplicada à lista em curso')],
    };
  },
};

// ─── EXPORTAR ───────────────────────────────────────────────────────────────

export const exportarTabela: Capacidade<Record<string, never>> = {
  nome: 'tabela.exportar',
  titulo: 'Exportar a lista em curso para Excel',
  descricao: 'Gera uma folha de cálculo com os dados e uma segunda folha com as perguntas que a construíram.',
  tipo: 'CONSULTA',
  gereTabela: true,
  parametros: z.object({}),
  parametrosDescricao: [],
  regras: [],
  exemplos: ['Exporta esta lista para Excel', 'Descarrega a tabela'],
  async executar(_p, e) {
    const t = tabelaDe(e);
    if (t === undefined) return SEM_TABELA;
    return {
      texto:
        `«${t.titulo}» — ${t.linhas.length} linha(s) e ${t.colunas.length} coluna(s), prontas a descarregar. ` +
        'A folha de cálculo leva uma segunda página com as perguntas que construíram a lista: quem a abrir daqui a três ' +
        'meses precisa de saber de onde vieram os números.',
      tabela: t,
      exportavel: { nome: ficheiro(t.titulo), folhas: folhasDe(t, { executadoEm: new Date(e.ctx.relogio.agora()).toISOString(), executadoPor: e.utilizador.utilizadorId }) },
      fontes: [F('REGRA', 'Lista composta na conversa')],
      proximos: [{ rotulo: 'Guardar nos relatórios', frase: 'Guarda esta lista nos relatórios' }],
    };
  },
};

/**
 * As duas folhas: os dados e a receita.
 *
 * O ficheiro é que passa a ser o retrato — o relatório guardado na aplicação
 * responde sempre com os números de hoje. Um Excel numa pasta partilhada tem de
 * se explicar sozinho daqui a um ano: leva por isso a data em que correu, quem
 * o correu e os passos que o produziram.
 */
export function folhasDe(
  t: TabelaTrabalho, contexto: { executadoEm: string; executadoPor: string; periodo?: string },
): Array<{ nome: string; linhas: Array<Record<string, string | number>> }> {
  return [
    {
      nome: 'Dados',
      linhas: t.linhas.map((l) => Object.fromEntries(t.colunas.map((c, i) => [c, l[i] ?? '']))),
    },
    {
      nome: 'Receita',
      linhas: [
        { '#': '', 'Passo': `«${t.titulo}» — ${t.linhas.length} linha(s)`, 'Função': '', 'Parâmetros': '' },
        { '#': '', 'Passo': `Executado em ${contexto.executadoEm.slice(0, 16).replace('T', ' ')} por ${contexto.executadoPor}`, 'Função': '', 'Parâmetros': '' },
        ...(contexto.periodo !== undefined ? [{ '#': '', 'Passo': `Período: ${contexto.periodo}`, 'Função': '', 'Parâmetros': '' }] : []),
        ...t.origem.map((o, i) => ({
          '#': i + 1, 'Passo': o.frase, 'Função': o.capacidade,
          'Parâmetros': Object.entries(o.parametros).map(([k, v]) => `${k}=${String(v)}`).join(' · '),
        })),
      ],
    },
  ];
}

export const ficheiro = (titulo: string): string =>
  norm(titulo).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'lista';

// ─── GUARDAR NOS RELATÓRIOS ─────────────────────────────────────────────────

const zGuardar = z.object({ titulo: z.string().optional() });

export const guardarTabela: Capacidade<z.infer<typeof zGuardar>> = {
  nome: 'tabela.guardar',
  titulo: 'Guardar a lista nos relatórios',
  descricao:
    'Guarda a lista em curso como relatório reutilizável no separador «Relatórios». Fica a RECEITA — as perguntas e os ' +
    'seus parâmetros —, pelo que executá-la outra vez responde com os números desse dia. O retrato de hoje é o Excel.',
  tipo: 'ACAO',
  gereTabela: true,
  // Criar um relatório da unidade é ato de quem a gere: a definição fica
  // visível a todos e responde por quem a guardou. Executá-la, essa, é livre —
  // cada passo torna a passar pelas permissões de quem abre.
  operacao: 'gerir.contratos',
  parametros: zGuardar,
  parametrosDescricao: [{ nome: 'titulo', tipo: 'texto', obrigatorio: false, descricao: 'Nome com que fica arquivada' }],
  regras: [],
  exemplos: ['Guarda esta lista nos relatórios', 'Arquiva esta tabela nos relatórios'],
  async executar({ titulo }, e) {
    const t = tabelaDe(e);
    if (t === undefined) return SEM_TABELA;
    const nome = titulo !== undefined && titulo.trim() !== '' ? titulo.trim() : t.titulo;
    const primeira = t.origem[0];
    const relativo = primeira !== undefined && periodoERelativo(primeira.frase, e.hoje);

    const relatorio = await new ServicoRelatoriosAdHoc(e.ctx).guardar({
      titulo: nome, tipoEntidade: t.tipoEntidade, periodoRelativo: relativo,
      passos: t.origem.map((o) => ({ capacidade: o.capacidade, parametros: o.parametros, frase: o.frase })),
    }, e.utilizador);

    return {
      texto:
        `«${nome}» guardado nos relatórios, em ${t.origem.length} passo(s). Não ficaram os números de hoje: ficou a ` +
        'pergunta — executá-lo outra vez responde com os dados desse dia. Para congelar este retrato, descarregue o Excel.' +
        (relativo
          ? ' O período é relativo à data de execução, pelo que o relatório acompanha o calendário; pode fixá-lo no próprio relatório.'
          : ''),
      tabela: t,
      fontes: [F('REGRA', `Relatório ${relatorio.id} — receita de ${relatorio.passos.length} passo(s)`)],
    };
  },
};
