import type { Contexto } from '../../contexto.js';
import { semear } from '../semear.js';
import { cenarioAssistente } from './assistente.js';
import { cenarioHoje } from './hoje.js';
import { cenarioFaturacao } from './faturacao.js';

/**
 * CATÁLOGO DE CENÁRIOS — que dados a aplicação tem carregados.
 *
 * O conjunto de dados servia até aqui dois patrões incompatíveis: cobrir todas
 * as regras (o que exige amplitude) e demonstrar (o que exige foco). Vinte
 * contratos construídos para disparar cada um o seu alerta são cobertura
 * exemplar e demonstração péssima — na fila do «Hoje» ninguém distingue o que
 * está a ver.
 *
 * Separá-los em cenários nomeados resolve isso sem perder nenhum dos dois: a
 * cobertura continua lá, deixa é de ser a única opção.
 */
export interface Cenario {
  id: string;
  nome: string;
  /** O que este cenário serve para mostrar. */
  descricao: string;
  /** O tamanho, para se saber no que se está a entrar antes de carregar. */
  conteudo: string;
  semear(ctx: Contexto): Promise<void>;
}

export const CATALOGO_CENARIOS: ReadonlyArray<Cenario> = [
  {
    id: 'cobertura',
    nome: 'Cobertura de regras',
    descricao:
      'Todos os cenários de regra e de alerta ao mesmo tempo. É o conjunto com que a aplicação foi construída e o que ' +
      'garante que nada fica por exercitar — mas é também o mais difícil de ler, porque cada contrato existe para ' +
      'disparar uma coisa diferente.',
    conteudo: '20 contratos · 3 projetos · todas as famílias de alerta · faturação e entregáveis',
    semear,
  },
  {
    id: 'assistente',
    nome: 'Capacidades do assistente',
    descricao:
      'Quatro contratos escolhidos para as perguntas do «Perguntar» terem resposta interessante: dois contratos de ' +
      'outsourcing com objeto parecido (para a desambiguação acontecer), folga a 40 €/h em vários (para compor listas), ' +
      'um a terminar com valor por executar (para o risco) e duas pessoas afetas ao mesmo perfil (para a substituição).',
    conteudo: '4 contratos · 2 projetos · 4 pessoas · registos por aprovar',
    semear: cenarioAssistente,
  },
  {
    id: 'hoje',
    nome: 'Decisões do «Hoje»',
    descricao:
      'Um contrato por FAMÍLIA de decisão — fim de ciclo, capacidade, cobertura orçamental, higiene de execução e ' +
      'faturação —, com os prazos-limite afastados de propósito. A fila cabe num ecrã e vê-se que está ordenada por ' +
      'urgência, que é o que ela tem para mostrar.',
    conteudo: '4 contratos · 1 projeto · cinco famílias de decisão',
    semear: cenarioHoje,
  },
  {
    id: 'faturacao',
    nome: 'Ciclo de faturação',
    descricao:
      'As três decisões que a conferência pode dar: uma fatura que confere e já foi validada, uma acima do trabalho ' +
      'aprovado à espera da nota de crédito (RN-612), e um chave-na-mão com um entregável entregue por faturar ' +
      '(RN-608) e outro por entregar.',
    conteudo: '2 contratos · 3 faturas · 3 entregáveis · há sempre algo por decidir',
    semear: cenarioFaturacao,
  },
  {
    id: 'vazio',
    nome: 'Vazio',
    descricao:
      'Sem dados nenhuns. Serve para experimentar o percurso completo pela interface — criar um contrato, dar-lhe ' +
      'perfis, afetar pessoas, registar horas, aprovar e faturar. É o caminho que o seed nunca obriga a percorrer, ' +
      'porque entrega sempre tudo feito.',
    conteudo: 'nada — a aplicação arranca em branco',
    semear: async () => { /* deliberadamente nada */ },
  },
];

export const CENARIO_OMISSAO = 'cobertura';

export function cenarioPorId(id: string): Cenario | undefined {
  return CATALOGO_CENARIOS.find((c) => c.id === id);
}

export { cenarioAssistente, cenarioHoje, cenarioFaturacao };
