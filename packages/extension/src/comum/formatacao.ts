/**
 * Formatadores partilhados (secção 10.4). A conversão de cêntimos para EUR e de
 * minutos para `Hh MMm` é responsabilidade da UI; a API devolve valores tipados.
 */

/** Cêntimos → EUR (ex.: 5050 → "50,50 €"). */
export function formatarMoeda(cent: number): string {
  return new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR' }).format(cent / 100);
}

/** Minutos → "Hh MMm" (ex.: 135 → "2h 15m"). */
export function formatarDuracao(minutos: number): string {
  const h = Math.floor(minutos / 60);
  const m = minutos % 60;
  if (h === 0) return `${m}m`;
  return `${h}h ${String(m).padStart(2, '0')}m`;
}

/** Percentagem 0..1 → "42%". */
export function formatarPercentagem(fracao: number): string {
  return `${Math.round(fracao * 100)}%`;
}
