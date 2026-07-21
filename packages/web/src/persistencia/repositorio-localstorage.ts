import type {
  Filtro, Ordenacao, Pagina, Paginacao, Repository,
} from '@chora/api/nucleo';

/**
 * Implementação de `Repository<T>` sobre localStorage (ADR-03). Mantém um mapa em
 * memória hidratado do localStorage no arranque e persiste após cada escrita —
 * os dados criados no browser sobrevivem a recarregamentos (feedback: persistência).
 */
export class RepositorioLocalStorage<T extends { id: string }> implements Repository<T> {
  private readonly mapa = new Map<string, T>();
  private readonly chave: string;

  constructor(nome: string, prefixo = 'chora') {
    this.chave = `${prefixo}:${nome}`;
    this.hidratar();
  }

  private hidratar(): void {
    try {
      const bruto = localStorage.getItem(this.chave);
      if (bruto !== null) {
        const arr = JSON.parse(bruto) as T[];
        for (const e of arr) this.mapa.set(e.id, e);
      }
    } catch {
      /* localStorage indisponível ou corrompido — começa vazio */
    }
  }

  private persistir(): void {
    try {
      localStorage.setItem(this.chave, JSON.stringify([...this.mapa.values()]));
    } catch {
      /* quota excedida ou indisponível — mantém em memória */
    }
  }

  private clonar(e: T): T {
    return structuredClone(e);
  }

  async obter(id: string): Promise<T | null> {
    const e = this.mapa.get(id);
    return e === undefined ? null : this.clonar(e);
  }

  async todos(filtro?: Filtro<T>): Promise<T[]> {
    const lista = [...this.mapa.values()].map((e) => this.clonar(e));
    return filtro === undefined ? lista : lista.filter(filtro);
  }

  async listar(filtro: Filtro<T>, pagina: Paginacao, ordenacao?: Ordenacao<T>): Promise<Pagina<T>> {
    let lista = (await this.todos()).filter(filtro);
    if (ordenacao !== undefined) {
      const { campo, direcao } = ordenacao;
      lista = lista.sort((a, b) => {
        const va = a[campo]; const vb = b[campo];
        const cmp = va < vb ? -1 : va > vb ? 1 : 0;
        return direcao === 'asc' ? cmp : -cmp;
      });
    }
    const total = lista.length;
    const inicio = (pagina.pagina - 1) * pagina.tamanho;
    return { dados: lista.slice(inicio, inicio + pagina.tamanho), total, pagina: pagina.pagina, tamanho: pagina.tamanho };
  }

  async guardar(entidade: T): Promise<void> {
    this.mapa.set(entidade.id, this.clonar(entidade));
    this.persistir();
  }

  async remover(id: string): Promise<void> {
    this.mapa.delete(id);
    this.persistir();
  }

  limpar(): void {
    this.mapa.clear();
    try { localStorage.removeItem(this.chave); } catch { /* ignora */ }
  }
}
