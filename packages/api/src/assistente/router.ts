import type { ContextoConversa } from './tipos.js';

/**
 * ROUTER DETERMINÍSTICO — a frase → uma capacidade e os seus parâmetros.
 *
 * Corre SEMPRE primeiro, antes de qualquer modelo. Não é um plano B: é o que
 * garante que a aplicação responde sem runtime de IA instalado, que a demo
 * funciona no GitHub Pages e que os testes correm sem depender de um modelo. O
 * modelo entra só quando isto não chega — e mesmo aí escolhe da mesma lista
 * fechada e passa pelos mesmos esquemas.
 *
 * Princípio que mudou tudo: o router **extrai o que consegue e não desiste do
 * resto**. Antes, uma frase sem número de contrato não encaminhava para lado
 * nenhum; agora encaminha, e é a camada de resolução que completa a partir da
 * conversa ou pergunta de volta. É a diferença entre «indique o número do
 * contrato» e «de que contrato estamos a falar? [C-2026-001] [C-2026-003]».
 */

export interface Encaminhamento {
  capacidade: string;
  parametros: Record<string, unknown>;
  /** 0..1 — quão confiante é o encaminhamento. */
  confianca: number;
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

/** Montante em euros mencionado («20 000 euros», «20000€»). */
export function montanteNaFrase(t: string): number | undefined {
  if (valorHoraNaFrase(t) !== undefined) return undefined; // é preço/hora, não montante
  const m = normalizar(t).match(/(\d[\d\s.]*(?:,\d{1,2})?)\s*(?:€|eur|euros)\b/);
  if (m?.[1] === undefined) return undefined;
  const v = Number(m[1].replace(/[\s.]/g, '').replace(',', '.'));
  return Number.isFinite(v) && v > 0 ? v : undefined;
}

/** Data ISO explícita na frase. */
export function dataNaFrase(t: string): string | undefined {
  return t.match(/\b(20\d{2}-\d{2}-\d{2})\b/)?.[1];
}

/** Código de alerta mencionado (AL-XXX-YYY). */
export function codigoAlertaNaFrase(t: string): string | undefined {
  return t.match(/\bAL-[A-Z0-9-]+\b/i)?.[0].toUpperCase();
}

/**
 * Referência a um contrato em linguagem corrente: o número, se houver, ou o
 * texto que o descreve («de outsourcing da Alfa», «chave-na-mão»). É este texto
 * que a resolução por objeto/prestador vai usar.
 */
export function referenciaContratoNaFrase(t: string): string | undefined {
  const numero = numeroContratoNaFrase(t);
  if (numero !== undefined) return numero;
  const m =
    t.match(/\bcontrato\s+(?:de\s+|da\s+|do\s+)?([^?.,;]{3,60}?)(?=\s*[?.,;]|\s+(?:que|para|com|onde|quem|quanto)\b|$)/i) ??
    t.match(/\b(?:no|na|do|da)\s+(licenciamento|chave[- ]na[- ]mao|chave[- ]na[- ]mão)\b/i);
  const bruto = m?.[1]?.trim();
  return bruto !== undefined && bruto.length >= 3 ? bruto : undefined;
}

/** Texto a seguir a «perfil …», ou o papel referido em «mais um X». */
export function perfilNaFrase(t: string): string | undefined {
  const n = normalizar(t);
  const m =
    n.match(/perfil\s+(?:de\s+)?([a-z0-9 çãáàâéêíóõôú/-]{3,45}?)(?:\s*[?.,]|\s+(?:no|na|do|da|em|para|que|com)\b|$)/) ??
    n.match(/(?:mais\s+um|mais\s+uma|outro|outra|novo|nova)\s+([a-z0-9 çãáàâéêíóõôú/-]{3,45}?)(?:\s*[?.,]|\s+(?:no|na|do|da|em|para)\b|$)/);
  const bruto = m?.[1]?.trim();
  if (bruto === undefined || bruto.length < 3) return undefined;
  return bruto.replace(/\b(pessoas?|elementos?|recursos?)\b/g, '').trim() || undefined;
}

/** Texto a seguir a «projeto …». */
export function projetoNaFrase(t: string): string | undefined {
  const m = t.match(/projet[oa]\s+([^?.,;]{2,60}?)(?=\s*[?.,;]|$)/i);
  return m?.[1]?.trim();
}

/** Nomes próprios na frase (duas ou mais palavras capitalizadas seguidas). */
export function nomesNaFrase(t: string): string[] {
  return [...t.matchAll(/\b([A-ZÁÀÂÃÉÊÍÓÔÕÚÇ][a-záàâãéêíóôõúç]+(?:\s+(?:de|da|do|dos|das)\s+)?(?:\s+[A-ZÁÀÂÃÉÊÍÓÔÕÚÇ][a-záàâãéêíóôõúç]+)+)\b/g)]
    .map((m) => m[1]!)
    .filter((n) => !/^(Qual|Quanto|Quando|Onde|Que|Como|Preciso|Quero|Troca|Substitui|Afeta|Regista|Aprova|Dispensa|Prorroga|Transita)\b/.test(n));
}

/**
 * Primeiro nome isolado («a Carla», «o Diogo»). Só se procura quando não há
 * nome completo: é mais ambíguo, mas o diretório desambigua a seguir — e as
 * pessoas falam assim.
 */
export function nomeSimplesNaFrase(t: string): string | undefined {
  const palavras = t.trim().split(/\s+/);
  const candidatos = palavras
    .slice(1) // a primeira palavra é quase sempre o início da frase, não um nome
    .map((x) => x.replace(/[^A-Za-zÁÀÂÃÉÊÍÓÔÕÚÇáàâãéêíóôõúç]/g, ''))
    .filter((x) => x.length >= 3 && /^[A-ZÁÀÂÃÉÊÍÓÔÕÚÇ]/.test(x));
  return candidatos[candidatos.length - 1];
}

/** Perfil indicado em «para o perfil X do contrato Y». */
function perfilDeAto(t: string): string | undefined {
  const m = t.match(/perfil\s+(?:de\s+)?([^?.,;]{2,50}?)\s+(?:do|no|da|na)\s+(?:contrato\s+)?C[-\s]?\d{4}/i);
  return m?.[1]?.trim() ?? perfilNaFrase(t);
}

interface Padrao {
  capacidade: string;
  /** Cada grupo tem de ter pelo menos um termo presente. */
  termos: string[][];
  /** Termos que, se presentes, impedem este padrão. */
  excluir?: string[];
  extrair(frase: string): Record<string, unknown>;
  confianca: number;
}

/** Só inclui as chaves com valor — evita `undefined` a atropelar o contexto. */
const def = (o: Record<string, unknown>): Record<string, unknown> =>
  Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined));

const PADROES: Padrao[] = [
  // ─── AÇÕES ────────────────────────────────────────────────────────────────
  // Vêm primeiro: uma frase de substituição também menciona «perfil» e
  // «contrato», e não queremos que caia numa consulta.
  {
    capacidade: 'afetacao.substituir',
    termos: [['troca', 'trocar', 'substitui', 'substituir', 'trocas']],
    confianca: 0.85,
    extrair(frase) {
      const nomes = nomesNaFrase(frase);
      const porIndice = frase.search(/\bpor\b/i);
      const params: Record<string, unknown> = {
        contratoNumero: referenciaContratoNaFrase(frase),
        perfil: perfilDeAto(frase),
      };
      if (nomes.length >= 2 && porIndice > 0 && frase.indexOf(nomes[1]!) > porIndice) {
        params['pessoaSai'] = nomes[0]; params['pessoaEntra'] = nomes[1];
      } else if (nomes.length > 0) {
        params['pessoaEntra'] = nomes[0];
      }
      return def(params);
    },
  },
  {
    capacidade: 'afetacao.criar',
    termos: [['afeta', 'afetar', 'aloca', 'alocar', 'coloca', 'colocar', 'poe', 'poe ', 'por o', 'adiciona']],
    excluir: ['troca', 'substitui', 'onde', 'que contratos', 'folga'],
    confianca: 0.8,
    extrair: (frase) => def({
      contratoNumero: referenciaContratoNaFrase(frase),
      perfil: perfilDeAto(frase),
      pessoa: nomesNaFrase(frase)[0],
    }),
  },
  {
    capacidade: 'modificacao.prorrogar',
    termos: [['prorroga', 'prorrogar', 'prorrogacao', 'estender a vigencia', 'alargar o prazo']],
    confianca: 0.9,
    extrair: (frase) => def({ contratoNumero: referenciaContratoNaFrase(frase), novaDataTermino: dataNaFrase(frase) }),
  },
  {
    capacidade: 'modificacao.complementares',
    termos: [['complementar', 'complementares'], ['regista', 'registar', 'acrescenta', 'acrescentar', 'adiciona', 'adicionar']],
    confianca: 0.9,
    extrair: (frase) => def({ contratoNumero: referenciaContratoNaFrase(frase), valorEuros: montanteNaFrase(frase) }),
  },
  {
    capacidade: 'contrato.transitar-saldo',
    termos: [['transita', 'transitar', 'transicao'], ['saldo', 'ano', 'ano economico', 'ano seguinte']],
    confianca: 0.9,
    extrair: (frase) => def({
      contratoNumero: referenciaContratoNaFrase(frase),
      montanteEuros: montanteNaFrase(frase), executavelAte: dataNaFrase(frase),
    }),
  },
  {
    capacidade: 'registos.aprovar',
    termos: [['aprova', 'aprovar'], ['registo', 'registos', 'horas', 'tempo']],
    excluir: ['por aprovar', 'estao por', 'falta aprovar', 'tenho para'],
    confianca: 0.85,
    extrair: (frase) => def({ contratoNumero: referenciaContratoNaFrase(frase), pessoa: nomesNaFrase(frase)[0] }),
  },
  {
    capacidade: 'entregavel.registar-entrega',
    termos: [['entrega', 'entregue', 'entregar'], ['regista', 'registar', 'assinala', 'assinalar', 'marca', 'marcar']],
    confianca: 0.85,
    extrair(frase) {
      const m = frase.match(/entrega\s+d[oae]s?\s+([^?.,;]{3,60}?)(?=\s+(?:no|na|do|da)\s+(?:contrato\s+)?C[-\s]?\d{4}|\s*[?.,;]|$)/i);
      return def({ contratoNumero: referenciaContratoNaFrase(frase), entregavel: m?.[1]?.trim(), data: dataNaFrase(frase) });
    },
  },
  {
    capacidade: 'decisoes.dispensar',
    termos: [['dispensa', 'dispensar', 'adia', 'adiar', 'silencia', 'silenciar']],
    confianca: 0.9,
    extrair(frase) {
      const dias = normalizar(frase).match(/(\d{1,3})\s*dias?/);
      return def({
        contratoNumero: referenciaContratoNaFrase(frase), codigo: codigoAlertaNaFrase(frase),
        dias: dias?.[1] !== undefined ? Number(dias[1]) : undefined,
      });
    },
  },
  {
    capacidade: 'fatura.registar',
    termos: [['fatura', 'faturas'], ['validar', 'registar', 'conferir', 'lancar', 'valida', 'regista', 'confere']],
    excluir: ['estado', 'por conferir', 'quanto faturamos', 'estao'],
    confianca: 0.8,
    extrair: (frase) => def({ contratoNumero: referenciaContratoNaFrase(frase) }),
  },

  // ─── CONSULTAS TRANSVERSAIS ───────────────────────────────────────────────
  {
    capacidade: 'carteira.risco',
    termos: [['risco', 'em risco', 'preocupar', 'problematicos', 'problemas', 'exposto']],
    excluir: ['contrato c-'],
    confianca: 0.9,
    extrair: () => ({}),
  },
  {
    capacidade: 'carteira.terminam',
    termos: [['termina', 'terminam', 'acaba', 'acabam', 'expiram', 'fim da vigencia', 'caducam']],
    excluir: ['vigencia do', 'ate quando'],
    confianca: 0.85,
    extrair: () => ({}),
  },
  {
    capacidade: 'carteira.resumo',
    termos: [['carteira', 'no total', 'ao todo', 'globalmente'], ['quanto', 'resumo', 'total', 'contratado', 'situacao', 'retrato', 'financeiro']],
    confianca: 0.8,
    extrair: () => ({}),
  },
  {
    capacidade: 'capacidade.folga-por-valor-hora',
    termos: [['folga', 'comportar', 'cabe', 'espaco', 'onde', 'que contratos']],
    confianca: 0.9,
    extrair(frase) {
      const v = valorHoraNaFrase(frase);
      return v !== undefined ? { valorHoraEuros: v } : { __falha: true };
    },
  },
  {
    capacidade: 'capacidade.folga-por-perfil',
    termos: [['folga', 'comportar', 'cabe', 'colocar', 'alocar', 'afetar', 'onde', 'que contratos']],
    confianca: 0.85,
    extrair(frase) {
      const perfil = perfilNaFrase(frase);
      return perfil !== undefined ? def({ perfil, projeto: projetoNaFrase(frase) }) : { __falha: true };
    },
  },
  {
    capacidade: 'pessoa.onde-esta',
    termos: [['onde esta', 'onde trabalha', 'em que contratos', 'em que contrato', 'esta afeto', 'esta afeta', 'afetacoes d', 'trabalha a', 'trabalha o']],
    confianca: 0.85,
    extrair(frase) {
      const nome = nomesNaFrase(frase)[0] ?? nomeSimplesNaFrase(frase);
      return nome !== undefined ? { pessoa: nome } : { __falha: true };
    },
  },
  {
    capacidade: 'contrato.quem-esta',
    termos: [['quem esta', 'quem trabalha', 'quem anda', 'que pessoas', 'equipa d']],
    confianca: 0.85,
    extrair: (frase) => def({ contratoNumero: referenciaContratoNaFrase(frase) }),
  },
  {
    capacidade: 'registos.por-aprovar',
    termos: [
      ['registo', 'registos', 'horas', 'tempo', 'aprovar', 'aprovacao'],
      ['por aprovar', 'falta aprovar', 'pendentes', 'submetidos', 'tenho para aprovar', 'para aprovar'],
    ],
    confianca: 0.9,
    extrair: (frase) => def({ contratoNumero: referenciaContratoNaFrase(frase) }),
  },
  {
    capacidade: 'faturas.estado',
    termos: [['fatura', 'faturas', 'faturacao', 'faturamos', 'faturado']],
    excluir: ['registar', 'validar esta', 'conferir esta'],
    confianca: 0.85,
    extrair: (frase) => def({ contratoNumero: referenciaContratoNaFrase(frase) }),
  },
  {
    capacidade: 'entregaveis.estado',
    termos: [['entregavel', 'entregaveis']],
    excluir: ['regista', 'assinala', 'marca'],
    confianca: 0.85,
    extrair: (frase) => def({ contratoNumero: referenciaContratoNaFrase(frase) }),
  },
  {
    capacidade: 'orcamento.resumo',
    termos: [['orcamento', 'orcamentacao']],
    confianca: 0.9,
    extrair(frase) {
      const ano = frase.match(/(?<![-\w])(20\d{2})(?![-\w])/);
      return def({ ano: ano?.[1] !== undefined ? Number(ano[1]) : undefined });
    },
  },
  {
    capacidade: 'projeto.executado',
    termos: [['projeto', 'projecto'], ['gasto', 'gastou', 'gastei', 'gastamos', 'executado', 'consumido', 'despesa', 'ja se']],
    confianca: 0.9,
    extrair: (frase) => def({ projeto: projetoNaFrase(frase) }),
  },
  {
    capacidade: 'projeto.previsto',
    termos: [['projeto', 'projecto'], ['previsto', 'prever', 'investir', 'investimento', 'vamos gastar', 'futuro']],
    confianca: 0.9,
    extrair: (frase) => def({ projeto: projetoNaFrase(frase) }),
  },
  {
    capacidade: 'decisoes.explicar',
    termos: [['explica', 'explicar', 'porque', 'porque e que', 'razao'], ['decisao', 'alerta', 'sinalizado', 'al-']],
    confianca: 0.9,
    extrair: (frase) => def({ contratoNumero: referenciaContratoNaFrase(frase), codigo: codigoAlertaNaFrase(frase) }),
  },
  {
    capacidade: 'decisoes.pendentes',
    termos: [['decisao', 'decisoes', 'decidir', 'pendente', 'pendentes', 'urgent', 'preocupar', 'prioridade', 'alerta', 'alertas']],
    confianca: 0.85,
    extrair: (frase) => def({ contratoNumero: referenciaContratoNaFrase(frase) }),
  },

  // ─── CONSULTAS DE CONTRATO ────────────────────────────────────────────────
  {
    capacidade: 'contrato.complementares',
    termos: [['complementar', 'complementares', 'adicionais']],
    confianca: 0.9,
    extrair: (frase) => def({ contratoNumero: referenciaContratoNaFrase(frase) }),
  },
  {
    capacidade: 'contrato.vigencia',
    termos: [['vigencia', 'ate quando', 'prazo do contrato', 'quando termina']],
    confianca: 0.85,
    extrair: (frase) => def({ contratoNumero: referenciaContratoNaFrase(frase) }),
  },
  {
    capacidade: 'contrato.saldo',
    termos: [['saldo', 'por executar', 'falta gastar', 'falta executar', 'disponivel', 'sobra', 'resta', 'quanto tem']],
    confianca: 0.85,
    extrair: (frase) => def({ contratoNumero: referenciaContratoNaFrase(frase) }),
  },
  {
    capacidade: 'ajuda',
    termos: [['o que sabes', 'o que podes', 'em que me podes', 'ajuda', 'que funcoes', 'o que fazes']],
    confianca: 0.95,
    extrair: () => ({}),
  },
];

/**
 * Continuações elípticas: «e a vigência?», «e nesse?». Só valem quando já se
 * falou de alguma coisa — daí precisarem do contexto.
 */
function elipse(frase: string, contexto: ContextoConversa): Encaminhamento | undefined {
  const t = normalizar(frase).trim();
  if (!/^e\s+/.test(t) || t.length > 40) return undefined;
  if (contexto.contratoNumero === undefined && contexto.projetoNome === undefined) return undefined;

  const mapa: Array<[RegExp, string]> = [
    [/vigencia|prazo|ate quando/, 'contrato.vigencia'],
    [/saldo|por executar|disponivel/, 'contrato.saldo'],
    [/complementar/, 'contrato.complementares'],
    [/quem|equipa|pessoas/, 'contrato.quem-esta'],
    [/entregave/, 'entregaveis.estado'],
    [/fatura/, 'faturas.estado'],
    [/decisao|decisoes|alerta/, 'decisoes.pendentes'],
    [/previsto|investir/, 'projeto.previsto'],
    [/gasto|executado/, 'projeto.executado'],
  ];
  for (const [re, capacidade] of mapa) {
    if (re.test(t)) return { capacidade, parametros: {}, confianca: 0.7, origem: 'PADRAO' };
  }
  return undefined;
}

/**
 * Encaminha a frase. Devolve `undefined` quando nada bate — é aí, e só aí, que
 * o modelo entra.
 */
export function encaminhar(frase: string, contexto: ContextoConversa = {}): Encaminhamento | undefined {
  const t = normalizar(frase);

  for (const p of PADROES) {
    const bate = p.termos.every((grupo) => grupo.some((termo) => t.includes(normalizar(termo))));
    if (!bate) continue;
    if (p.excluir?.some((x) => t.includes(normalizar(x))) === true) continue;
    const parametros = p.extrair(frase);
    // O padrão bateu mas não conseguiu o que lhe era essencial (ex.: um
    // valor/hora): cede a vez ao padrão seguinte em vez de encaminhar mal.
    if (parametros['__falha'] === true) continue;
    return { capacidade: p.capacidade, parametros, confianca: p.confianca, origem: 'PADRAO' };
  }

  return elipse(frase, contexto);
}
