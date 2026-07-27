import { DateTime } from 'luxon';
import type { DataISO, InstanteISO, MesISO } from './primitivos.js';

/**
 * Fronteira temporal do domínio (secção 15).
 *
 * Toda a aritmética de calendário passa pela Luxon com fuso explícito. Proibido
 * `new Date()` disperso pelo código. Uma única fábrica `agora()`, injetável,
 * permite aos testes fixar o tempo.
 */

export const FUSO_LISBOA = 'Europe/Lisbon';

/** Relógio injetável: devolve o instante atual em UTC. */
export interface Relogio {
  agora(): InstanteISO;
}

/** Relógio de sistema por omissão. */
export const relogioSistema: Relogio = {
  agora(): InstanteISO {
    const iso = DateTime.utc().toISO();
    // DateTime.utc() é sempre válido; a asserção documenta a invariante.
    return iso as InstanteISO;
  },
};

/** Relógio fixo para testes determinísticos. */
export function relogioFixo(instante: InstanteISO): Relogio {
  const normalizado = DateTime.fromISO(instante, { setZone: true }).toUTC().toISO();
  if (normalizado === null) {
    throw new Error(`Instante inválido para relógio fixo: ${instante}`);
  }
  return { agora: () => normalizado };
}

// -------------------------------------------------------------------------
// Conversões e extrações — sempre com fuso explícito
// -------------------------------------------------------------------------

/** Converte uma DataISO em DateTime no início do dia, no fuso de Lisboa. */
export function dataParaDateTime(data: DataISO): DateTime {
  return DateTime.fromISO(data, { zone: FUSO_LISBOA }).startOf('day');
}

/** Converte um InstanteISO em DateTime UTC. */
export function instanteParaDateTime(instante: InstanteISO): DateTime {
  return DateTime.fromISO(instante, { setZone: true }).toUTC();
}

/**
 * Extrai o dia de calendário (DataISO) de um InstanteISO no fuso de Lisboa.
 * NUNCA fazer o inverso (DataISO -> instante): introduz ambiguidade de fuso.
 */
export function diaDeInstante(instante: InstanteISO): DataISO {
  const d = instanteParaDateTime(instante).setZone(FUSO_LISBOA).toISODate();
  if (d === null) {
    throw new Error(`Instante inválido: ${instante}`);
  }
  return d;
}

/** Extrai o mês de calendário (MesISO) de uma DataISO. */
export function mesDeData(data: DataISO): MesISO {
  return data.slice(0, 7);
}

// -------------------------------------------------------------------------
// Predicados de calendário de negócio
// -------------------------------------------------------------------------

/** Verdadeiro se a data cai a sábado ou domingo. */
export function ehFimDeSemana(data: DataISO): boolean {
  const wd = dataParaDateTime(data).weekday; // 1=segunda ... 7=domingo
  return wd === 6 || wd === 7;
}

/**
 * Feriados nacionais fixos de Portugal (independentes do ano).
 * Os feriados móveis (Páscoa, Carnaval, Corpo de Deus, Sexta-feira Santa) são
 * configuráveis por ano através do parâmetro `feriadosMoveis`.
 */
export const FERIADOS_FIXOS_PT: ReadonlyArray<string> = [
  '01-01', // Ano Novo
  '04-25', // Dia da Liberdade
  '05-01', // Dia do Trabalhador
  '06-10', // Dia de Portugal
  '08-15', // Assunção de Nossa Senhora
  '10-05', // Implantação da República
  '11-01', // Todos os Santos
  '12-01', // Restauração da Independência
  '12-08', // Imaculada Conceição
  '12-25', // Natal
];

/** Verdadeiro se a data é feriado nacional (fixo ou móvel configurado). */
export function ehFeriado(
  data: DataISO,
  feriadosMoveis: ReadonlyArray<DataISO> = [],
): boolean {
  const mmdd = data.slice(5);
  return FERIADOS_FIXOS_PT.includes(mmdd) || feriadosMoveis.includes(data);
}

/** Verdadeiro se a data é dia útil (não fim de semana e não feriado). */
export function ehDiaUtil(data: DataISO, feriadosMoveis: ReadonlyArray<DataISO> = []): boolean {
  return !ehFimDeSemana(data) && !ehFeriado(data, feriadosMoveis);
}

// -------------------------------------------------------------------------
// Aritmética de datas contratuais
// -------------------------------------------------------------------------

/**
 * Adiciona meses a uma DataISO com semântica de fim de mês da Luxon
 * (31 de janeiro + 1 mês = 28/29 de fevereiro), preservando o ano bissexto.
 */
export function adicionarMeses(data: DataISO, meses: number): DataISO {
  const r = dataParaDateTime(data).plus({ months: meses }).toISODate();
  if (r === null) {
    throw new Error(`Data inválida: ${data}`);
  }
  return r;
}

/** Adiciona dias a uma DataISO. */
export function adicionarDias(data: DataISO, dias: number): DataISO {
  const r = dataParaDateTime(data).plus({ days: dias }).toISODate();
  if (r === null) {
    throw new Error(`Data inválida: ${data}`);
  }
  return r;
}

/** Número de meses inteiros (fracionários) entre duas datas. */
export function mesesEntre(inicio: DataISO, fim: DataISO): number {
  return dataParaDateTime(fim).diff(dataParaDateTime(inicio), 'months').months;
}

/** Número de dias de calendário entre duas datas. */
export function diasEntre(inicio: DataISO, fim: DataISO): number {
  return Math.round(dataParaDateTime(fim).diff(dataParaDateTime(inicio), 'days').days);
}

/**
 * Dias úteis no intervalo `]inicio, fim]` — o que resta de tempo de trabalho, e
 * não de calendário. Devolve 0 se `fim` não for posterior a `inicio`.
 */
export function diasUteisEntre(inicio: DataISO, fim: DataISO, feriadosMoveis: ReadonlyArray<DataISO> = []): number {
  if (fim <= inicio) return 0;
  let dias = 0;
  let d = adicionarDias(inicio, 1);
  while (d <= fim) {
    if (ehDiaUtil(d, feriadosMoveis)) dias += 1;
    d = adicionarDias(d, 1);
  }
  return dias;
}

/** Horas de trabalho por dia útil — a mesma base do dashboard de capacidade. */
export const HORAS_DIA_UTIL = 8;
/** Dias úteis por mês (261 dias úteis/ano ÷ 12), para exprimir prazos longos. */
export const DIAS_UTEIS_MES = 22;

/** Converte minutos de trabalho em dias úteis equivalentes (8 h = 1 dia). */
export function diasUteisDeMinutos(minutos: number): number {
  return Math.round(minutos / (60 * HORAS_DIA_UTIL));
}

/**
 * Exprime dias úteis em linguagem de gestão: abaixo de um mês conta-se em dias;
 * a partir daí em meses e dias, porque «94 dias úteis» não se lê de imediato.
 */
export function formatarDiasUteis(diasUteis: number): string {
  const d = Math.max(0, Math.round(diasUteis));
  if (d < DIAS_UTEIS_MES) return `${d} ${d === 1 ? 'dia' : 'dias'}`;
  const meses = Math.floor(d / DIAS_UTEIS_MES);
  const resto = d % DIAS_UTEIS_MES;
  const parteMeses = `${meses} ${meses === 1 ? 'mês' : 'meses'}`;
  return resto === 0 ? parteMeses : `${parteMeses} e ${resto} ${resto === 1 ? 'dia' : 'dias'}`;
}

/** Comparação de DataISO: negativo se a<b, 0 se igual, positivo se a>b. */
export function compararDatas(a: DataISO, b: DataISO): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Verdadeiro se `data` está no intervalo inclusivo [de, ate]; `ate` opcional (aberto). */
export function dentroDoIntervalo(data: DataISO, de: DataISO, ate?: DataISO): boolean {
  if (data < de) {
    return false;
  }
  if (ate !== undefined && data > ate) {
    return false;
  }
  return true;
}

/** Ano civil de uma DataISO. */
export function anoDeData(data: DataISO): number {
  return Number.parseInt(data.slice(0, 4), 10);
}
