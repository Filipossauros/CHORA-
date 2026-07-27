import type { Contrato } from '../entidades/contrato.js';
import type { Alteracao, PerfilContratual } from '../entidades/estrutura.js';
import type { Recurso } from '../entidades/recursos.js';
import type { RegistoTempo } from '../entidades/registo-tempo.js';
import type { OpcaoAlerta } from '../entidades/auditoria-alerta.js';
import type { Cent, DataISO } from '../tipos/primitivos.js';
import { diasEntre } from '../tipos/tempo.js';
import { janelaModificacao, janelaNovoProcedimento } from './janela-decisao.js';
import { calcularConsumoPerfil } from './consumo.js';
import { valorPrevistoPerfil, complementaresAcumulados } from './financeira.js';
import { valorHoraVigente } from './preco-perfil.js';
import { valorLegal } from '../legal/base-legal.js';
import { semelhancaPerfil, LIMIAR_SEMELHANCA } from '../ia/similaridade.js';

/**
 * ESCADA DE OPÇÕES — quando um perfil se esgota, a aplicação não se limita a
 * sinalizar: enumera os caminhos possíveis, ordenados por ATRITO JURÍDICO
 * crescente, cada um com viabilidade, fundamento e impacto financeiro.
 *
 * A ordem reflete o regime da contratação pública:
 *  1. reafectar dentro do contrato — sem formalidade;
 *  2. perfil idêntico noutro contrato da MESMA entidade executante — a
 *     substituição de afetação exige coincidência de perfil e de entidade
 *     (RN-701);
 *  3. entidade DIFERENTE — já não é substituição: exige subcontratação
 *     (RN-702, CCP art. 316.º e ss., com autorização e habilitação) ou cessão;
 *  4. reforçar dentro do contrato — complementares dentro do teto (RN-301);
 *  5. nada viável — preparar novo procedimento em tempo útil.
 */

/**
 * Valor/hora de um perfil para efeitos de comparação: o vigente na data e, se
 * não houver preço em vigor, o último conhecido (evita comparar contra zero).
 */
function valorHoraComparavel(perfil: PerfilContratual, referencia: DataISO): Cent {
  return valorHoraVigente(perfil, referencia) ?? perfil.precos[perfil.precos.length - 1]?.valorHora ?? 0;
}

export interface AlternativaPerfil {
  contratoId: string;
  contratoNumero: string;
  perfilId: string;
  perfilNome: string;
  minutosDisponiveis: number;
  valorDisponivel: Cent;
  valorHora: Cent;
  /** NIPC da entidade adjudicatária do contrato alternativo. */
  entidadeNipc: string;
  /** A entidade executante coincide com a do contrato em risco? */
  mesmaEntidade: boolean;
  /** Diferencial de valor/hora face ao perfil em risco (positivo = mais caro). */
  diferencaValorHora: Cent;
  /** Semelhança do nome do perfil (1 = igual). Ver `ia/similaridade`. */
  semelhanca: number;
}

/** Saldo de minutos e de valor de um perfil. */
function saldo(perfil: PerfilContratual, aprovados: ReadonlyArray<RegistoTempo>): { minutos: number; valor: Cent } {
  const consumo = calcularConsumoPerfil(perfil, aprovados.filter((r) => r.perfilId === perfil.id));
  return {
    minutos: Math.max(0, perfil.quantidadePrevista - consumo.minutosConsumidos),
    valor: Math.max(0, valorPrevistoPerfil(perfil) - consumo.valorConsumido),
  };
}

/**
 * Procura perfis de nome idêntico com saldo noutros contratos EM VIGOR,
 * distinguindo os que são da mesma entidade executante (mobilização simples)
 * dos que não são (exigem subcontratação/cessão) e comparando o valor/hora.
 */
export function alternativasParaPerfil(
  perfilEmRisco: PerfilContratual,
  contratoEmRisco: Contrato,
  contratos: ReadonlyArray<Contrato>,
  perfis: ReadonlyArray<PerfilContratual>,
  aprovados: ReadonlyArray<RegistoTempo>,
  hoje: DataISO,
): AlternativaPerfil[] {
  const valorHoraAlvo = valorHoraComparavel(perfilEmRisco, hoje);
  const alternativas: AlternativaPerfil[] = [];

  for (const outro of perfis) {
    if (outro.contratoId === contratoEmRisco.id) continue;
    // Correspondência por SEMELHANÇA e não por igualdade exata: «Consultor
    // Funcional» tem de encontrar «Consultor Funcional Sénior» (ia/similaridade).
    const semelhanca = semelhancaPerfil(perfilEmRisco.nome, outro.nome);
    if (semelhanca < LIMIAR_SEMELHANCA) continue;
    const contrato = contratos.find((c) => c.id === outro.contratoId);
    if (contrato === undefined || contrato.estado !== 'EM_VIGOR') continue;
    const s = saldo(outro, aprovados);
    if (s.minutos <= 0 && s.valor <= 0) continue;
    const valorHora = valorHoraComparavel(outro, hoje);
    alternativas.push({
      contratoId: contrato.id, contratoNumero: contrato.numero,
      perfilId: outro.id, perfilNome: outro.nome,
      minutosDisponiveis: s.minutos, valorDisponivel: s.valor, valorHora,
      entidadeNipc: contrato.prestador.nipc,
      mesmaEntidade: contrato.prestador.nipc === contratoEmRisco.prestador.nipc,
      diferencaValorHora: valorHora - valorHoraAlvo,
      semelhanca,
    });
  }
  // Mesma entidade primeiro; depois o mais parecido; depois o mais barato.
  return alternativas.sort((a, b) => {
    if (a.mesmaEntidade !== b.mesmaEntidade) return a.mesmaEntidade ? -1 : 1;
    if (Math.abs(a.semelhanca - b.semelhanca) > 0.01) return b.semelhanca - a.semelhanca;
    return a.valorHora - b.valorHora;
  });
}

/** Perfis do MESMO contrato com saldo, para reafectação interna. */
export function folgaInterna(
  perfilEmRisco: PerfilContratual,
  perfis: ReadonlyArray<PerfilContratual>,
  aprovados: ReadonlyArray<RegistoTempo>,
): Array<{ perfilNome: string; minutosDisponiveis: number }> {
  return perfis
    .filter((p) => p.contratoId === perfilEmRisco.contratoId && p.id !== perfilEmRisco.id)
    .map((p) => ({ perfilNome: p.nome, minutosDisponiveis: saldo(p, aprovados).minutos }))
    .filter((p) => p.minutosDisponiveis > 0);
}

/** Formata minutos como horas, para os textos das opções. */
function h(minutos: number): string {
  return `${Math.round(minutos / 60)} h`;
}

/** Formata cêntimos como euros, para os textos das opções. */
function eur(cent: Cent): string {
  return `${(cent / 100).toLocaleString('pt-PT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
}

export interface EntradaEscada {
  perfilEmRisco: PerfilContratual;
  contrato: Contrato;
  contratos: ReadonlyArray<Contrato>;
  perfis: ReadonlyArray<PerfilContratual>;
  alteracoes: ReadonlyArray<Alteracao>;
  aprovados: ReadonlyArray<RegistoTempo>;
  recursos: ReadonlyArray<Recurso>;
  hoje: DataISO;
  /**
   * Data em que a capacidade se esgota — o momento a partir do qual já não há
   * horas. É a âncora dos prazos das opções: as que não exigem instrução podem
   * ir até lá, as restantes têm de recuar o respetivo prazo.
   */
  dataEsgotamento: DataISO;
}

/**
 * Reserva jurídica das opções de capacidade. A escada resolve o problema de
 * gestão — quem executa continua obrigado ao que a lei e o contrato impõem.
 */
export const NOTA_JURIDICA_CAPACIDADE =
  'Estas opções não dispensam: a observância do objeto do contrato e do perfil contratado (não se reafeta para tarefa alheia ao objeto); ' +
  'a verificação da habilitação e da idoneidade do executante; a autorização prévia da subcontratação ou da cessão da posição contratual; ' +
  'a fundamentação e o registo da modificação contratual, quando exista; e o cabimento e compromisso prévios da despesa que resulte de qualquer delas.';

/** Prazo de uma opção, a partir da data em que a alternativa deixa de existir. */
function prazo(hoje: DataISO, dataLimite: DataISO): { dataLimite: DataISO; diasParaLimite: number } {
  return { dataLimite, diasParaLimite: diasEntre(hoje, dataLimite) };
}

/**
 * Constrói a escada de opções para um perfil a esgotar-se. Devolve sempre pelo
 * menos uma opção (o último degrau é preparar novo procedimento).
 */
export function escadaOpcoesPerfil(e: EntradaEscada): OpcaoAlerta[] {
  const opcoes: OpcaoAlerta[] = [];
  let ordem = 1;
  // Atos sem instrução prévia valem até ao dia em que as horas acabam; os que
  // exigem instrução recuam o prazo de instrução da modificação.
  const semInstrucao = prazo(e.hoje, e.dataEsgotamento);
  const comInstrucao = prazo(e.hoje, janelaModificacao(e.hoje, e.dataEsgotamento).dataLimiteAcao);

  // 1 — reafectar dentro do contrato
  const interna = folgaInterna(e.perfilEmRisco, e.perfis, e.aprovados);
  if (interna.length > 0) {
    const total = interna.reduce((s, p) => s + p.minutosDisponiveis, 0);
    opcoes.push({
      ordem: ordem++, titulo: 'Reafectar dentro do contrato',
      detalhe: `Há ${h(total)} disponíveis noutros perfis deste contrato (${interna.map((p) => `${p.perfilNome}: ${h(p.minutosDisponiveis)}`).join('; ')}). Reafectação interna, sem formalidade contratual.`,
      viabilidade: 'VIAVEL',
      ...semInstrucao,
      acao: { destino: 'AFETACOES', rotulo: 'Gerir afetações', contratoId: e.contrato.id },
    });
  }

  const alternativas = alternativasParaPerfil(e.perfilEmRisco, e.contrato, e.contratos, e.perfis, e.aprovados, e.hoje);
  const mesmas = alternativas.filter((a) => a.mesmaEntidade);
  const outras = alternativas.filter((a) => !a.mesmaEntidade);

  // 2 — perfil idêntico noutro contrato da MESMA entidade executante
  for (const a of mesmas.slice(0, 2)) {
    opcoes.push({
      ordem: ordem++, titulo: `Mobilizar para o contrato ${a.contratoNumero} (mesma entidade)`,
      detalhe: `O contrato ${a.contratoNumero} tem o perfil «${a.perfilNome}»${a.semelhanca < 0.999 ? ` (papel equivalente, ${Math.round(a.semelhanca * 100)}% de correspondência)` : ''} com ${h(a.minutosDisponiveis)} e ${eur(a.valorDisponivel)} disponíveis, da mesma entidade executante. A substituição/afetação é direta.`,
      viabilidade: 'VIAVEL',
      fundamento: 'RN-701 — perfil e entidade executante coincidem.',
      ...semInstrucao,
      // A afetação faz-se no contrato que TEM as horas, não no que as perdeu.
      acao: { destino: 'AFETACOES', rotulo: `Afetações de ${a.contratoNumero}`, contratoId: a.contratoId },
    });
  }

  // 3 — entidade DIFERENTE: subcontratação ou cessão, com o diferencial de rate
  for (const a of outras.slice(0, 2)) {
    const maisCaro = a.diferencaValorHora > 0;
    const custoDesvio = maisCaro ? Math.round((a.diferencaValorHora * a.minutosDisponiveis) / 60) : 0;
    opcoes.push({
      ordem: ordem++, titulo: `Recorrer ao contrato ${a.contratoNumero} (entidade diferente)`,
      detalhe:
        `O contrato ${a.contratoNumero} tem o perfil «${a.perfilNome}» com ${h(a.minutosDisponiveis)} disponíveis, mas de OUTRA entidade executante — não é substituição de afetação. ` +
        `Exige subcontratação autorizada (ou cessão da posição contratual), com verificação da habilitação. ` +
        (maisCaro
          ? `O valor/hora é superior em ${eur(a.diferencaValorHora)} (${eur(custoDesvio)} no total das horas disponíveis): pondere subcontratar no contrato mais barato.`
          : `O valor/hora é igual ou inferior ao atual (${eur(a.valorHora)}/h), pelo que não há agravamento de custo.`),
      viabilidade: 'CONDICIONADA',
      fundamento: 'RN-702 e CCP, art. 316.º e ss. — subcontratação/cessão carece de autorização e de habilitação do executante.',
      ...(custoDesvio > 0 ? { impactoValor: custoDesvio } : {}),
      ...comInstrucao,
      acao: { destino: 'MODIFICACOES', rotulo: 'Registar cessão de posição', contratoId: e.contrato.id, tipoModificacao: 'CESSAO_POSICAO_CONTRATUAL' },
    });
  }

  // 4 — reforçar dentro do contrato (complementares, dentro do teto RN-301)
  const tetoPct = valorLegal('COMPLEMENTARES_MAX_PCT', 0.5);
  const teto = Math.floor(e.contrato.precoContratualInicial * tetoPct);
  const acumulado = complementaresAcumulados(e.alteracoes);
  const folgaTeto = Math.max(0, teto - acumulado);
  opcoes.push({
    ordem: ordem++, titulo: 'Reforçar o contrato (trabalhos complementares)',
    detalhe: folgaTeto > 0
      ? `Há ${eur(folgaTeto)} de folga até ao teto legal de ${Math.round(tetoPct * 100)}% do preço inicial. Exige modificação objetiva fundamentada e nova data de vigência.`
      : `O teto de ${Math.round(tetoPct * 100)}% do preço inicial está esgotado (${eur(acumulado)} acumulados): não há margem para complementares.`,
    viabilidade: folgaTeto > 0 ? 'CONDICIONADA' : 'INVIAVEL',
    fundamento: 'RN-301 — limite de 50% do preço contratual inicial (CCP, art. 370.º n.º 4).',
    ...(folgaTeto > 0 ? { impactoValor: folgaTeto } : {}),
    ...comInstrucao,
    ...(folgaTeto > 0
      ? { acao: { destino: 'MODIFICACOES' as const, rotulo: 'Registar complementares', contratoId: e.contrato.id, tipoModificacao: 'SERVICOS_COMPLEMENTARES' } }
      : {}),
  });

  // 5 — último degrau: preparar novo procedimento. É a opção com o prazo mais
  // longo de todas — meses, e mais ainda com visto prévio —, pelo que costuma
  // ser a primeira a perder-se.
  const jProc = janelaNovoProcedimento(e.hoje, e.contrato.dataTerminoContratual, e.contrato.vistoTribunalContasNecessario);
  opcoes.push({
    ordem: ordem++, titulo: 'Preparar novo procedimento',
    detalhe: 'Não havendo capacidade mobilizável nem margem de reforço suficiente, deve iniciar-se a preparação de novo procedimento em tempo útil.'
      + (jProc.diasParaLimite < 0
        ? ` O prazo para o lançar com folga terminou há ${-jProc.diasParaLimite} dias: mantendo-se a necessidade, haverá descontinuidade do serviço ou recurso a ajuste direto fundamentado.`
        : ` Contando ${e.contrato.vistoTribunalContasNecessario ? 'a duração do procedimento e o visto prévio do Tribunal de Contas' : 'a duração do procedimento'}, tem de arrancar até ${jProc.dataLimiteAcao}.`),
    viabilidade: alternativas.length === 0 && interna.length === 0 ? 'VIAVEL' : 'CONDICIONADA',
    fundamento: 'CCP — planeamento da contratação.',
    ...prazo(e.hoje, jProc.dataLimiteAcao),
    acao: { destino: 'FICHA', rotulo: 'Ver contrato', contratoId: e.contrato.id },
  });

  return opcoes;
}

/**
 * Prazo do alerta a partir das suas opções: o MAIS CURTO. Depois dessa data
 * deixa de haver uma alternativa — é aí que a decisão se estreita, e não quando
 * o problema se materializa.
 */
export function prazoMaisCurto(opcoes: ReadonlyArray<OpcaoAlerta>): OpcaoAlerta | undefined {
  return opcoes
    .filter((o) => o.dataLimite !== undefined && o.viabilidade !== 'INVIAVEL')
    .sort((a, b) => (a.dataLimite! < b.dataLimite! ? -1 : 1))[0];
}
