import {
  RN_111, RN_112, exigir,
  valorDaPercentagem, percentagemDoValor, repartirChaveNaMao,
  type Contrato, type Entregavel, type Cent, type DataISO,
} from '@chora/domain';
import type { Contexto } from '../contexto.js';
import { ErroNaoEncontrado, ErroValidacao } from '../erros/problema.js';
import type { ContextoUtilizador } from '../auth/token-validator.js';

/**
 * Entregáveis dos contratos CHAVE-NA-MÃO. O preço fixo reparte-se por
 * entregáveis; cada um vale uma fatia do contrato, indicada em euros ou em
 * percentagem. O registo guarda sempre AMBAS as formas, mas o valor é o que
 * manda na faturação (RN-609).
 */
export class ServicoEntregaveis {
  constructor(private readonly ctx: Contexto) {}

  private async contrato(contratoId: string): Promise<Contrato> {
    const c = await this.ctx.repos.contratos.obter(contratoId);
    if (c === null) throw new ErroNaoEncontrado(`Contrato ${contratoId} inexistente.`);
    return c;
  }

  private async obter(id: string): Promise<Entregavel> {
    const e = await this.ctx.repos.entregaveis.obter(id);
    if (e === null) throw new ErroNaoEncontrado(`Entregável ${id} inexistente.`);
    return e;
  }

  async listar(contratoId: string): Promise<Entregavel[]> {
    const lista = await this.ctx.repos.entregaveis.todos((e) => e.contratoId === contratoId);
    return lista.sort((a, b) => a.ordem - b.ordem);
  }

  /** Repartição do preço entre entregáveis e bolsa de horas, para a UI. */
  async reparticao(contratoId: string) {
    const c = await this.contrato(contratoId);
    return repartirChaveNaMao(c.precoContratualAtual, await this.listar(contratoId), c.bolsaHorasValor ?? 0);
  }

  /**
   * Valida o teto: entregáveis + bolsa de horas não podem exceder o preço
   * contratual (RN-112). `excluirId` permite recalcular numa edição.
   */
  private async validarTeto(contrato: Contrato, novoValor: Cent, excluirId?: string): Promise<void> {
    const outros = (await this.listar(contrato.id)).filter((e) => e.id !== excluirId);
    exigir(RN_112, {
      precoContratualAtual: contrato.precoContratualAtual,
      totalEntregaveis: outros.reduce((s, e) => s + e.valor, 0) + novoValor,
      bolsaHorasValor: contrato.bolsaHorasValor ?? 0,
    });
  }

  /**
   * Resolve o valor a partir de euros OU de percentagem. Pelo menos um tem de
   * vir preenchido; se vierem os dois, o valor em euros prevalece.
   */
  private resolverValor(contrato: Contrato, dados: { valor?: Cent; percentagemContrato?: number }): { valor: Cent; percentagemContrato: number } {
    if (dados.valor !== undefined && dados.valor > 0) {
      return { valor: dados.valor, percentagemContrato: percentagemDoValor(contrato.precoContratualAtual, dados.valor) };
    }
    if (dados.percentagemContrato !== undefined && dados.percentagemContrato > 0) {
      const valor = valorDaPercentagem(contrato.precoContratualAtual, dados.percentagemContrato);
      return { valor, percentagemContrato: dados.percentagemContrato };
    }
    throw new ErroValidacao('Indique o valor do entregável em euros ou a percentagem do contrato que representa.');
  }

  async criar(
    contratoId: string,
    dados: { designacao: string; descricao?: string; valor?: Cent; percentagemContrato?: number; dataPrevista?: DataISO },
    u: ContextoUtilizador,
  ): Promise<Entregavel> {
    const contrato = await this.contrato(contratoId);
    if (contrato.tipologia !== 'CHAVE_NA_MAO') {
      throw new ErroValidacao('Só os contratos chave-na-mão têm entregáveis. Num contrato de bolsa de horas o que se regista são perfis.');
    }
    if (dados.designacao.trim() === '') throw new ErroValidacao('Indique a designação do entregável.');

    const { valor, percentagemContrato } = this.resolverValor(contrato, dados);
    await this.validarTeto(contrato, valor);

    const existentes = await this.listar(contratoId);
    const agora = this.ctx.relogio.agora();
    const entregavel: Entregavel = {
      id: this.ctx.ids.novo('ent'), contratoId,
      ordem: existentes.length > 0 ? Math.max(...existentes.map((e) => e.ordem)) + 1 : 1,
      designacao: dados.designacao.trim(),
      ...(dados.descricao !== undefined && dados.descricao.trim() !== '' ? { descricao: dados.descricao.trim() } : {}),
      valor, percentagemContrato,
      ...(dados.dataPrevista !== undefined ? { dataPrevista: dados.dataPrevista } : {}),
      entregue: false,
      criadoEm: agora, criadoPor: u.utilizadorId, atualizadoEm: agora, atualizadoPor: u.utilizadorId,
    };
    await this.ctx.repos.entregaveis.guardar(entregavel);
    await this.ctx.auditoria.registar({ utilizadorId: u.utilizadorId, entidade: 'Entregavel', entidadeId: entregavel.id, operacao: 'CRIAR', resultado: 'PERMITIDO', depois: entregavel });
    return entregavel;
  }

  async atualizar(
    id: string,
    dados: { designacao?: string; descricao?: string; valor?: Cent; percentagemContrato?: number; dataPrevista?: DataISO },
    u: ContextoUtilizador,
  ): Promise<Entregavel> {
    const atual = await this.obter(id);
    if (atual.faturaId !== undefined) throw new ErroValidacao('O entregável já foi faturado e não pode ser alterado.');
    const contrato = await this.contrato(atual.contratoId);

    const temNovoValor = (dados.valor !== undefined && dados.valor > 0) || (dados.percentagemContrato !== undefined && dados.percentagemContrato > 0);
    const { valor, percentagemContrato } = temNovoValor
      ? this.resolverValor(contrato, dados)
      : { valor: atual.valor, percentagemContrato: atual.percentagemContrato };
    if (temNovoValor) await this.validarTeto(contrato, valor, id);

    const atualizado: Entregavel = {
      ...atual,
      ...(dados.designacao !== undefined && dados.designacao.trim() !== '' ? { designacao: dados.designacao.trim() } : {}),
      ...(dados.descricao !== undefined ? { descricao: dados.descricao } : {}),
      ...(dados.dataPrevista !== undefined ? { dataPrevista: dados.dataPrevista } : {}),
      valor, percentagemContrato,
      atualizadoEm: this.ctx.relogio.agora(), atualizadoPor: u.utilizadorId,
    };
    await this.ctx.repos.entregaveis.guardar(atualizado);
    await this.ctx.auditoria.registar({ utilizadorId: u.utilizadorId, entidade: 'Entregavel', entidadeId: id, operacao: 'ATUALIZAR', resultado: 'PERMITIDO', antes: atual, depois: atualizado });
    return atualizado;
  }

  /**
   * Assinala a entrega — é o facto gerador da faturação (RN-608). Sem isto o
   * entregável não pode ser faturado.
   */
  async registarEntrega(id: string, entregueEm: DataISO, nota: string | undefined, u: ContextoUtilizador): Promise<Entregavel> {
    const atual = await this.obter(id);
    const agora = this.ctx.relogio.agora();
    const atualizado: Entregavel = {
      ...atual, entregue: true, entregueEm, registadoEntreguePor: u.utilizadorId,
      ...(nota !== undefined && nota.trim() !== '' ? { notaEntrega: nota.trim() } : {}),
      atualizadoEm: agora, atualizadoPor: u.utilizadorId,
    };
    await this.ctx.repos.entregaveis.guardar(atualizado);
    await this.ctx.auditoria.registar({ utilizadorId: u.utilizadorId, entidade: 'Entregavel', entidadeId: id, operacao: 'REGISTAR_ENTREGA', resultado: 'PERMITIDO', antes: atual, depois: atualizado });
    return atualizado;
  }

  /** Reverte a entrega (correção). Bloqueado depois de faturado. */
  async anularEntrega(id: string, motivo: string, u: ContextoUtilizador): Promise<Entregavel> {
    const atual = await this.obter(id);
    if (atual.faturaId !== undefined) throw new ErroValidacao('O entregável já foi faturado: não é possível anular a entrega.');
    if (motivo.trim() === '') throw new ErroValidacao('A anulação da entrega exige a indicação do motivo.');
    const atualizado: Entregavel = {
      ...atual, entregue: false, entregueEm: undefined, registadoEntreguePor: undefined,
      notaEntrega: motivo.trim(), atualizadoEm: this.ctx.relogio.agora(), atualizadoPor: u.utilizadorId,
    };
    await this.ctx.repos.entregaveis.guardar(atualizado);
    await this.ctx.auditoria.registar({ utilizadorId: u.utilizadorId, entidade: 'Entregavel', entidadeId: id, operacao: 'ANULAR_ENTREGA', resultado: 'PERMITIDO', antes: atual, depois: atualizado });
    return atualizado;
  }

  async remover(id: string, u: ContextoUtilizador): Promise<void> {
    const atual = await this.obter(id);
    if (atual.faturaId !== undefined) throw new ErroValidacao('O entregável já foi faturado e não pode ser removido.');
    await this.ctx.repos.entregaveis.remover(id);
    await this.ctx.auditoria.registar({ utilizadorId: u.utilizadorId, entidade: 'Entregavel', entidadeId: id, operacao: 'REMOVER', resultado: 'PERMITIDO', antes: atual });
  }

  /** Define o valor da bolsa de horas de um contrato chave-na-mão. */
  async definirBolsaHoras(contratoId: string, valor: Cent, u: ContextoUtilizador): Promise<Contrato> {
    const contrato = await this.contrato(contratoId);
    if (contrato.tipologia !== 'CHAVE_NA_MAO') {
      throw new ErroValidacao('A bolsa de horas como componente só existe em contratos chave-na-mão.');
    }
    const entregaveis = await this.listar(contratoId);
    exigir(RN_112, {
      precoContratualAtual: contrato.precoContratualAtual,
      totalEntregaveis: entregaveis.reduce((s, e) => s + e.valor, 0),
      bolsaHorasValor: valor,
    });
    const atualizado: Contrato = { ...contrato, bolsaHorasValor: valor, atualizadoEm: this.ctx.relogio.agora(), atualizadoPor: u.utilizadorId };
    await this.ctx.repos.contratos.guardar(atualizado);
    await this.ctx.auditoria.registar({ utilizadorId: u.utilizadorId, entidade: 'Contrato', entidadeId: contratoId, operacao: 'DEFINIR_BOLSA_HORAS', resultado: 'PERMITIDO', antes: contrato, depois: atualizado });
    return atualizado;
  }

  /** Valida a estrutura de um contrato chave-na-mão (RN-111 e RN-112). */
  async validarEstrutura(contratoId: string): Promise<void> {
    const contrato = await this.contrato(contratoId);
    const entregaveis = await this.listar(contratoId);
    exigir(RN_111, {
      tipologia: contrato.tipologia ?? 'BOLSA_HORAS',
      numeroEntregaveis: entregaveis.length,
      entregaveisSemValor: entregaveis.filter((e) => e.valor <= 0).length,
    });
    exigir(RN_112, {
      precoContratualAtual: contrato.precoContratualAtual,
      totalEntregaveis: entregaveis.reduce((s, e) => s + e.valor, 0),
      bolsaHorasValor: contrato.bolsaHorasValor ?? 0,
    });
  }
}
