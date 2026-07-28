import { z } from 'zod';
import type { Capacidade } from '../tipos.js';
import { F } from './comum.js';
import {
  saldoContrato, complementaresContrato, vigenciaContrato, quemEstaNoContrato,
  riscoCarteira, contratosTerminam, resumoDaCarteira,
  folgaPorPerfil, folgaPorValorHora, ondeEstaPessoa,
  registosPorAprovar, estadoFaturas, estadoEntregaveis,
  decisoesPendentes, explicarDecisao, resumoOrcamentoAnual,
  projetoExecutado, projetoPrevisto,
} from './consultas.js';
import {
  substituirAfetacao, criarAfetacao, prorrogarVigencia, registarComplementares,
  transitarSaldo, aprovarRegistos, registarEntrega, dispensarDecisao, registarFatura,
} from './acoes.js';

/** «O que sabes fazer?» — respondido do próprio catálogo, nunca de uma lista à parte. */
const ajuda: Capacidade<Record<string, never>> = {
  nome: 'ajuda',
  titulo: 'O que o assistente sabe fazer',
  descricao: 'Lista as funções disponíveis, separando as que respondem das que alteram dados.',
  tipo: 'CONSULTA',
  parametros: z.object({}),
  parametrosDescricao: [],
  regras: [],
  exemplos: ['O que sabes fazer?', 'Em que me podes ajudar?'],
  async executar() {
    const consultas = CAPACIDADES.filter((c) => c.tipo === 'CONSULTA');
    const acoes = CAPACIDADES.filter((c) => c.tipo === 'ACAO');
    return {
      texto:
        `Sei fazer ${CAPACIDADES.length} coisas: ${consultas.length} respondem a perguntas e ${acoes.length} alteram dados. ` +
        'As alterações mostram sempre primeiro o que vai acontecer, com as regras avaliadas, e só se executam depois de confirmadas. ' +
        'Fora desta lista não faço nada — o detalhe completo está em «Regras e alertas → Funções do assistente».',
      tabela: {
        titulo: 'O que sei fazer',
        colunas: ['Tipo', 'Função', 'Exemplo'],
        linhas: CAPACIDADES.map((c) => [c.tipo === 'ACAO' ? 'Ação' : 'Consulta', c.titulo, `«${c.exemplos[0] ?? ''}»`]),
      },
      fontes: [F('REGRA', 'Catálogo de capacidades do assistente')],
    };
  },
};

/**
 * O CATÁLOGO. Tudo o que o assistente pode fazer está nesta lista — nome fora
 * daqui é rejeitado sem executar nada.
 *
 * A ordem alimenta as sugestões e o pedido ao modelo, por isso abre com as
 * perguntas que ninguém adivinha que existem (carteira, capacidade, projeto) e
 * fecha nas mais óbvias.
 */
export const CAPACIDADES: ReadonlyArray<Capacidade<never>> = [
  // Carteira — as perguntas transversais, que não vivem na ficha de nenhum contrato.
  riscoCarteira, contratosTerminam, resumoDaCarteira,
  // Capacidade — onde cabe mais gente.
  folgaPorPerfil, folgaPorValorHora,
  // Projeto — o eixo em que a organização lê o dinheiro.
  projetoExecutado, projetoPrevisto, resumoOrcamentoAnual,
  // Operação diária.
  registosPorAprovar, estadoFaturas, estadoEntregaveis, ondeEstaPessoa, quemEstaNoContrato,
  // Decisões.
  decisoesPendentes, explicarDecisao,
  // Contrato.
  saldoContrato, complementaresContrato, vigenciaContrato,
  // Ações.
  substituirAfetacao, criarAfetacao, prorrogarVigencia, registarComplementares,
  transitarSaldo, aprovarRegistos, registarEntrega, dispensarDecisao, registarFatura,
  // Meta.
  ajuda,
] as unknown as ReadonlyArray<Capacidade<never>>;

export function capacidadePorNome(nome: string): Capacidade<never> | undefined {
  return CAPACIDADES.find((c) => c.nome === nome);
}
