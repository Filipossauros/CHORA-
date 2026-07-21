/**
 * Interfaces de repositório (ADR-03). A implementação é em memória no protótipo;
 * a substituição por MongoDB não deve tocar em domínio nem em rotas.
 */

export interface Paginacao {
  pagina: number;
  tamanho: number;
}

export interface Pagina<T> {
  dados: T[];
  total: number;
  pagina: number;
  tamanho: number;
}

/** Predicado de filtro sobre a entidade. */
export type Filtro<T> = (entidade: T) => boolean;

export interface Ordenacao<T> {
  campo: keyof T;
  direcao: 'asc' | 'desc';
}

export interface Repository<T extends { id: string }> {
  obter(id: string): Promise<T | null>;
  listar(filtro: Filtro<T>, pagina: Paginacao, ordenacao?: Ordenacao<T>): Promise<Pagina<T>>;
  todos(filtro?: Filtro<T>): Promise<T[]>;
  guardar(entidade: T): Promise<void>;
  remover(id: string): Promise<void>;
}

export const TAMANHO_MAXIMO_PAGINA = 200;

export function normalizarPaginacao(pagina?: number, tamanho?: number): Paginacao {
  const p = pagina !== undefined && pagina > 0 ? Math.floor(pagina) : 1;
  const t =
    tamanho !== undefined && tamanho > 0
      ? Math.min(Math.floor(tamanho), TAMANHO_MAXIMO_PAGINA)
      : 50;
  return { pagina: p, tamanho: t };
}
