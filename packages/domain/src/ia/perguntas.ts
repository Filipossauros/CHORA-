import type { Contrato } from '../entidades/contrato.js';
import type { Alteracao, PerfilContratual } from '../entidades/estrutura.js';
import type { RegistoTempo } from '../entidades/registo-tempo.js';
import type { Alerta } from '../entidades/auditoria-alerta.js';
import type { DataISO } from '../tipos/primitivos.js';
import { complementaresAcumulados } from '../calculos/financeira.js';
import { preverContrato, preverPerfil } from '../calculos/previsoes.js';
import { vigenciaLiquidaMeses, LIMITE_VIGENCIA_MESES } from '../calculos/prazos.js';
import { decisoesPendentes } from '../alertas/reconciliacao.js';
import { valorLegal } from '../legal/base-legal.js';
import { normalizarTexto } from './similaridade.js';
import { eurosTexto, dataTexto, type FonteResposta, type RespostaPergunta } from './porta-agente.js';

/**
 * RESOLVEDOR DE PERGUNTAS — a camada que dissolve os menus.
 *
 * O utilizador pergunta em linguagem natural; **nada aqui é calculado por um
 * modelo**. A pergunta é encaminhada para as funções determinísticas que já
 * existem (`preverContrato`, `complementaresAcumulados`, `vigenciaLiquidaMeses`,
 * `decisoesPendentes`) e a resposta é narrada com a PROVENIÊNCIA visível.
 *
 * O agente entra depois, opcionalmente, apenas para redigir melhor — nunca para
 * mudar os números.
 */

export interface DadosPergunta {
  contratos: ReadonlyArray<Contrato>;
  perfis: ReadonlyArray<PerfilContratual>;
  alteracoes: ReadonlyArray<Alteracao>;
  aprovados: ReadonlyArray<RegistoTempo>;
  alertas: ReadonlyArray<Alerta>;
  hoje: DataISO;
}

/** Intenções que o resolvedor reconhece. */
export type Intencao =
  | 'COMPLEMENTARES_DISPONIVEL'
  | 'SALDO_CONTRATO'
  | 'VIGENCIA_CONTRATO'
  | 'PERFIL_ESGOTAMENTO'
  | 'DECISOES_PENDENTES'
  | 'DESCONHECIDA';

interface Padrao { intencao: Intencao; termos: string[][] }

/** Cada padrão exige que pelo menos um termo de cada grupo esteja presente. */
const PADROES: Padrao[] = [
  { intencao: 'COMPLEMENTARES_DISPONIVEL', termos: [['complementar', 'complementares', 'adicionais'], ['quanto', 'posso', 'limite', 'disponivel', 'falta', 'margem', 'teto']] },
  { intencao: 'PERFIL_ESGOTAMENTO', termos: [['perfil', 'perfis', 'horas'], ['esgota', 'esgotar', 'acaba', 'acabam', 'chega', 'quando', 'resta', 'restam']] },
  { intencao: 'VIGENCIA_CONTRATO', termos: [['vigencia', 'prazo', 'termina', 'termino', 'ate quando', 'prorrogar']] },
  { intencao: 'SALDO_CONTRATO', termos: [['saldo', 'executar', 'gastar', 'disponivel', 'sobra', 'resta'], []] },
  { intencao: 'DECISOES_PENDENTES', termos: [['decisao', 'decisoes', 'decidir', 'alerta', 'alertas', 'pendente', 'pendentes', 'preocupar', 'atencao', 'urgent', 'prioridade']] },
];

/** Classifica a pergunta numa intenção conhecida. */
export function classificar(pergunta: string): Intencao {
  const t = normalizarTexto(pergunta);
  for (const p of PADROES) {
    const bate = p.termos.every((grupo) => grupo.length === 0 || grupo.some((termo) => t.includes(termo)));
    if (bate) return p.intencao;
  }
  return 'DESCONHECIDA';
}

/** Encontra o contrato referido na pergunta, pelo número. */
export function contratoDaPergunta(pergunta: string, contratos: ReadonlyArray<Contrato>): Contrato | undefined {
  const t = normalizarTexto(pergunta).replace(/\s/g, '');
  return contratos.find((c) => t.includes(normalizarTexto(c.numero).replace(/\s/g, '')));
}

const F = (proveniencia: FonteResposta['proveniencia'], referencia: string): FonteResposta => ({ proveniencia, referencia });

/**
 * Responde à pergunta a partir dos dados. Determinístico e reproduzível: os
 * números vêm sempre das funções de cálculo, nunca de um modelo.
 */
export function responderPergunta(pergunta: string, d: DadosPergunta): RespostaPergunta {
  const intencao = classificar(pergunta);
  const contrato = contratoDaPergunta(pergunta, d.contratos);

  if (intencao === 'DECISOES_PENDENTES') {
    const relevantes = contrato !== undefined ? d.alertas.filter((a) => a.contratoId === contrato.id) : d.alertas;
    const pendentes = decisoesPendentes(relevantes);
    const vencidas = pendentes.filter((a) => (a.diasParaLimite ?? 1) < 0);
    const alvo = contrato !== undefined ? `o contrato ${contrato.numero}` : 'a carteira';
    if (pendentes.length === 0) {
      return { texto: `Não há decisões pendentes para ${alvo}.`, fontes: [F('REGRA', 'Catálogo de alertas — decisões abertas ou em curso')] };
    }
    const proxima = [...pendentes].sort((a, b) => (a.diasParaLimite ?? 9e9) - (b.diasParaLimite ?? 9e9))[0]!;
    return {
      texto:
        `Há ${pendentes.length} decisão(ões) pendente(s) para ${alvo}` +
        (vencidas.length > 0 ? `, das quais ${vencidas.length} com o prazo já vencido` : '') +
        `. A mais urgente é «${proxima.titulo}»` +
        (proxima.dataLimiteAcao !== undefined
          ? `, com data-limite em ${dataTexto(proxima.dataLimiteAcao)} (${(proxima.diasParaLimite ?? 0) < 0 ? `há ${-(proxima.diasParaLimite ?? 0)} dias` : `faltam ${proxima.diasParaLimite} dias`}).`
          : '.'),
      fontes: [F('REGRA', 'Catálogo de alertas — decisões abertas ou em curso')],
    };
  }

  if (contrato === undefined) {
    return {
      texto: 'Indique o número do contrato na pergunta (por exemplo, «quanto posso gastar em complementares no C-2026-003?»).',
      fontes: [], semResposta: true,
    };
  }

  const alteracoesC = d.alteracoes.filter((a) => a.contratoId === contrato.id);
  const aprovadosC = d.aprovados.filter((r) => r.contratoId === contrato.id);

  if (intencao === 'COMPLEMENTARES_DISPONIVEL') {
    const pct = valorLegal('COMPLEMENTARES_MAX_PCT', 0.5);
    const teto = Math.floor(contrato.precoContratualInicial * pct);
    const acumulado = complementaresAcumulados(alteracoesC);
    const folga = Math.max(0, teto - acumulado);
    return {
      texto:
        `${eurosTexto(folga)}. O contrato ${contrato.numero} tem ${eurosTexto(contrato.precoContratualInicial)} de preço contratual inicial, ` +
        `o que fixa o teto de complementares em ${eurosTexto(teto)} (${Math.round(pct * 100)}%). Já foram acumulados ${eurosTexto(acumulado)}.` +
        (folga === 0 ? ' O teto está esgotado: qualquer acréscimo seria ilegal, não apenas desaconselhado.' : ''),
      fontes: [F('REGRA', 'RN-301 — limite de 50% (CCP, art. 370.º n.º 4)'), F('REGRA', 'RN-302 — alerta aos 40%')],
    };
  }

  if (intencao === 'SALDO_CONTRATO') {
    const p = preverContrato(contrato, aprovadosC, d.hoje);
    return {
      texto:
        `O contrato ${contrato.numero} tem ${eurosTexto(p.valorRestante)} por executar, de ${eurosTexto(p.valorAtual)} contratados ` +
        `(${Math.round((p.valorExecutado / Math.max(1, p.valorAtual)) * 100)}% executado). ` +
        (p.gapNoTermino > 0
          ? `Ao ritmo das últimas semanas, sobram ${eurosTexto(p.gapNoTermino)} por executar no término (${dataTexto(contrato.dataTerminoContratual)}).`
          : `Ao ritmo atual, o valor é integralmente executado até ao término.`),
      fontes: [F('REGRA', 'Execução aprovada registada'), F('PROJECAO', 'Ritmo das últimas 6 semanas — camada de previsões')],
    };
  }

  if (intencao === 'VIGENCIA_CONTRATO') {
    const liquida = vigenciaLiquidaMeses(contrato.dataInicioVigencia, contrato.dataTerminoContratual, alteracoesC);
    const margem = LIMITE_VIGENCIA_MESES - liquida;
    return {
      texto:
        `O contrato ${contrato.numero} vigora de ${dataTexto(contrato.dataInicioVigencia)} a ${dataTexto(contrato.dataTerminoContratual)}, ` +
        `o que corresponde a ${liquida.toFixed(1)} meses de vigência líquida (descontadas as suspensões). ` +
        (margem > 0
          ? `Há margem para mais ${margem.toFixed(1)} meses dentro do limite de ${LIMITE_VIGENCIA_MESES}.`
          : `O limite de ${LIMITE_VIGENCIA_MESES} meses está atingido: qualquer prorrogação exige exceção fundamentada.`),
      fontes: [F('REGRA', 'RN-202 — limite de 36 meses (CCP, art. 440.º e 48.º)'), F('REGRA', 'RN-204 — desconto das suspensões')],
    };
  }

  if (intencao === 'PERFIL_ESGOTAMENTO') {
    const perfisC = d.perfis.filter((p) => p.contratoId === contrato.id);
    if (perfisC.length === 0) {
      return { texto: `O contrato ${contrato.numero} não tem perfis contratuais registados.`, fontes: [F('REGRA', 'Estrutura do contrato')] };
    }
    const previsoes = perfisC.map((p) => preverPerfil(p, aprovadosC, contrato, d.hoje));
    const emRisco = previsoes.filter((p) => p.esgotaAntesDoTermino === true).sort((a, b) => (a.dataEsgotamento ?? '') < (b.dataEsgotamento ?? '') ? -1 : 1);
    if (emRisco.length === 0) {
      return {
        texto: `Nenhum perfil do contrato ${contrato.numero} se esgota antes do término, ao ritmo recente. O total disponível é de ${Math.round(previsoes.reduce((s, p) => s + p.minutosRestantes, 0) / 60)} h.`,
        fontes: [F('PROJECAO', 'Ritmo das últimas 6 semanas — camada de previsões')],
      };
    }
    const pior = emRisco[0]!;
    return {
      texto:
        `${emRisco.length} perfil(s) do contrato ${contrato.numero} esgotam-se antes do término. ` +
        `O mais próximo é «${pior.nome}», a ${dataTexto(pior.dataEsgotamento!)}, com ${Math.round(pior.minutosRestantes / 60)} h restantes — ` +
        `o término só ocorre a ${dataTexto(contrato.dataTerminoContratual)}.`,
      fontes: [F('PROJECAO', 'Ritmo das últimas 6 semanas — camada de previsões'), F('REGRA', 'RN-505 — acompanhamento de consumo')],
    };
  }

  return {
    texto: 'Não consigo responder a essa pergunta com os dados disponíveis. Experimente perguntar sobre o saldo de um contrato, o limite de complementares, a vigência, o esgotamento de perfis ou as decisões pendentes.',
    fontes: [], semResposta: true,
  };
}

/** Perguntas de exemplo, para sugerir ao utilizador. */
export const PERGUNTAS_EXEMPLO: ReadonlyArray<string> = [
  'Quanto posso ainda gastar em complementares no {n}?',
  'Qual o saldo por executar do {n}?',
  'Até quando vai a vigência do {n}?',
  'Que perfis se esgotam antes do término no {n}?',
  'O que tenho de decidir com urgência?',
];
