import type { DataISO } from '../tipos/primitivos.js';

/**
 * Base legal VERSIONADA e DATADA. Substitui as constantes espalhadas por uma
 * fonte única com vigência temporal — os valores mudam por lei (ex.: o limiar do
 * visto prévio é fixado anualmente na Lei do OE). Em produção, este módulo é o
 * ponto onde um agente com RAG sobre a legislação em vigor injeta os valores
 * atuais, mantendo a mesma interface.
 */
export interface ParametroLegal {
  chave: string;
  valor: number; // cêntimos, percentagem (0..1) ou meses, consoante a chave
  vigenteDe: DataISO;
  vigenteAte?: DataISO;
  referencia: string;
}

export const BASE_LEGAL: ReadonlyArray<ParametroLegal> = [
  { chave: 'VISTO_PREVIO_LIMIAR_CENT', valor: 750_000_00, vigenteDe: '2024-01-01', referencia: 'Lei do Orçamento do Estado em vigor / LOPTC (Lei n.º 98/97) — limiar de fiscalização prévia (valor ilustrativo no protótipo).' },
  { chave: 'TRANSICAO_ANO_PCT', valor: 0.5, vigenteDe: '2012-02-14', referencia: 'LCPA (Lei n.º 8/2012) e DL n.º 127/2012 — transição de encargos sem portaria de extensão (a confirmar pelo agente CCP).' },
  { chave: 'VIGENCIA_MAX_MESES', valor: 36, vigenteDe: '2008-07-30', referencia: 'CCP — limite de vigência (RN-202).' },
  { chave: 'COMPLEMENTARES_MAX_PCT', valor: 0.5, vigenteDe: '2008-07-30', referencia: 'CCP, art. 370.º n.º 4 — limite de serviços complementares (RN-301).' },

  // Prazos de INSTRUÇÃO dos atos (em dias). Determinam a JANELA DE DECISÃO: a
  // data-limite para agir calcula-se para trás, a partir do evento-âncora.
  // São prazos organizacionais (não legais em sentido estrito) e por isso ficam
  // aqui, versionados e ajustáveis sem tocar no código dos alertas.
  { chave: 'INSTRUCAO_TRANSICAO_DIAS', valor: 45, vigenteDe: '2012-02-14', referencia: 'Prazo de instrução do pedido de transição de saldo antes do fecho do ano económico (LCPA / DL n.º 127/2012).' },
  { chave: 'INSTRUCAO_PORTARIA_DIAS', valor: 75, vigenteDe: '2012-08-21', referencia: 'Prazo de instrução da reprogramação de portaria de extensão de encargos (envolve tutela e Finanças).' },
  { chave: 'INSTRUCAO_MODIFICACAO_DIAS', valor: 30, vigenteDe: '2008-07-30', referencia: 'Prazo de instrução de uma modificação objetiva (complementares / prorrogação), CCP art. 311.º e ss.' },
  { chave: 'INSTRUCAO_PROCEDIMENTO_MESES', valor: 5, vigenteDe: '2008-07-30', referencia: 'Duração típica de um procedimento concursal até à celebração do contrato (CCP).' },
  { chave: 'INSTRUCAO_VISTO_MESES', valor: 3, vigenteDe: '1997-08-26', referencia: 'Acréscimo de prazo por fiscalização prévia do Tribunal de Contas (LOPTC, Lei n.º 98/97).' },
];

/** Parâmetro legal em vigor à data indicada (ou o mais recente, por omissão). */
export function parametroLegal(chave: string, emVigorEm?: DataISO): ParametroLegal | undefined {
  const candidatos = BASE_LEGAL.filter((p) =>
    p.chave === chave &&
    (emVigorEm === undefined || (p.vigenteDe <= emVigorEm && (p.vigenteAte === undefined || emVigorEm <= p.vigenteAte))),
  );
  return [...candidatos].sort((a, b) => (a.vigenteDe < b.vigenteDe ? 1 : -1))[0];
}

/** Valor numérico de um parâmetro legal, com omissão de segurança. */
export function valorLegal(chave: string, omissao: number, emVigorEm?: DataISO): number {
  return parametroLegal(chave, emVigorEm)?.valor ?? omissao;
}
