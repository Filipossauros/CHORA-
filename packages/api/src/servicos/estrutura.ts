import {
  RN_105, RN_110, RN_206, RN_303, RN_304, exigir, adicionarDias,
  totalDotacoes, totalPrevistoPerfis, valorPrevistoPerfil,
  type Dotacao, type PerfilContratual, type Alteracao, type DocumentoHabilitacao,
  type TipoDotacao, type TipoAlteracao, type Cent, type DataISO, type Minutos,
} from '@chora/domain';
import type { Contexto } from '../contexto.js';
import { ErroNaoEncontrado, ErroValidacao } from '../erros/problema.js';
import type { ContextoUtilizador } from '../auth/token-validator.js';

/**
 * Casos de uso da estrutura contratual: dotações, perfis (com série de preços,
 * ADR-09), alterações e documentos de habilitação.
 */
export class ServicoEstrutura {
  constructor(private readonly ctx: Contexto) {}

  private async carregarPerfis(contratoId: string): Promise<PerfilContratual[]> {
    return this.ctx.repos.perfis.todos((p) => p.contratoId === contratoId);
  }
  private async carregarDotacoes(contratoId: string): Promise<Dotacao[]> {
    return this.ctx.repos.dotacoes.todos((d) => d.contratoId === contratoId);
  }
  private async contrato(contratoId: string) {
    const c = await this.ctx.repos.contratos.obter(contratoId);
    if (c === null) throw new ErroNaoEncontrado(`Contrato ${contratoId} inexistente.`);
    return c;
  }

  /** RN-105: dotações + valor previsto de perfis ≤ valor atual do contrato. */
  private async validarTeto(contratoId: string, dotacoesFuturas: Dotacao[], perfisFuturos: PerfilContratual[]): Promise<void> {
    const contrato = await this.contrato(contratoId);
    exigir(RN_105, {
      precoContratualAtual: contrato.precoContratualAtual,
      totalDotacoes: totalDotacoes(dotacoesFuturas),
      totalPrevistoPerfis: totalPrevistoPerfis(perfisFuturos),
    });
  }

  async criarDotacao(contratoId: string, tipo: TipoDotacao, valor: Cent, horasTotais: Minutos | undefined, u: ContextoUtilizador): Promise<Dotacao> {
    const agora = this.ctx.relogio.agora();
    const dot: Dotacao = {
      id: this.ctx.ids.novo('dot'), contratoId, tipo, valor,
      ...(horasTotais !== undefined ? { horasTotais } : {}),
      criadoEm: agora, criadoPor: u.utilizadorId, atualizadoEm: agora, atualizadoPor: u.utilizadorId,
    };
    const dotacoes = [...(await this.carregarDotacoes(contratoId)), dot];
    await this.validarTeto(contratoId, dotacoes, await this.carregarPerfis(contratoId));
    await this.ctx.repos.dotacoes.guardar(dot);
    await this.ctx.auditoria.registar({ utilizadorId: u.utilizadorId, entidade: 'Dotacao', entidadeId: dot.id, operacao: 'CRIAR', resultado: 'PERMITIDO', depois: dot });
    return dot;
  }

  async criarPerfil(
    contratoId: string,
    dados: { nome: string; quantidadePrevista: Minutos; consomeBolsaValor: boolean; consomeTrabalhosComplementares: boolean; perfilDeGestao: boolean; valorHora: Cent; vigenteDe: DataISO },
    u: ContextoUtilizador,
  ): Promise<PerfilContratual> {
    const agora = this.ctx.relogio.agora();
    const perfil: PerfilContratual = {
      id: this.ctx.ids.novo('perf'), contratoId,
      nome: dados.nome, quantidadePrevista: dados.quantidadePrevista,
      consomeBolsaValor: dados.consomeBolsaValor, consomeTrabalhosComplementares: dados.consomeTrabalhosComplementares,
      perfilDeGestao: dados.perfilDeGestao,
      precos: [{ valorHora: dados.valorHora, vigenteDe: dados.vigenteDe }],
      criadoEm: agora, criadoPor: u.utilizadorId, atualizadoEm: agora, atualizadoPor: u.utilizadorId,
    };
    const perfis = [...(await this.carregarPerfis(contratoId)), perfil];
    await this.validarTeto(contratoId, await this.carregarDotacoes(contratoId), perfis);
    await this.ctx.repos.perfis.guardar(perfil);
    await this.ctx.auditoria.registar({ utilizadorId: u.utilizadorId, entidade: 'PerfilContratual', entidadeId: perfil.id, operacao: 'CRIAR', resultado: 'PERMITIDO', depois: perfil });
    return perfil;
  }

  /** Nova vigência de valor/hora (ADR-09): fecha a anterior e adiciona a nova. */
  async novoPrecoPerfil(perfilId: string, valorHora: Cent, vigenteDe: DataISO, u: ContextoUtilizador): Promise<PerfilContratual> {
    const perfil = await this.ctx.repos.perfis.obter(perfilId);
    if (perfil === null) throw new ErroNaoEncontrado(`Perfil ${perfilId} inexistente.`);
    const precos = perfil.precos.map((p) => (p.vigenteAte === undefined ? { ...p, vigenteAte: adicionarDias(vigenteDe, -1) } : p));
    precos.push({ valorHora, vigenteDe });
    const atualizado: PerfilContratual = { ...perfil, precos, atualizadoEm: this.ctx.relogio.agora(), atualizadoPor: u.utilizadorId };
    await this.ctx.repos.perfis.guardar(atualizado);
    await this.ctx.auditoria.registar({ utilizadorId: u.utilizadorId, entidade: 'PerfilContratual', entidadeId: perfilId, operacao: 'REVISAO_PRECO', resultado: 'PERMITIDO', depois: { valorHora, vigenteDe } });
    return atualizado;
  }

  async registarAlteracao(
    contratoId: string,
    dados: { tipo: TipoAlteracao; dataEfeito: DataISO; descricao: string; fundamentacao: string; valorAcrescido?: Cent; novaDataTermino?: DataISO; suspensao?: Alteracao['suspensao']; publicitacaoObrigatoria?: boolean },
    u: ContextoUtilizador,
  ): Promise<Alteracao> {
    exigir(RN_110, { fundamentacao: dados.fundamentacao, dataEfeito: dados.dataEfeito });
    // RN-206: complementares não prorrogam automaticamente a data de término.
    exigir(RN_206, { tipoAlteracao: dados.tipo, alteraDataTermino: dados.tipo === 'SERVICOS_COMPLEMENTARES' && dados.novaDataTermino !== undefined });

    const agora = this.ctx.relogio.agora();
    const alt: Alteracao = {
      id: this.ctx.ids.novo('alt'), contratoId, tipo: dados.tipo, dataEfeito: dados.dataEfeito,
      descricao: dados.descricao, fundamentacao: dados.fundamentacao,
      ...(dados.valorAcrescido !== undefined ? { valorAcrescido: dados.valorAcrescido } : {}),
      ...(dados.novaDataTermino !== undefined ? { novaDataTermino: dados.novaDataTermino } : {}),
      ...(dados.suspensao !== undefined ? { suspensao: dados.suspensao } : {}),
      ...(dados.publicitacaoObrigatoria ? { publicitacaoPortalBase: { obrigatoria: true } } : {}),
      registadoEm: agora, registadoPor: u.utilizadorId, atualizadoEm: agora, atualizadoPor: u.utilizadorId,
    };
    await this.ctx.repos.alteracoes.guardar(alt);

    // RN-305: serviços complementares criam dotação e atualizam o valor atual.
    if (dados.tipo === 'SERVICOS_COMPLEMENTARES' && dados.valorAcrescido !== undefined) {
      const contrato = await this.contrato(contratoId);
      const dot: Dotacao = {
        id: this.ctx.ids.novo('dot'), contratoId, tipo: 'TRABALHOS_COMPLEMENTARES', valor: dados.valorAcrescido,
        origemAlteracaoId: alt.id, criadoEm: agora, criadoPor: u.utilizadorId, atualizadoEm: agora, atualizadoPor: u.utilizadorId,
      };
      await this.ctx.repos.dotacoes.guardar(dot);
      await this.ctx.repos.contratos.guardar({ ...contrato, precoContratualAtual: contrato.precoContratualAtual + dados.valorAcrescido, atualizadoEm: agora, atualizadoPor: u.utilizadorId });
    }
    await this.ctx.auditoria.registar({ utilizadorId: u.utilizadorId, entidade: 'Alteracao', entidadeId: alt.id, operacao: `ALTERAR:${dados.tipo}`, resultado: 'PERMITIDO', depois: alt });
    return alt;
  }

  async registarPublicitacao(alteracaoId: string, referencia: string, u: ContextoUtilizador): Promise<Alteracao> {
    const alt = await this.ctx.repos.alteracoes.obter(alteracaoId);
    if (alt === null) throw new ErroNaoEncontrado(`Alteração ${alteracaoId} inexistente.`);
    const pub = alt.publicitacaoPortalBase ?? { obrigatoria: true };
    const atualizado: Alteracao = { ...alt, publicitacaoPortalBase: { ...pub, efetuadaEm: this.ctx.relogio.agora().slice(0, 10), referencia }, atualizadoEm: this.ctx.relogio.agora(), atualizadoPor: u.utilizadorId };
    await this.ctx.repos.alteracoes.guardar(atualizado);
    return atualizado;
  }

  async adicionarHabilitacao(contratoId: string, tipo: DocumentoHabilitacao['tipo'], emitidoEm: DataISO, validoAte: DataISO, referencia: string | undefined, u: ContextoUtilizador): Promise<DocumentoHabilitacao> {
    if (validoAte < emitidoEm) throw new ErroValidacao('A validade não pode ser anterior à emissão.');
    const agora = this.ctx.relogio.agora();
    const doc: DocumentoHabilitacao = {
      id: this.ctx.ids.novo('doc'), contratoId, tipo, emitidoEm, validoAte,
      ...(referencia !== undefined ? { referencia } : {}),
      criadoEm: agora, criadoPor: u.utilizadorId, atualizadoEm: agora, atualizadoPor: u.utilizadorId,
    };
    await this.ctx.repos.documentosHabilitacao.guardar(doc);
    await this.ctx.auditoria.registar({ utilizadorId: u.utilizadorId, entidade: 'DocumentoHabilitacao', entidadeId: doc.id, operacao: 'CRIAR', resultado: 'PERMITIDO', depois: doc });
    return doc;
  }

  /** Valida o tipo de dotação face ao perfil (RN-303/RN-304) — usado na UI e no registo. */
  validarTipoDotacaoPerfil(perfil: PerfilContratual, tipo: TipoDotacao): void {
    exigir(RN_303, { tipoDotacao: tipo, consomeBolsaValor: perfil.consomeBolsaValor });
    exigir(RN_304, { tipoDotacao: tipo, consomeTrabalhosComplementares: perfil.consomeTrabalhosComplementares });
  }

  /** Valor previsto de um perfil (para saldos na UI). */
  valorPrevisto(perfil: PerfilContratual): Cent {
    return valorPrevistoPerfil(perfil);
  }
}
