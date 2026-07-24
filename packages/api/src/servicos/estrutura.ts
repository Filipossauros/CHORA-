import {
  RN_105, RN_110, RN_201, RN_202, RN_205, RN_206, RN_301, RN_303, RN_304, exigir, adicionarDias,
  totalPrevistoPerfis, valorPrevistoPerfil, complementaresAcumulados,
  periodosSuspensao, terminoExecucaoAjustado, mesesEntre, LIMITE_VIGENCIA_MESES,
  type PerfilContratual, type Alteracao, type DocumentoHabilitacao, type ExcecaoContrato,
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
    dados: {
      tipo: TipoAlteracao; dataEfeito: DataISO; descricao: string; fundamentacao: string;
      valorAcrescido?: Cent; novaDataTermino?: DataISO; reprogramacaoFinanceira?: boolean;
      suspensao?: Alteracao['suspensao'];
      novoPrestador?: { nome: string; nipc: string }; // CESSAO_POSICAO_CONTRATUAL
      novoGestorId?: string; // SUBSTITUICAO_GESTOR
      /** Fundamentação da exceção ao limite de 36 meses (RN-202/RN-204), quando aplicável. */
      excecaoVigencia?: string;
    },
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

    // PRORROGAÇÃO — alteração autónoma e fundamentada da data de término (RN-206).
    // Valida a nova data (RN-201) e o limite de 36 meses (RN-202, exceção fundamentável).
    if (dados.tipo === 'PRORROGACAO') {
      if (dados.novaDataTermino === undefined) throw new ErroValidacao('A prorrogação exige a nova data de vigência.');
      const contrato = await this.contrato(contratoId);
      exigir(RN_201, { dataInicioVigencia: contrato.dataInicioVigencia, dataTerminoContratual: dados.novaDataTermino });
      const temExcecao = contrato.excecoes.some((e) => e.regra === 'RN-202') || (dados.excecaoVigencia?.trim() ?? '') !== '';
      exigir(RN_202, { dataInicioVigencia: contrato.dataInicioVigencia, dataTerminoContratual: dados.novaDataTermino, temExcecao });
    }

    // SUSPENSÃO — os períodos não se podem sobrepor (RN-205).
    if (dados.tipo === 'SUSPENSAO') {
      if (dados.suspensao === undefined) throw new ErroValidacao('A suspensão exige a data de início.');
      const existentes = periodosSuspensao(await this.ctx.repos.alteracoes.todos((a) => a.contratoId === contratoId));
      exigir(RN_205, { suspensoes: [...existentes, { dataInicio: dados.suspensao.dataInicio, dataFim: dados.suspensao.dataFim, suspendePrazoExecucao: dados.suspensao.suspendePrazoExecucao }] });
    }

    // CESSÃO DA POSIÇÃO CONTRATUAL (modificação subjetiva, CCP art. 316.º e ss.).
    if (dados.tipo === 'CESSAO_POSICAO_CONTRATUAL') {
      if (dados.novoPrestador === undefined || dados.novoPrestador.nome.trim() === '' || dados.novoPrestador.nipc.trim() === '') {
        throw new ErroValidacao('A cessão da posição contratual exige o novo prestador (nome e NIPC).');
      }
    }

    // SUBSTITUIÇÃO DO GESTOR DO CONTRATO (CCP art. 290.º-A).
    if (dados.tipo === 'SUBSTITUICAO_GESTOR') {
      if (dados.novoGestorId === undefined || dados.novoGestorId.trim() === '') {
        throw new ErroValidacao('A substituição de gestor exige o novo gestor.');
      }
    }

    const agora = this.ctx.relogio.agora();
    const alt: Alteracao = {
      id: this.ctx.ids.novo('alt'), contratoId, tipo: dados.tipo, dataEfeito: dados.dataEfeito,
      descricao: dados.descricao, fundamentacao: dados.fundamentacao,
      ...(dados.valorAcrescido !== undefined ? { valorAcrescido: dados.valorAcrescido } : {}),
      ...(dados.novaDataTermino !== undefined ? { novaDataTermino: dados.novaDataTermino } : {}),
      ...(dados.reprogramacaoFinanceira !== undefined ? { reprogramacaoFinanceira: dados.reprogramacaoFinanceira } : {}),
      ...(dados.suspensao !== undefined ? { suspensao: dados.suspensao } : {}),
      ...(dados.novoPrestador !== undefined ? { novoPrestador: dados.novoPrestador } : {}),
      ...(dados.novoGestorId !== undefined ? { novoGestorId: dados.novoGestorId } : {}),
      registadoEm: agora, registadoPor: u.utilizadorId, atualizadoEm: agora, atualizadoPor: u.utilizadorId,
    };
    await this.ctx.repos.alteracoes.guardar(alt);

    // Serviços complementares atualizam o valor atual do contrato (sem dotações).
    if (dados.tipo === 'SERVICOS_COMPLEMENTARES' && dados.valorAcrescido !== undefined) {
      const contrato = await this.contrato(contratoId);
      await this.ctx.repos.contratos.guardar({ ...contrato, precoContratualAtual: contrato.precoContratualAtual + dados.valorAcrescido, atualizadoEm: agora, atualizadoPor: u.utilizadorId });
    }

    // Prorrogação: desloca o término contratual, preservando o término original e
    // registando a exceção fundamentada aos 36 meses, se necessária.
    if (dados.tipo === 'PRORROGACAO' && dados.novaDataTermino !== undefined) {
      const contrato = await this.contrato(contratoId);
      const excede = mesesEntre(contrato.dataInicioVigencia, dados.novaDataTermino) > LIMITE_VIGENCIA_MESES;
      const excecoes = this.comExcecaoVigencia(contrato.excecoes, 'RN-202', excede, dados.excecaoVigencia, u, agora);
      await this.ctx.repos.contratos.guardar({
        ...contrato,
        dataTerminoContratual: dados.novaDataTermino,
        dataTerminoOriginal: contrato.dataTerminoOriginal ?? contrato.dataTerminoContratual,
        excecoes,
        atualizadoEm: agora, atualizadoPor: u.utilizadorId,
      });
    }

    // Suspensão que desloca a execução: se a vigência projetada exceder 36 meses,
    // regista a exceção fundamentada (RN-204, consultiva — não bloqueia).
    if (dados.tipo === 'SUSPENSAO' && dados.suspensao?.suspendePrazoExecucao === true) {
      const contrato = await this.contrato(contratoId);
      const alteracoes = await this.ctx.repos.alteracoes.todos((a) => a.contratoId === contratoId);
      const projetada = mesesEntre(contrato.dataInicioVigencia, terminoExecucaoAjustado(contrato, alteracoes));
      const excede = projetada > LIMITE_VIGENCIA_MESES;
      const excecoes = this.comExcecaoVigencia(contrato.excecoes, 'RN-204', excede, dados.excecaoVigencia, u, agora);
      if (excecoes !== contrato.excecoes) {
        await this.ctx.repos.contratos.guardar({ ...contrato, excecoes, atualizadoEm: agora, atualizadoPor: u.utilizadorId });
      }
    }

    // Cessão da posição contratual: passa a vigorar o novo prestador.
    if (dados.tipo === 'CESSAO_POSICAO_CONTRATUAL' && dados.novoPrestador !== undefined) {
      const contrato = await this.contrato(contratoId);
      await this.ctx.repos.contratos.guardar({ ...contrato, prestador: { nome: dados.novoPrestador.nome, nipc: dados.novoPrestador.nipc }, atualizadoEm: agora, atualizadoPor: u.utilizadorId });
    }

    // Substituição do gestor: cessa o gestor principal atual e designa o novo.
    if (dados.tipo === 'SUBSTITUICAO_GESTOR' && dados.novoGestorId !== undefined) {
      const contrato = await this.contrato(contratoId);
      const dataDesignacao = dados.dataEfeito;
      const gestores = contrato.gestores.map((g) => (g.principal && g.cessouEm === undefined ? { ...g, principal: false, cessouEm: dataDesignacao } : g));
      gestores.push({ utilizadorId: dados.novoGestorId, principal: true, designadoEm: dataDesignacao });
      await this.ctx.repos.contratos.guardar({ ...contrato, gestores, atualizadoEm: agora, atualizadoPor: u.utilizadorId });
    }

    await this.ctx.auditoria.registar({ utilizadorId: u.utilizadorId, entidade: 'Alteracao', entidadeId: alt.id, operacao: `ALTERAR:${dados.tipo}`, resultado: 'PERMITIDO', depois: alt });
    return alt;
  }

  /** Acrescenta (idempotente) uma exceção fundamentada de vigência quando aplicável. */
  private comExcecaoVigencia(
    excecoes: ReadonlyArray<ExcecaoContrato>, regra: 'RN-202' | 'RN-204', excede: boolean,
    fundamentacao: string | undefined, u: ContextoUtilizador, agora: string,
  ): ExcecaoContrato[] {
    const fund = fundamentacao?.trim() ?? '';
    if (excede && fund !== '' && !excecoes.some((e) => e.regra === regra)) {
      return [...excecoes, { regra, fundamentacao: fund, autorizadoPor: u.utilizadorId, autorizadoEm: agora.slice(0, 10) }];
    }
    return excecoes as ExcecaoContrato[];
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
