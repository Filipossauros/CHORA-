/**
 * PERÍODOS EM LINGUAGEM CORRENTE.
 *
 * Metade das perguntas de gestão tem recorte temporal — «este ano», «no próximo
 * trimestre», «em maio», «nos últimos três meses» — e sem isto o assistente
 * obrigava a datas ISO, que ninguém diz em voz alta.
 *
 * É determinístico de propósito. Datas são das coisas que um modelo pequeno erra
 * com mais frequência e menos aviso: bastam-lhe um ano trocado ou um mês a mais
 * para a resposta ficar errada sem parecer errada.
 */

export interface Periodo {
  de: string;
  ate: string;
  /** Como se diz o período, para a resposta poder repeti-lo. */
  rotulo: string;
}

const MESES = [
  'janeiro', 'fevereiro', 'marco', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
];

const dois = (n: number): string => String(n).padStart(2, '0');
const dia1 = (ano: number, mes: number): string => `${ano}-${dois(mes)}-01`;
/** Último dia do mês, sem depender de tabelas: o dia 0 do mês seguinte. */
const ultimoDia = (ano: number, mes: number): string => {
  const d = new Date(Date.UTC(ano, mes, 0));
  return d.toISOString().slice(0, 10);
};

const normalizar = (t: string): string => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Desloca uma data ISO N meses, mantendo o dia 1. */
function mesesAtras(hoje: string, meses: number): { ano: number; mes: number } {
  const d = new Date(`${hoje}T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() - meses);
  return { ano: d.getUTCFullYear(), mes: d.getUTCMonth() + 1 };
}

const trimestre = (ano: number, q: number): Periodo => ({
  de: dia1(ano, (q - 1) * 3 + 1),
  ate: ultimoDia(ano, q * 3),
  rotulo: `${q}.º trimestre de ${ano}`,
});

/**
 * Interpreta o período mencionado na frase. Devolve `undefined` quando não há
 * menção nenhuma — e nesse caso quem chama decide o que fazer, em vez de se
 * assumir um intervalo que o utilizador não pediu.
 */
export function periodoNaFrase(frase: string, hoje: string): Periodo | undefined {
  const t = normalizar(frase);
  const anoAtual = Number(hoje.slice(0, 4));
  const mesAtual = Number(hoje.slice(5, 7));

  if (/\beste ano\b|\bno ano corrente\b|\bdeste ano\b/.test(t)) {
    return { de: dia1(anoAtual, 1), ate: ultimoDia(anoAtual, 12), rotulo: `${anoAtual}` };
  }
  if (/\bano passado\b|\bano anterior\b/.test(t)) {
    return { de: dia1(anoAtual - 1, 1), ate: ultimoDia(anoAtual - 1, 12), rotulo: `${anoAtual - 1}` };
  }
  if (/\bpr[oó]ximo ano\b|\bano que vem\b|\bano seguinte\b/.test(t)) {
    return { de: dia1(anoAtual + 1, 1), ate: ultimoDia(anoAtual + 1, 12), rotulo: `${anoAtual + 1}` };
  }
  if (/\beste m[eê]s\b|\bdeste m[eê]s\b/.test(t)) {
    return { de: dia1(anoAtual, mesAtual), ate: ultimoDia(anoAtual, mesAtual), rotulo: `${MESES[mesAtual - 1]} de ${anoAtual}` };
  }
  if (/\bm[eê]s passado\b|\bm[eê]s anterior\b/.test(t)) {
    const { ano, mes } = mesesAtras(hoje, 1);
    return { de: dia1(ano, mes), ate: ultimoDia(ano, mes), rotulo: `${MESES[mes - 1]} de ${ano}` };
  }

  const ultimos = t.match(/[uú]ltimos?\s+(\d{1,2})\s+(mes|meses|dias?|anos?)/);
  if (ultimos?.[1] !== undefined) {
    const n = Number(ultimos[1]);
    const unidade = ultimos[2]!;
    if (unidade.startsWith('dia')) {
      const d = new Date(`${hoje}T00:00:00Z`);
      d.setUTCDate(d.getUTCDate() - n);
      return { de: d.toISOString().slice(0, 10), ate: hoje, rotulo: `últimos ${n} dias` };
    }
    if (unidade.startsWith('ano')) {
      return { de: dia1(anoAtual - n, 1), ate: hoje, rotulo: `últimos ${n} ano(s)` };
    }
    const { ano, mes } = mesesAtras(hoje, n);
    return { de: dia1(ano, mes), ate: hoje, rotulo: `últimos ${n} meses` };
  }

  const tri = t.match(/\b([1-4])\.?[ºo]?\s*trimestre(?:\s+de\s+(\d{4}))?/) ?? t.match(/\bq([1-4])\b(?:\s+de\s+(\d{4}))?/);
  if (tri?.[1] !== undefined) return trimestre(tri[2] !== undefined ? Number(tri[2]) : anoAtual, Number(tri[1]));
  if (/\bpr[oó]ximo trimestre\b/.test(t)) {
    const q = Math.floor((mesAtual - 1) / 3) + 2;
    return q > 4 ? trimestre(anoAtual + 1, 1) : trimestre(anoAtual, q);
  }
  if (/\beste trimestre\b/.test(t)) return trimestre(anoAtual, Math.floor((mesAtual - 1) / 3) + 1);

  // «em maio», «em março de 2027».
  for (const [i, nome] of MESES.entries()) {
    const re = new RegExp(`\\b(?:em|de|durante)\\s+${nome}(?:\\s+de\\s+(\\d{4}))?\\b`);
    const m = t.match(re);
    if (m !== null) {
      const ano = m[1] !== undefined ? Number(m[1]) : anoAtual;
      return { de: dia1(ano, i + 1), ate: ultimoDia(ano, i + 1), rotulo: `${nome} de ${ano}` };
    }
  }

  // Um ano isolado — só quando não é um número de contrato («C-2026-001»).
  const ano = frase.match(/(?<![-\w])(20\d{2})(?![-\w])/);
  if (ano?.[1] !== undefined) {
    const a = Number(ano[1]);
    return { de: dia1(a, 1), ate: ultimoDia(a, 12), rotulo: `${a}` };
  }

  return undefined;
}

/**
 * A frase pede um período RELATIVO à data em que é feita?
 *
 * Interessa a quem guarda uma pergunta para a repetir: «que contratos terminam
 * este ano?» guardada em 2026 e executada em 2027 pode querer dizer 2026 (o
 * exercício que se fechou) ou 2027 (o ano em que se está). Só quem guarda sabe,
 * mas a aplicação tem de propor a leitura certa por omissão.
 *
 * Descobre-se sem léxico novo: resolve-se o período com duas datas de referência
 * afastadas um ano. Se o resultado mudar, a expressão era relativa; se não
 * mudar, era uma data ou um ano concretos. É a própria função de interpretação a
 * responder, pelo que nunca fica dessincronizada dela.
 */
export function periodoERelativo(frase: string, hoje: string): boolean {
  const agora = periodoNaFrase(frase, hoje);
  if (agora === undefined) return false;
  const d = new Date(`${hoje}T00:00:00Z`);
  d.setUTCFullYear(d.getUTCFullYear() + 1);
  const daqui = periodoNaFrase(frase, d.toISOString().slice(0, 10));
  return daqui === undefined || daqui.de !== agora.de || daqui.ate !== agora.ate;
}

/** Período por omissão: o ano civil corrente. */
export function anoCorrente(hoje: string): Periodo {
  const a = Number(hoje.slice(0, 4));
  return { de: dia1(a, 1), ate: ultimoDia(a, 12), rotulo: `${a}` };
}
