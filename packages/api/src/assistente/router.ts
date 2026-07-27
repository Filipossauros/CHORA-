/**
 * ROUTER DETERMINÍSTICO — a frase → uma capacidade e os seus parâmetros.
 *
 * Corre SEMPRE primeiro, antes de qualquer modelo. Não é um plano B: é o que
 * garante que a aplicação responde sem runtime de IA instalado, que a demo
 * funciona no GitHub Pages e que os testes correm sem depender de um modelo. O
 * modelo entra só quando isto não chega — e mesmo aí, escolhe da mesma lista
 * fechada e passa pelos mesmos esquemas.
 */

export interface Encaminhamento {
  capacidade: string;
  parametros: Record<string, unknown>;
  /** 0..1 — quão confiante é o encaminhamento. Abaixo de 0,5 pede-se ajuda. */
  confianca: number;
  /** Como se chegou aqui, para o utilizador perceber (e para auditar). */
  origem: 'PADRAO' | 'MODELO';
}

/** Sem acentos, minúsculas — a base de toda a correspondência. */
export function normalizar(t: string): string {
  return t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

/** Número de contrato mencionado na frase (C-2026-001, c 2026 bh2, …). */
export function numeroContratoNaFrase(t: string): string | undefined {
  const m = t.match(/\bC[-\s]?\d{4}[-\s]?[A-Za-z0-9]+\b/i);
  return m?.[0].replace(/\s+/g, '-').toUpperCase();
}

/**
 * Valor/hora mencionado. Aceita «45 €/h», «45 euros por hora», «45,50/hora».
 * Exige a menção explícita da hora — sem ela, o número pode ser qualquer coisa.
 */
export function valorHoraNaFrase(t: string): number | undefined {
  const n = normalizar(t);
  const m = n.match(/(\d+(?:[.,]\d+)?)\s*(?:€|eur|euros)?\s*(?:\/|por\s+)\s*(?:h|hora)/);
  if (m?.[1] === undefined) return undefined;
  return Number(m[1].replace(',', '.'));
}

/** Texto a seguir a «perfil …», usado para a folga por perfil. */
function perfilNaFrase(t: string): string | undefined {
  const n = normalizar(t);
  const m =
    n.match(/perfil\s+(?:de\s+)?([a-z0-9 çãáàâéêíóõôú/-]{3,40}?)(?:\s*[?.,]|\s+(?:no|na|do|da|em|para|que|com)\b|$)/) ??
    n.match(/(?:mais\s+um|outro|novo)\s+([a-z0-9 çãáàâéêíóõôú/-]{3,40}?)(?:\s*[?.,]|\s+(?:no|na|do|da|em|para)\b|$)/);
  const bruto = m?.[1]?.trim();
  if (bruto === undefined || bruto.length < 3) return undefined;
  // «arquiteto» chega; «arquiteto de software senior» também. O que não serve
  // são palavras de ligação apanhadas por engano.
  return bruto.replace(/\b(pessoas?|elementos?|recursos?)\b/g, '').trim();
}

/** Texto a seguir a «projeto …». */
function projetoNaFrase(t: string): string | undefined {
  const m = t.match(/projet[oa]\s+([^?.,;]{2,60})/i);
  return m?.[1]?.trim();
}

/** Nomes próprios na frase (duas palavras capitalizadas seguidas). */
function nomesNaFrase(t: string): string[] {
  return [...t.matchAll(/\b([A-ZÁÀÂÃÉÊÍÓÔÕÚÇ][a-záàâãéêíóôõúç]+(?:\s+(?:de|da|do|dos|das)\s+)?(?:\s+[A-ZÁÀÂÃÉÊÍÓÔÕÚÇ][a-záàâãéêíóôõúç]+)+)\b/g)]
    .map((m) => m[1]!)
    .filter((n) => !/^(Qual|Quanto|Quando|Onde|Que|Como|Preciso|Quero|Troca|Substitui)\b/.test(n));
}

/** Perfil indicado em «para o perfil X do contrato Y». */
function perfilDeSubstituicao(t: string): string | undefined {
  const m = t.match(/perfil\s+(?:de\s+)?([^?.,;]{2,50}?)\s+(?:do|no|da|na)\s+(?:contrato\s+)?C[-\s]?\d{4}/i);
  return m?.[1]?.trim();
}

interface Padrao {
  capacidade: string;
  /** Cada grupo tem de ter pelo menos um termo presente. */
  termos: string[][];
  /** Extrai os parâmetros da frase original (com acentos e maiúsculas). */
  extrair(frase: string): Record<string, unknown> | undefined;
  confianca: number;
}

const PADROES: Padrao[] = [
  // Ação primeiro: uma frase de substituição também menciona «perfil» e
  // «contrato», e não queremos que caia numa consulta.
  {
    capacidade: 'afetacao.substituir',
    termos: [['troca', 'trocar', 'substitui', 'substituir', 'passa a', 'muda']],
    confianca: 0.8,
    extrair(frase) {
      const contratoNumero = numeroContratoNaFrase(frase);
      const perfil = perfilDeSubstituicao(frase) ?? perfilNaFrase(frase);
      const nomes = nomesNaFrase(frase);
      if (contratoNumero === undefined || perfil === undefined || nomes.length === 0) return undefined;
      // «substitui A por B» → A sai, B entra. «troca B para o perfil» → B entra.
      const porIndice = frase.search(/\bpor\b/i);
      if (nomes.length >= 2 && porIndice > 0 && frase.indexOf(nomes[1]!) > porIndice) {
        return { contratoNumero, perfil, pessoaSai: nomes[0], pessoaEntra: nomes[1] };
      }
      return { contratoNumero, perfil, pessoaEntra: nomes[0] };
    },
  },
  {
    capacidade: 'capacidade.folga-por-valor-hora',
    termos: [['folga', 'comportar', 'cabe', 'espaco', 'espaço', 'onde', 'que contratos']],
    confianca: 0.85,
    extrair(frase) {
      const valorHoraEuros = valorHoraNaFrase(frase);
      return valorHoraEuros !== undefined ? { valorHoraEuros } : undefined;
    },
  },
  {
    capacidade: 'capacidade.folga-por-perfil',
    termos: [['folga', 'comportar', 'cabe', 'colocar', 'alocar', 'afetar', 'onde', 'que contratos']],
    confianca: 0.8,
    extrair(frase) {
      const perfil = perfilNaFrase(frase);
      return perfil !== undefined ? { perfil } : undefined;
    },
  },
  {
    capacidade: 'projeto.executado',
    termos: [['projeto', 'projecto'], ['gasto', 'gastou', 'gastei', 'executado', 'consumido', 'ja gastou', 'despesa']],
    confianca: 0.85,
    extrair(frase) {
      const projeto = projetoNaFrase(frase);
      return projeto !== undefined ? { projeto } : undefined;
    },
  },
  {
    capacidade: 'projeto.previsto',
    termos: [['projeto', 'projecto'], ['previsto', 'prever', 'investir', 'investimento', 'vamos gastar', 'futuro']],
    confianca: 0.85,
    extrair(frase) {
      const projeto = projetoNaFrase(frase);
      return projeto !== undefined ? { projeto } : undefined;
    },
  },
  {
    capacidade: 'contrato.complementares',
    termos: [['complementar', 'complementares', 'adicionais']],
    confianca: 0.9,
    extrair(frase) {
      const contratoNumero = numeroContratoNaFrase(frase);
      return contratoNumero !== undefined ? { contratoNumero } : undefined;
    },
  },
  {
    capacidade: 'contrato.vigencia',
    termos: [['vigencia', 'ate quando', 'termina', 'termino', 'prorrogar', 'prazo do contrato']],
    confianca: 0.8,
    extrair(frase) {
      const contratoNumero = numeroContratoNaFrase(frase);
      return contratoNumero !== undefined ? { contratoNumero } : undefined;
    },
  },
  {
    capacidade: 'contrato.saldo',
    termos: [['saldo', 'por executar', 'falta gastar', 'disponivel', 'sobra', 'resta']],
    confianca: 0.8,
    extrair(frase) {
      const contratoNumero = numeroContratoNaFrase(frase);
      return contratoNumero !== undefined ? { contratoNumero } : undefined;
    },
  },
  {
    capacidade: 'fatura.registar',
    termos: [['fatura', 'faturas'], ['validar', 'registar', 'conferir', 'lancar']],
    confianca: 0.8,
    extrair(frase) {
      const contratoNumero = numeroContratoNaFrase(frase);
      return contratoNumero !== undefined ? { contratoNumero } : {};
    },
  },
  {
    capacidade: 'decisoes.pendentes',
    termos: [['decisao', 'decisoes', 'decidir', 'pendente', 'pendentes', 'urgent', 'preocupar', 'prioridade', 'alerta', 'alertas']],
    confianca: 0.85,
    extrair(frase) {
      const contratoNumero = numeroContratoNaFrase(frase);
      return contratoNumero !== undefined ? { contratoNumero } : {};
    },
  },
];

/**
 * Encaminha a frase. Devolve `undefined` quando nenhum padrão bate ou quando os
 * parâmetros não se conseguem extrair — é aí, e só aí, que o modelo entra.
 */
export function encaminhar(frase: string): Encaminhamento | undefined {
  const t = normalizar(frase);
  for (const p of PADROES) {
    const bate = p.termos.every((grupo) => grupo.some((termo) => t.includes(normalizar(termo))));
    if (!bate) continue;
    const parametros = p.extrair(frase);
    if (parametros === undefined) continue;
    return { capacidade: p.capacidade, parametros, confianca: p.confianca, origem: 'PADRAO' };
  }
  return undefined;
}
