import {
  RN_105, RN_110, RN_206, RN_301, RN_303, RN_304, exigir, adicionarDias,
  totalPrevistoPerfis, valorPrevistoPerfil, complementaresAcumulados,
  type PerfilContratual, type Alteracao, type DocumentoHabilitacao,
  type TipoDotacao, type TipoAlteracao, type Cent, type DataISO, type Minutos,
} from '@chora/domain';
import type { Contexto } from '../contexto.js';
import { ErroNaoEncontrado, ErroValidacao } from '../erros/problema.js';
import type { ContextoUtilizador } from '../auth/token-validator.js';

/**
 * Casos de uso da estrutura contratual: perfis (com série de preços, ADR-09),
 * alterações e documentos de habilitação. Não há dotações — o CHORA+ trabalha o
 * preço contratual total e os perfis (horas + valor/hora).
 */
export class ServicoEstrutura {
  constructor(private readonly ctx: Contexto) {}

  private async carregarPerfis(contratoId: string): Promise<PerfilContratual[]> {
    return this.ctx.repos.perfis.todos((p) => p.contratoId === contratoId);
  }
  private async contrato(contratoId: string) {
    const c = await this.ctx.repos.contratos.obter(contratoId);
    if (c === null) throw new ErroNaoEncontrado(`Contrato ${contratoId} inexistente.`);
    return c;
  }

  /** RN-105: valor previsto dos perfis ≤ valor atual do contrato (sem dotações). */
  private async validarTeto(contratoId: string, perfisFuturos: PerfilContratual[]): Promise<void> {
    const contrato = await this.contrato(contratoId);
    exigir(RN_105, {
      precoContratualAtual: contrato.precoContratualAtual,
      totalDotacoes: 0,
      totalPrevistoPerfis: totalPrevistoPerfis(perfisFuturos),
    });
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
    await this.validarTeto(contratoId, perfis);
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
    dados: { tipo: TipoAlteracao; dataEfeito: DataISO; descricao: string; fundamentacao: string; valorAcrescido?: Cent; novaDataTermino?: DataISO; suspensao?: Alteracao['suspensao'] },
    u: ContextoUtilizador,
  ): Promise<Alteracao> {
    exigir(RN_110, { fundamentacao: dados.fundamentacao, dataEfeito: dados.dataEfeito });
    // RN-206: complementares não prorrogam automaticamente a data de término.
    exigir(RN_206, { tipoAlteracao: dados.tipo, alteraDataTermino: dados.tipo === 'SERVICOS_COMPLEMENTARES' && dados.novaDataTermino !== undefined });

    // RN-301: os serviços complementares acumulados não podem exceder 50% do preço inicial.
    if (dados.tipo === 'SERVICOS_COMPLEMENTARES' && dados.valorAcrescido !== undefined) {
      const contrato = await this.contrato(contratoId);
      const jaAcumulado = complementaresAcumulados(await this.ctx.repos.alteracoes.todos((a) => a.contratoId === contratoId));
      exigir(RN_301, { precoContratualInicial: contrato.precoContratualInicial, complementaresAcumulados: jaAcumulado + dados.valorAcrescido });
    }

    const agora = this.ctx.relogio.agora();
    const alt: Alteracao = {
      id: this.ctx.ids.novo('alt'), contratoId, tipo: dados.tipo, dataEfeito: dados.dataEfeito,
      descricao: dados.descricao, fundamentacao: dados.fundamentacao,
      ...(dados.valorAcrescido !== undefined ? { valorAcrescido: dados.valorAcrescido } : {}),
      ...(dados.novaDataTermino !== undefined ? { novaDataTermino: dados.novaDataTermino } : {}),
      ...(dados.suspensao !== undefined ? { suspensao: dados.suspensao } : {}),
      registadoEm: agora, registadoPor: u.utilizadorId, atualizadoEm: agora, atualizadoPor: u.utilizadorId,
    };
    await this.ctx.repos.alteracoes.guardar(alt);

    // Serviços complementares atualizam o valor atual do contrato (sem dotações).
    if (dados.tipo === 'SERVICOS_COMPLEMENTARES' && dados.valorAcrescido !== undefined) {
      const contrato = await this.contrato(contratoId);
      await this.ctx.repos.contratos.guardar({ ...contrato, precoContratualAtual: contrato.precoContratualAtual + dados.valorAcrescido, atualizadoEm: agora, atualizadoPor: u.utilizadorId });
    }
    await this.ctx.auditoria.registar({ utilizadorId: u.utilizadorId, entidade: 'Alteracao', entidadeId: alt.id, operacao: `ALTERAR:${dados.tipo}`, resultado: 'PERMITIDO', depois: alt });
    return alt;
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
