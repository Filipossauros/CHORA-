import {
  proporOrcamento, recalcularLinha, resumirOrcamento,
  diaDeInstante,
  type LinhaOrcamento, type ResumoOrcamento,
} from '@chora/domain';
import type { Contexto } from '../contexto.js';
import type { OrcamentoGuardado, Projeto } from '../repositorios/memoria/index.js';
import { ErroConflitoEstado, ErroNaoEncontrado, ErroValidacao } from '../erros/problema.js';
import type { ContextoUtilizador } from '../auth/token-validator.js';

/** Orçamento com os totais já calculados, que é como interessa lê-lo. */
export interface OrcamentoComResumo {
  orcamento: OrcamentoGuardado;
  resumo: ResumoOrcamento;
  projetos: Projeto[];
}

export class ServicoOrcamentos {
  constructor(private readonly ctx: Contexto) {}

  private async carregar(id: string): Promise<OrcamentoGuardado> {
    const o = await this.ctx.repos.orcamentos.obter(id);
    if (o === null) throw new ErroNaoEncontrado(`Orçamento ${id} inexistente.`);
    return o;
  }

  private exigirAberto(o: OrcamentoGuardado): void {
    if (o.estado === 'FECHADO') {
      throw new ErroConflitoEstado('O orçamento está fechado: reabra-o para o alterar.');
    }
  }

  async listar(): Promise<OrcamentoGuardado[]> {
    return (await this.ctx.repos.orcamentos.todos()).sort((a, b) => b.ano - a.ano);
  }

  /**
   * Cria o orçamento de um ano PROPONDO as linhas a partir da carteira.
   *
   * A proposta não é um rascunho vazio: é a carteira projetada no ano seguinte,
   * com cada contrato classificado como continuidade, substituição ou renovação.
   * O que se pede ao gestor é o delta, não a lista.
   */
  async criar(ano: number, u: ContextoUtilizador): Promise<OrcamentoComResumo> {
    const existente = (await this.ctx.repos.orcamentos.todos((o) => o.ano === ano))[0];
    if (existente !== undefined) throw new ErroValidacao(`Já existe um orçamento para ${ano}.`);

    const linhas = await this.propor(ano);
    const agora = this.ctx.relogio.agora();
    const orcamento: OrcamentoGuardado = {
      id: this.ctx.ids.novo('orc'), ano, estado: 'EM_PREPARACAO', linhas,
      criadoEm: agora, criadoPor: u.utilizadorId, atualizadoEm: agora, atualizadoPor: u.utilizadorId,
    };
    await this.ctx.repos.orcamentos.guardar(orcamento);
    await this.ctx.auditoria.registar({ utilizadorId: u.utilizadorId, entidade: 'Orcamento', entidadeId: orcamento.id, operacao: 'CRIAR', resultado: 'PERMITIDO', depois: { ano, linhas: linhas.length } });
    return this.comResumo(orcamento);
  }

  /** Linhas propostas para um ano, sem guardar — usado na criação e na reposição. */
  async propor(ano: number): Promise<LinhaOrcamento[]> {
    const [contratos, perfis, aprovados, entregaveis, associacoes] = await Promise.all([
      this.ctx.repos.contratos.todos(),
      this.ctx.repos.perfis.todos(),
      this.ctx.repos.registosTempo.todos((r) => r.estado === 'APROVADO'),
      this.ctx.repos.entregaveis.todos(),
      this.ctx.repos.contratoProjetos.todos(),
    ]);
    const porContrato = new Map<string, string[]>();
    for (const a of associacoes) porContrato.set(a.contratoId, [...(porContrato.get(a.contratoId) ?? []), a.projetoId]);
    return proporOrcamento(
      ano, contratos, perfis, aprovados, entregaveis,
      (contratoId) => porContrato.get(contratoId) ?? [],
      diaDeInstante(this.ctx.relogio.agora()),
    );
  }

  async obter(id: string): Promise<OrcamentoComResumo> {
    return this.comResumo(await this.carregar(id));
  }

  /** Substitui uma linha (o gestor mexeu nos perfis, nas licenças ou nos entregáveis). */
  async guardarLinha(id: string, linha: LinhaOrcamento, u: ContextoUtilizador): Promise<OrcamentoComResumo> {
    const o = await this.carregar(id);
    this.exigirAberto(o);
    const recalculada = recalcularLinha(linha, o.ano);
    const existe = o.linhas.some((l) => l.id === linha.id);
    const linhas = existe
      ? o.linhas.map((l) => (l.id === linha.id ? recalculada : l))
      : [...o.linhas, recalculada];
    return this.persistir({ ...o, linhas }, u, 'LINHA:GUARDAR', { linhaId: linha.id });
  }

  async removerLinha(id: string, linhaId: string, u: ContextoUtilizador): Promise<OrcamentoComResumo> {
    const o = await this.carregar(id);
    this.exigirAberto(o);
    return this.persistir({ ...o, linhas: o.linhas.filter((l) => l.id !== linhaId) }, u, 'LINHA:REMOVER', { linhaId });
  }

  /**
   * Fecha o orçamento. Não valida a competência do CA: um orçamento acima do
   * limite é um facto a levar a decisão, não um erro a impedir — o que a
   * aplicação deve é dizê-lo em cima da mesa, e diz (RN-115).
   */
  async fechar(id: string, u: ContextoUtilizador): Promise<OrcamentoComResumo> {
    const o = await this.carregar(id);
    this.exigirAberto(o);
    const agora = this.ctx.relogio.agora();
    return this.persistir({ ...o, estado: 'FECHADO', fechadoEm: agora }, u, 'FECHAR');
  }

  async reabrir(id: string, u: ContextoUtilizador): Promise<OrcamentoComResumo> {
    const o = await this.carregar(id);
    if (o.estado !== 'FECHADO') throw new ErroConflitoEstado('O orçamento já está em preparação.');
    const { fechadoEm: _, ...resto } = o;
    return this.persistir({ ...resto, estado: 'EM_PREPARACAO' }, u, 'REABRIR');
  }

  private async persistir(o: OrcamentoGuardado, u: ContextoUtilizador, operacao: string, extra?: Record<string, unknown>): Promise<OrcamentoComResumo> {
    const atualizado: OrcamentoGuardado = { ...o, atualizadoEm: this.ctx.relogio.agora(), atualizadoPor: u.utilizadorId };
    await this.ctx.repos.orcamentos.guardar(atualizado);
    await this.ctx.auditoria.registar({ utilizadorId: u.utilizadorId, entidade: 'Orcamento', entidadeId: o.id, operacao, resultado: 'PERMITIDO', ...(extra !== undefined ? { depois: extra } : {}) });
    return this.comResumo(atualizado);
  }

  private async comResumo(o: OrcamentoGuardado): Promise<OrcamentoComResumo> {
    return { orcamento: o, resumo: resumirOrcamento(o.ano, o.linhas), projetos: await this.ctx.repos.projetos.todos() };
  }
}
