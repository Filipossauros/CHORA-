/** Envelope de erro problem+json devolvido pela API (secção 8.2). */
export interface Problema {
  type: string;
  title: string;
  status: number;
  detail: string;
  regra?: string;
  requisito?: string;
  base?: string;
  dados?: Record<string, unknown>;
  excecaoFundamentavel?: boolean;
}

/** Envelope de paginação (secção 8.3). */
export interface Pagina<T> {
  dados: T[];
  total: number;
  pagina: number;
  tamanho: number;
}
