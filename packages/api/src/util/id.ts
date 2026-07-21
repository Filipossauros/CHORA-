/**
 * Gerador de identificadores. No protótipo usa um contador com prefixo, o que
 * torna o seed determinístico (secção 12.1). Em produção, substituir por ObjectId
 * do MongoDB ou UUID.
 */
export interface GeradorId {
  novo(prefixo: string): string;
}

export function criarGeradorSequencial(): GeradorId {
  const contadores = new Map<string, number>();
  return {
    novo(prefixo: string): string {
      const n = (contadores.get(prefixo) ?? 0) + 1;
      contadores.set(prefixo, n);
      return `${prefixo}-${String(n).padStart(5, '0')}`;
    },
  };
}
