import type { Contexto } from '../contexto.js';
import type { RelatorioAdHoc } from '../repositorios/memoria/index.js';
import { ErroNaoEncontrado } from '../erros/problema.js';
import type { ContextoUtilizador } from '../auth/token-validator.js';

/** O que é preciso saber para guardar uma tabela composta no assistente. */
export interface NovoRelatorioAdHoc {
  titulo: string;
  tipoEntidade: string;
  colunas: string[];
  linhas: Array<Array<string | number>>;
  origem: Array<{ frase: string; capacidade: string }>;
}

/**
 * RELATÓRIOS AD-HOC — as tabelas compostas na conversa que o utilizador mandou
 * guardar.
 *
 * Não são um tipo de relatório a mais no catálogo: são relatórios que a
 * aplicação não sabia produzir e que alguém montou pergunta a pergunta. Por
 * isso guardam a proveniência ao lado dos dados — sem ela, ninguém que os
 * encontre daqui a três meses sabe o que está a ler.
 *
 * Apagar é um ato normal, não uma exceção: uma lista composta a meio de uma
 * dúvida deixa de interessar assim que a dúvida se resolve, e um separador de
 * relatórios que só cresce acaba por não se usar.
 */
export class ServicoRelatoriosAdHoc {
  constructor(private readonly ctx: Contexto) {}

  /** Do mais recente para o mais antigo — é a ordem por que se procuram. */
  async listar(): Promise<RelatorioAdHoc[]> {
    return (await this.ctx.repos.relatoriosAdHoc.todos()).sort((a, b) => (a.criadoEm < b.criadoEm ? 1 : -1));
  }

  async obter(id: string): Promise<RelatorioAdHoc> {
    const r = await this.ctx.repos.relatoriosAdHoc.obter(id);
    if (r === null) throw new ErroNaoEncontrado(`Relatório ${id} inexistente.`);
    return r;
  }

  async guardar(novo: NovoRelatorioAdHoc, u: ContextoUtilizador): Promise<RelatorioAdHoc> {
    const relatorio: RelatorioAdHoc = {
      id: this.ctx.ids.novo('rel'),
      titulo: novo.titulo,
      tipoEntidade: novo.tipoEntidade,
      colunas: [...novo.colunas],
      linhas: novo.linhas.map((l) => [...l]),
      origem: [...novo.origem],
      criadoEm: this.ctx.relogio.agora(),
      criadoPor: u.utilizadorId,
    };
    await this.ctx.repos.relatoriosAdHoc.guardar(relatorio);
    await this.ctx.auditoria.registar({
      utilizadorId: u.utilizadorId, entidade: 'RelatorioAdHoc', entidadeId: relatorio.id,
      operacao: 'CRIAR', resultado: 'PERMITIDO',
      depois: { titulo: relatorio.titulo, colunas: relatorio.colunas.length, linhas: relatorio.linhas.length },
    });
    return relatorio;
  }

  async remover(id: string, u: ContextoUtilizador): Promise<void> {
    const r = await this.obter(id);
    await this.ctx.repos.relatoriosAdHoc.remover(id);
    await this.ctx.auditoria.registar({
      utilizadorId: u.utilizadorId, entidade: 'RelatorioAdHoc', entidadeId: id,
      operacao: 'REMOVER', resultado: 'PERMITIDO', antes: { titulo: r.titulo, linhas: r.linhas.length },
    });
  }
}
