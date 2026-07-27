import type { Contrato } from '../entidades/contrato.js';
import type { PerfilContratual } from '../entidades/estrutura.js';
import type { Entregavel } from '../entidades/entregavel.js';
import type { RegistoTempo } from '../entidades/registo-tempo.js';
import type { Cent, DataISO } from '../tipos/primitivos.js';
import type { TipologiaContrato } from '../enums/index.js';
import { LIMITE_ANUAL_PORTARIA_CA, RN_115 } from '../rules/contratos.js';
import { valorHoraVigente } from './preco-perfil.js';
import { calcularConsumoPerfil } from './consumo.js';

/**
 * ORÇAMENTAÇÃO DA UNIDADE — o que é preciso contratar no ano seguinte.
 *
 * A pergunta de setembro não é "a que ritmo está a execução"; é "que contratos
 * vou ter de ter em N+1 e quanto custam". A resposta não parte de uma folha em
 * branco: parte da carteira, porque quase tudo o que vai ser preciso no ano
 * seguinte é continuação, substituição ou renovação do que já existe. O que o
 * gestor acrescenta é o DELTA — mais uma pessoa aqui, menos vinte por cento
 * ali, um projeto novo — e é só isso que lhe deve ser pedido.
 *
 * A cobertura plurianual entra ao contrário do que parece: uma portaria de
 * extensão de encargos já aprovada para N+1 não é despesa a autorizar, é
 * despesa já autorizada. Distinguir «preciso de 1,8 M€» de «preciso de
 * autorizar 1,2 M€» é a diferença entre um orçamento e uma lista de desejos.
 */

/** Como a linha de orçamento nasceu da carteira atual. */
export type OrigemLinha =
  /** Contrato em vigor que atravessa o ano orçamentado. */
  | 'CONTINUIDADE'
  /** Contrato que termina antes ou durante o ano: exige novo procedimento. */
  | 'SUBSTITUICAO'
  /** Licenciamento cujo período de licenças acaba: exige renovação. */
  | 'RENOVACAO'
  /** Necessidade nova, sem contrato de origem. */
  | 'NOVO';

/** Sentido da variação de recursos pedida ao gestor, por linha. */
export type VariacaoRecursos = 'AUMENTO' | 'MANUTENCAO' | 'REDUCAO';

/** Perfil orçamentado: o que se consumiu, o que se propõe, e a que preço. */
export interface PerfilOrcamentado {
  perfilId?: string;
  nome: string;
  /** Minutos consumidos no ano de referência — a base a partir da qual se varia. */
  minutosReferencia: number;
  /** Minutos propostos para o ano orçamentado. */
  minutosPropostos: number;
  valorHora: Cent;
  /** minutosPropostos × valorHora. */
  valor: Cent;
}

/** Entregável orçamentado (chave-na-mão): valor e ano em que cai. */
export interface EntregavelOrcamentado {
  designacao: string;
  valor: Cent;
  ano: number;
}

/** Uma necessidade de contratação, por projeto. */
export interface LinhaOrcamento {
  id: string;
  projetoId: string;
  origem: OrigemLinha;
  /** Contrato de que descende, quando descende de algum. */
  contratoOrigemId?: string;
  contratoOrigemNumero?: string;
  tipologia: TipologiaContrato;
  designacao: string;
  /** Por que razão esta linha existe, em linguagem de gestão. */
  motivo: string;
  variacao: VariacaoRecursos;
  perfis: PerfilOrcamentado[];
  entregaveis: EntregavelOrcamentado[];
  /** Licenciamento: nº de licenças de referência e proposto. */
  licencas?: { referencia: number; propostas: number; valorUnitario: Cent };
  /** Encargo por ano civil. O ano orçamentado é o primeiro; os seguintes são plurianuais. */
  reparticaoAnual: Array<{ ano: number; montante: Cent }>;
  /** Encargo já coberto por portaria de extensão de encargos em vigor, por ano. */
  cobertoPorPortaria: Array<{ ano: number; montante: Cent }>;
}

/** Totais de um projeto no orçamento. */
export interface TotalProjeto {
  projetoId: string;
  linhas: LinhaOrcamento[];
  totalAnoOrcamentado: Cent;
  totalPlurianual: Cent;
}

/** Cobertura de um ano: o que é preciso, o que já está autorizado, o que falta. */
export interface CoberturaAno {
  ano: number;
  encargo: Cent;
  coberto: Cent;
  aCobrir: Cent;
  /** O encargo a autorizar neste ano excede a competência do CA? (RN-115) */
  excedeCompetenciaCA: boolean;
}

export interface ResumoOrcamento {
  ano: number;
  projetos: TotalProjeto[];
  cobertura: CoberturaAno[];
  total: Cent;
  totalACobrir: Cent;
  /** Anos futuros cujo encargo a autorizar excede o limite anual do CA. */
  anosAcimaDaCompetenciaCA: number[];
  limiteAnualCA: Cent;
}

const MINUTOS_ANO_FTE = 220 * 8 * 60; // 220 dias úteis × 8 h — um FTE a tempo inteiro

/** Minutos de um ano de trabalho a tempo inteiro; base das variações em FTE. */
export const MINUTOS_FTE_ANO = MINUTOS_ANO_FTE;

/**
 * Aplica uma variação percentual a uma quantidade de minutos, arredondando à
 * hora — orçamentar ao minuto é uma precisão que os pressupostos não têm.
 */
export function variarMinutos(minutos: number, percentagem: number): number {
  return Math.round((minutos * (1 + percentagem / 100)) / 60) * 60;
}

/**
 * Propõe as linhas de orçamento de um ano a partir da carteira.
 *
 * Cada contrato em vigor gera exatamente uma linha, classificada pela relação
 * entre a sua vigência e o ano orçamentado. Contratos sem projeto associado
 * caem numa linha de projeto vazio — melhor aparecerem por atribuir do que
 * desaparecerem do orçamento.
 */
export function proporOrcamento(
  ano: number,
  contratos: ReadonlyArray<Contrato>,
  perfis: ReadonlyArray<PerfilContratual>,
  aprovados: ReadonlyArray<RegistoTempo>,
  entregaveis: ReadonlyArray<Entregavel>,
  projetosDoContrato: (contratoId: string) => string[],
  hoje: DataISO,
): LinhaOrcamento[] {
  const linhas: LinhaOrcamento[] = [];
  const inicioAno = `${ano}-01-01` as DataISO;
  const fimAno = `${ano}-12-31` as DataISO;

  for (const contrato of contratos) {
    if (contrato.estado !== 'EM_VIGOR' && contrato.estado !== 'SUSPENSO') continue;
    // Um contrato que já terminou antes do ano orçamentado não é continuidade
    // nem substituição: é história. Quem o quiser repetir cria linha NOVO.
    if (contrato.dataTerminoContratual < inicioAno) continue;

    const tipologia = contrato.tipologia ?? 'BOLSA_HORAS';
    const projetos = projetosDoContrato(contrato.id);
    const projetoId = projetos[0] ?? 'sem-projeto';
    const cobre = contrato.dataTerminoContratual >= fimAno;

    const origem: OrigemLinha = tipologia === 'LICENCIAMENTO'
      ? 'RENOVACAO'
      : cobre ? 'CONTINUIDADE' : 'SUBSTITUICAO';

    const motivo = tipologia === 'LICENCIAMENTO'
      ? `As licenças cobrem até ${contrato.vigenciaLicenciamento?.ate ?? contrato.dataTerminoContratual}. Sem renovação, o direito de uso cessa nessa data.`
      : cobre
        ? `Contrato em execução até ${contrato.dataTerminoContratual}: mantém-se em ${ano}.`
        : `Contrato termina a ${contrato.dataTerminoContratual}, durante ${ano}: exige novo procedimento lançado em tempo útil.`;

    const perfisContrato = perfis.filter((p) => p.contratoId === contrato.id);
    const perfisOrcamentados: PerfilOrcamentado[] = perfisContrato.map((p) => {
      const consumo = calcularConsumoPerfil(p, aprovados.filter((r) => r.perfilId === p.id));
      // A referência é o consumo real do último ano; se não houve consumo, é o
      // previsto — orçamentar a zero um perfil que ainda não arrancou seria
      // apagá-lo do ano seguinte por não ter passado.
      const minutosReferencia = consumo.minutosConsumidos > 0 ? consumo.minutosConsumidos : p.quantidadePrevista;
      const valorHora = valorHoraVigente(p, hoje) ?? p.precos[p.precos.length - 1]?.valorHora ?? 0;
      return {
        perfilId: p.id, nome: p.nome,
        minutosReferencia, minutosPropostos: minutosReferencia,
        valorHora, valor: Math.round((minutosReferencia / 60) * valorHora),
      };
    });

    const entregaveisContrato = tipologia === 'CHAVE_NA_MAO'
      ? entregaveis.filter((e) => e.contratoId === contrato.id && !e.entregue)
        .map((e) => ({ designacao: e.designacao, valor: e.valor, ano }))
      : [];

    const linha: LinhaOrcamento = {
      id: `orc-${ano}-${contrato.id}`,
      projetoId, origem,
      contratoOrigemId: contrato.id, contratoOrigemNumero: contrato.numero,
      tipologia, designacao: contrato.objeto, motivo,
      variacao: 'MANUTENCAO',
      perfis: perfisOrcamentados,
      entregaveis: entregaveisContrato,
      ...(tipologia === 'LICENCIAMENTO'
        ? { licencas: { referencia: 1, propostas: 1, valorUnitario: contrato.precoContratualAtual } }
        : {}),
      reparticaoAnual: [],
      cobertoPorPortaria: (contrato.portariaExtensaoEncargos?.reparticaoAnual ?? [])
        .filter((r) => r.ano >= ano)
        .map((r) => ({ ano: r.ano, montante: r.montante })),
    };
    linhas.push(recalcularLinha(linha, ano));
  }

  return linhas;
}

/**
 * Recalcula os valores derivados de uma linha: o valor de cada perfil e a
 * repartição por ano. Sem entregáveis plurianuais, todo o encargo cai no ano
 * orçamentado; os entregáveis levam o ano que lhes foi atribuído.
 */
export function recalcularLinha(linha: LinhaOrcamento, ano: number): LinhaOrcamento {
  const perfis = linha.perfis.map((p) => ({ ...p, valor: Math.round((p.minutosPropostos / 60) * p.valorHora) }));
  const valorPerfis = perfis.reduce((s, p) => s + p.valor, 0);
  const valorLicencas = linha.licencas !== undefined
    ? linha.licencas.propostas * linha.licencas.valorUnitario
    : 0;

  const porAno = new Map<number, Cent>();
  const somar = (a: number, v: Cent): void => { porAno.set(a, (porAno.get(a) ?? 0) + v); };
  somar(ano, valorPerfis + valorLicencas);
  for (const e of linha.entregaveis) somar(e.ano, e.valor);

  return {
    ...linha, perfis,
    reparticaoAnual: [...porAno.entries()]
      .filter(([, m]) => m !== 0)
      .sort((a, b) => a[0] - b[0])
      .map(([a, montante]) => ({ ano: a, montante })),
  };
}

/** Total do encargo de uma linha, somando todos os anos. */
export function totalLinha(linha: LinhaOrcamento): Cent {
  return linha.reparticaoAnual.reduce((s, r) => s + r.montante, 0);
}

/**
 * Agrega o orçamento: totais por projeto e cobertura por ano.
 *
 * A cobertura cruza o encargo proposto com o que as portarias já aprovadas
 * autorizam, e passa cada ano futuro pela RN-115 — porque um ano acima do
 * limite muda o prazo de instrução em meses, e isso decide-se agora, não
 * quando o procedimento já está lançado.
 */
export function resumirOrcamento(ano: number, linhas: ReadonlyArray<LinhaOrcamento>): ResumoOrcamento {
  const projetosIds = [...new Set(linhas.map((l) => l.projetoId))].sort();
  const projetos: TotalProjeto[] = projetosIds.map((projetoId) => {
    const suas = linhas.filter((l) => l.projetoId === projetoId);
    return {
      projetoId, linhas: suas,
      totalAnoOrcamentado: suas.reduce((s, l) => s + (l.reparticaoAnual.find((r) => r.ano === ano)?.montante ?? 0), 0),
      totalPlurianual: suas.reduce((s, l) => s + l.reparticaoAnual.filter((r) => r.ano > ano).reduce((x, r) => x + r.montante, 0), 0),
    };
  });

  const anos = [...new Set(linhas.flatMap((l) => l.reparticaoAnual.map((r) => r.ano)))].sort((a, b) => a - b);
  const cobertura: CoberturaAno[] = anos.map((a) => {
    const encargo = linhas.reduce((s, l) => s + (l.reparticaoAnual.find((r) => r.ano === a)?.montante ?? 0), 0);
    const coberto = linhas.reduce((s, l) => s + (l.cobertoPorPortaria.find((r) => r.ano === a)?.montante ?? 0), 0);
    const aCobrir = Math.max(0, encargo - coberto);
    return {
      ano: a, encargo, coberto, aCobrir,
      // Só os anos FUTUROS são objeto da extensão de encargos: o ano orçamentado
      // tem cabimento próprio.
      excedeCompetenciaCA: a > ano && aCobrir > LIMITE_ANUAL_PORTARIA_CA,
    };
  });

  return {
    ano, projetos, cobertura,
    total: cobertura.reduce((s, c) => s + c.encargo, 0),
    totalACobrir: cobertura.reduce((s, c) => s + c.aCobrir, 0),
    anosAcimaDaCompetenciaCA: cobertura.filter((c) => c.excedeCompetenciaCA).map((c) => c.ano),
    limiteAnualCA: LIMITE_ANUAL_PORTARIA_CA,
  };
}

/**
 * Avalia a RN-115 sobre a repartição a autorizar de um orçamento — o mesmo
 * juízo que se faz a uma portaria concreta, antecipado para o planeamento.
 */
export function competenciaCA(ano: number, cobertura: ReadonlyArray<CoberturaAno>): ReturnType<typeof RN_115.avaliar> {
  return RN_115.avaliar({
    anoBase: ano,
    reparticaoAnual: cobertura.map((c) => ({ ano: c.ano, montante: c.aCobrir })),
  });
}
