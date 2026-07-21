import type {
  Filtro,
  Ordenacao,
  Pagina,
  Paginacao,
  Repository,
} from '../tipos.js';

/**
 * Implementação genérica de `Repository<T>` em memória. Guarda cópias
 * defensivas (clonagem estrutural) para simular a fronteira de persistência —
 * o chamador nunca muta o documento guardado por referência.
 */
export class RepositorioMemoria<T extends { id: string }> implements Repository<T> {
  private readonly mapa = new Map<string, T>();

  constructor(private readonly nome: string) {}

  private clonar(entidade: T): T {
    return structuredClone(entidade);
  }

  async obter(id: string): Promise<T | null> {
    const e = this.mapa.get(id);
    return e === undefined ? null : this.clonar(e);
  }

  async todos(filtro?: Filtro<T>): Promise<T[]> {
    const lista = [...this.mapa.values()].map((e) => this.clonar(e));
    return filtro === undefined ? lista : lista.filter(filtro);
  }

  async listar(
    filtro: Filtro<T>,
    pagina: Paginacao,
    ordenacao?: Ordenacao<T>,
  ): Promise<Pagina<T>> {
    let lista = (await this.todos()).filter(filtro);
    if (ordenacao !== undefined) {
      const { campo, direcao } = ordenacao;
      lista = lista.sort((a, b) => {
        const va = a[campo];
        const vb = b[campo];
        const cmp = va < vb ? -1 : va > vb ? 1 : 0;
        return direcao === 'asc' ? cmp : -cmp;
      });
    }
    const total = lista.length;
    const inicio = (pagina.pagina - 1) * pagina.tamanho;
    const dados = lista.slice(inicio, inicio + pagina.tamanho);
    return { dados, total, pagina: pagina.pagina, tamanho: pagina.tamanho };
  }

  async guardar(entidade: T): Promise<void> {
    this.mapa.set(entidade.id, this.clonar(entidade));
  }

  async remover(id: string): Promise<void> {
    this.mapa.delete(id);
  }

  /** Número de documentos — auxiliar de teste/seed. */
  get tamanho(): number {
    return this.mapa.size;
  }

  toString(): string {
    return `RepositorioMemoria<${this.nome}>(${this.mapa.size})`;
  }
}
