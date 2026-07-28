import type { z } from 'zod';
import type { FonteResposta, PapelAplicacional } from '@chora/domain';
import type { Contexto } from '../contexto.js';
import type { ContextoUtilizador } from '../auth/token-validator.js';

/**
 * CATÁLOGO DE CAPACIDADES — a única superfície por onde o assistente toca na
 * aplicação.
 *
 * O princípio que sustenta tudo o resto: **o modelo encaminha e narra; as regras
 * decidem; os cálculos calculam.** Um modelo local de poucos milhares de
 * milhões de parâmetros erra contas, datas e limites legais — e erra-os com
 * confiança. Por isso não lhe é dado escrever números nem juízos: é-lhe dado
 * escolher uma função de uma lista fechada e preencher-lhe os parâmetros, que
 * são validados por esquema antes de qualquer execução.
 *
 * Daí decorrem três garantias:
 *
 *  1. **Lista fechada.** Um nome de capacidade que não exista, ou um parâmetro
 *     fora do esquema, é rejeitado sem executar nada. Não há prompt que faça o
 *     assistente chamar o que não está aqui.
 *  2. **Mesmo caminho da UI.** `executar` invoca os mesmos serviços que os
 *     botões dos ecrãs, com os mesmos `exigir(RN_xxx)`. Não existe código onde
 *     contornar uma regra, logo o assistente não a pode contornar.
 *  3. **Implicações calculadas.** As ações trazem `simular`, que avalia as
 *     regras em seco e descreve os efeitos a partir dos cálculos. O «isto
 *     implica tal e tal» é apurado, não redigido por um modelo.
 */

/** Consultas leem; ações escrevem — e só as ações passam por confirmação. */
export type TipoCapacidade = 'CONSULTA' | 'ACAO';

/** Avaliação de uma regra em seco, antes de executar. */
export interface RegraAvaliada {
  codigo: string;
  descricao: string;
  ok: boolean;
  mensagem?: string;
}

/**
 * O que vai acontecer se a ação for confirmada. Cada efeito sai de uma função
 * determinística; cada regra de uma avaliação real de `Regra.avaliar()`.
 */
export interface Simulacao {
  titulo: string;
  /** Antes/depois, em linguagem de gestão. */
  efeitos: string[];
  regras: RegraAvaliada[];
  avisos: string[];
  /** Alguma regra bloqueante falhou: a confirmação não é oferecida. */
  bloqueada: boolean;
}

/**
 * Entidade a que uma linha de tabela respeita. É o que permite JUNTAR o
 * resultado de duas perguntas: a junção faz-se por identificador, nunca por
 * texto — cruzar tabelas por nome é como se constroem relatórios errados.
 */
export type TipoEntidade = 'CONTRATO' | 'PESSOA' | 'PERFIL' | 'PROJETO' | 'FATURA' | 'ENTREGAVEL';
export interface ChaveLinha { tipo: TipoEntidade; id: string }

/** Tabela apresentada no chat e exportável para folha de cálculo. */
export interface TabelaResposta {
  titulo: string;
  colunas: string[];
  linhas: Array<Array<string | number>>;
  /**
   * Uma chave por linha, na mesma ordem. Não se apresenta: serve para
   * acrescentar colunas a partir de outra pergunta. Sem chaves, a tabela é só
   * de leitura — o assistente diz isso em vez de juntar às cegas.
   */
  chaves?: ChaveLinha[];
}

/**
 * TABELA DE TRABALHO — o resultado que sobrevive entre perguntas.
 *
 * Uma pergunta produz a lista, a seguinte acrescenta-lhe colunas, uma terceira
 * filtra-a, e no fim exporta-se. Sem isto, cada resposta era um beco: bonita de
 * ler e impossível de compor.
 */
export interface TabelaTrabalho extends TabelaResposta {
  tipoEntidade: TipoEntidade;
  /** Perguntas e capacidades que a construíram, por ordem. É a proveniência. */
  origem: Array<{ frase: string; capacidade: string }>;
}

/** Ecrã real a embeber na conversa, com valores iniciais. */
export interface UiEmbebida {
  ecra: 'FATURACAO' | 'AFETACOES' | 'MODIFICACOES';
  titulo: string;
  props: Record<string, unknown>;
}

/** Folha de cálculo a gerar no cliente (o domínio não escreve ficheiros). */
export interface Exportavel {
  nome: string;
  folhas: Array<{ nome: string; linhas: Array<Record<string, string | number>> }>;
}

export interface ResultadoCapacidade {
  texto: string;
  fontes: FonteResposta[];
  tabela?: TabelaResposta;
  exportavel?: Exportavel;
  ui?: UiEmbebida;
  /**
   * O que faz sentido perguntar ou fazer a seguir. Uma resposta que diz que um
   * contrato vai deixar 99 600 € por executar e não oferece prorrogá-lo obriga
   * quem lê a redescobrir sozinho o passo seguinte.
   */
  proximos?: Array<{ rotulo: string; frase: string }>;
  /** A capacidade correu mas não encontrou o que lhe pediram. */
  semResultado?: boolean;
}

/**
 * MEMÓRIA DA CONVERSA. Guarda as entidades já mencionadas para que «e a
 * vigência?» ou «e nesse?» funcionem — sem isto cada turno é independente, e um
 * chat que não segue o fio é uma caixa de pesquisa com passos a mais.
 */
export interface ContextoConversa {
  /** A lista em construção, transportada de turno em turno. */
  tabela?: TabelaTrabalho;
  contratoId?: string;
  contratoNumero?: string;
  projetoId?: string;
  projetoNome?: string;
  pessoaId?: string;
  pessoaNome?: string;
  perfilNome?: string;
  periodoDe?: string;
  periodoAte?: string;
}

export interface ContextoExecucao {
  ctx: Contexto;
  utilizador: ContextoUtilizador;
  hoje: string;
  /** Entidades já mencionadas na conversa; as capacidades podem consultá-las. */
  conversa: ContextoConversa;
  /** Atualiza a memória da conversa com o que esta capacidade resolveu. */
  lembrar(patch: ContextoConversa): void;
}

export interface Capacidade<P = unknown> {
  nome: string;
  titulo: string;
  /** O que faz, em linguagem de gestão. Aparece no catálogo público. */
  descricao: string;
  tipo: TipoCapacidade;
  parametros: z.ZodType<P>;
  /** Descrição dos parâmetros para o catálogo e para o pedido ao modelo. */
  parametrosDescricao: Array<{ nome: string; tipo: string; obrigatorio: boolean; descricao: string }>;
  /** Operação da matriz de permissões que autoriza esta capacidade. */
  operacao?: import('../auth/permissoes.js').Operacao;
  /**
   * A capacidade gere ela própria a tabela de trabalho (acrescenta, filtra,
   * ordena). Sem isto, o serviço substituiria a lista em curso pela devolvida —
   * e a proveniência, que é o que distingue um relatório composto de uma tabela
   * caída do céu, perdia-se ao segundo passo.
   */
  gereTabela?: boolean;
  /** Regras de negócio avaliadas na execução. Vazio nas consultas. */
  regras: string[];
  /** Frases que a acionam — servem o router determinístico e o modelo. */
  exemplos: string[];
  simular?(p: P, e: ContextoExecucao): Promise<Simulacao>;
  executar(p: P, e: ContextoExecucao): Promise<ResultadoCapacidade>;
}

/** Vista pública de uma capacidade, para o ecrã «Regras e alertas». */
export interface CapacidadePublica {
  nome: string;
  titulo: string;
  descricao: string;
  tipo: TipoCapacidade;
  parametros: Array<{ nome: string; tipo: string; obrigatorio: boolean; descricao: string }>;
  regras: string[];
  exemplos: string[];
  papeis: PapelAplicacional[];
}
