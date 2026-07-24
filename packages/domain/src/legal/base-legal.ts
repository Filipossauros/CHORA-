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
