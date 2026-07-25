/**
 * Correspondência de perfis por SIMILARIDADE, em vez de igualdade exata.
 *
 * Hoje a escada de opções compara nomes de perfil em minúsculas e exatos, pelo
 * que «Consultor Funcional» nunca encontra «Consultor Funcional Sénior» nem
 * «Analista Funcional» — e falha em silêncio numa carteira real.
 *
 * Esta implementação é determinística (normalização + sobreposição de termos com
 * peso IDF-simplificado) e serve de linha de base. A porta `PortaAgente` permite
 * substituí-la por embeddings sem tocar em quem a consome.
 */

/** Termos ruidosos que não distinguem papéis. */
const VAZIOS = new Set(['de', 'da', 'do', 'e', 'em', 'para', 'a', 'o', 'sr', 'sra']);

/** Sinónimos frequentes no vocabulário destes contratos. */
const SINONIMOS: Record<string, string> = {
  developer: 'programador',
  dev: 'programador',
  engineer: 'engenheiro',
  eng: 'engenheiro',
  senior: 'senior',
  sr: 'senior',
  jr: 'junior',
  arquitecto: 'arquiteto',
  architect: 'arquiteto',
  analyst: 'analista',
  consultant: 'consultor',
  software: 'software',
  tester: 'testes',
  qa: 'testes',
};

/** Termos que exprimem senioridade — comparam-se à parte. */
const SENIORIDADE = new Set(['junior', 'senior', 'principal', 'i', 'ii', 'iii', 'iv']);

/** Remove acentos, pontuação e normaliza para minúsculas. */
export function normalizarTexto(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Termos significativos de um nome de perfil, já normalizados. */
export function termosPerfil(nome: string): string[] {
  return normalizarTexto(nome)
    .split(' ')
    .filter((t) => t.length > 0 && !VAZIOS.has(t))
    .map((t) => SINONIMOS[t] ?? t);
}

/**
 * Semelhança entre dois nomes de perfil, de 0 a 1.
 *
 * Combina a sobreposição dos termos de PAPEL (Jaccard) com um ajuste de
 * SENIORIDADE: dois papéis iguais com senioridades diferentes são semelhantes,
 * mas não idênticos — o que é relevante, porque a mobilização entre eles é
 * possível mas não neutra.
 */
export function semelhancaPerfil(a: string, b: string): number {
  const ta = termosPerfil(a);
  const tb = termosPerfil(b);
  if (ta.length === 0 || tb.length === 0) return 0;

  const papelA = new Set(ta.filter((t) => !SENIORIDADE.has(t)));
  const papelB = new Set(tb.filter((t) => !SENIORIDADE.has(t)));
  const senA = ta.filter((t) => SENIORIDADE.has(t)).join(' ');
  const senB = tb.filter((t) => SENIORIDADE.has(t)).join(' ');

  if (papelA.size === 0 || papelB.size === 0) return 0;
  let comuns = 0;
  for (const t of papelA) if (papelB.has(t)) comuns += 1;
  const uniao = new Set([...papelA, ...papelB]).size;
  const jaccard = comuns / uniao;

  // Senioridade igual (ou ambas ausentes) não penaliza; diferente penaliza pouco.
  const ajuste = senA === senB ? 1 : 0.88;
  return Math.min(1, jaccard * ajuste);
}

/** Limiar a partir do qual dois perfis se consideram correspondentes. */
export const LIMIAR_SEMELHANCA = 0.6;

export interface CorrespondenciaPerfil {
  nome: string;
  semelhanca: number; // 0..1
  /** Verdadeiro quando os nomes são exatamente iguais depois de normalizados. */
  exata: boolean;
}

/** Ordena candidatos por semelhança ao nome alvo, acima do limiar. */
export function perfisSemelhantes(
  alvo: string,
  candidatos: ReadonlyArray<string>,
  limiar = LIMIAR_SEMELHANCA,
): CorrespondenciaPerfil[] {
  const normAlvo = normalizarTexto(alvo);
  return candidatos
    .map((nome) => ({ nome, semelhanca: semelhancaPerfil(alvo, nome), exata: normalizarTexto(nome) === normAlvo }))
    .filter((c) => c.semelhanca >= limiar)
    .sort((a, b) => b.semelhanca - a.semelhanca);
}
