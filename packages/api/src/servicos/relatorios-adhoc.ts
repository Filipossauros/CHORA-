import type { Contexto } from '../contexto.js';
import type { PassoRelatorio, RelatorioAdHoc } from '../repositorios/memoria/index.js';
import { ErroNaoEncontrado, ErroValidacao } from '../erros/problema.js';
import type { ContextoUtilizador } from '../auth/token-validator.js';

/** O que é preciso para guardar uma pergunta composta como relatório. */
export interface NovoRelatorioAdHoc {
  titulo: string;
  tipoEntidade: string;
  passos: PassoRelatorio[];
  periodoRelativo: boolean;
}

/**
 * RELATÓRIOS AD-HOC — as perguntas compostas na conversa que o utilizador
 * mandou guardar para voltar a fazer.
 *
 * Não são um tipo de relatório a mais no catálogo: são relatórios que a
 * aplicação não sabia produzir e que alguém montou pergunta a pergunta. O que
 * fica guardado é a RECEITA — as funções e os parâmetros —, pelo que executá-la
 * responde sempre com os números de hoje. O retrato de um dia obtém-se
 * descarregando o Excel, que leva a data e a receita na segunda folha.
 *
 * Este serviço só trata da definição: guardar, listar, apagar. Executar vive à
 * parte (`relatorios-executar.ts`) porque precisa do catálogo de capacidades, e
 * o catálogo precisa deste serviço para guardar — mantê-los separados evita o
 * ciclo em vez de o esconder atrás de um import tardio.
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
    if (novo.passos.length === 0) {
      throw new ErroValidacao('Um relatório sem passos não se pode voltar a executar.');
    }
    const relatorio: RelatorioAdHoc = {
      id: this.ctx.ids.novo('rel'),
      titulo: novo.titulo,
      tipoEntidade: novo.tipoEntidade,
      passos: novo.passos.map((p) => ({ ...p, parametros: { ...p.parametros } })),
      periodoRelativo: novo.periodoRelativo,
      criadoEm: this.ctx.relogio.agora(),
      criadoPor: u.utilizadorId,
    };
    await this.ctx.repos.relatoriosAdHoc.guardar(relatorio);
    await this.ctx.auditoria.registar({
      utilizadorId: u.utilizadorId, entidade: 'RelatorioAdHoc', entidadeId: relatorio.id,
      operacao: 'CRIAR', resultado: 'PERMITIDO',
      depois: { titulo: relatorio.titulo, passos: relatorio.passos.map((p) => p.capacidade), periodoRelativo: relatorio.periodoRelativo },
    });
    return relatorio;
  }

  /**
   * Troca a leitura do período entre relativa e fixa.
   *
   * «Este ano» num relatório guardado em 2026 pode querer dizer o ano corrente
   * — e aí o relatório acompanha o calendário — ou 2026, e aí fecha sobre um
   * exercício. Só quem o guardou sabe qual das duas quis; a aplicação propõe a
   * leitura da frase e deixa trocar.
   */
  async definirPeriodoRelativo(id: string, relativo: boolean, u: ContextoUtilizador): Promise<RelatorioAdHoc> {
    const r = await this.obter(id);
    const atualizado: RelatorioAdHoc = { ...r, periodoRelativo: relativo };
    await this.ctx.repos.relatoriosAdHoc.guardar(atualizado);
    await this.ctx.auditoria.registar({
      utilizadorId: u.utilizadorId, entidade: 'RelatorioAdHoc', entidadeId: id,
      operacao: 'PERIODO', resultado: 'PERMITIDO', antes: { periodoRelativo: r.periodoRelativo }, depois: { periodoRelativo: relativo },
    });
    return atualizado;
  }

  /** Regista a execução na definição — serve de sinal de que os números mudaram. */
  async registarExecucao(id: string, linhas: number, u: ContextoUtilizador): Promise<void> {
    const r = await this.ctx.repos.relatoriosAdHoc.obter(id);
    if (r === null) return;
    await this.ctx.repos.relatoriosAdHoc.guardar({
      ...r, ultimaExecucao: { em: this.ctx.relogio.agora(), por: u.utilizadorId, linhas },
    });
  }

  async remover(id: string, u: ContextoUtilizador): Promise<void> {
    const r = await this.obter(id);
    await this.ctx.repos.relatoriosAdHoc.remover(id);
    await this.ctx.auditoria.registar({
      utilizadorId: u.utilizadorId, entidade: 'RelatorioAdHoc', entidadeId: id,
      operacao: 'REMOVER', resultado: 'PERMITIDO', antes: { titulo: r.titulo, passos: r.passos.length },
    });
  }
}
