import {
  RN_101, RN_201, RN_202, exigir,
  maquinaContrato, complementaresAcumulados, percentagemComplementares,
  calcularConsumoPerfil, valorPrevistoPerfil, vistoAssegurado, AgenteCCPStub,
  type Contrato, type EstadoContrato, type Alteracao, type Cent, type DataISO,
} from '@chora/domain';
import type { Contexto } from '../contexto.js';
import { ErroConflitoEstado, ErroNaoEncontrado, ErroValidacao } from '../erros/problema.js';
import type { ContextoUtilizador } from '../auth/token-validator.js';

export class ServicoContratos {
  constructor(private readonly ctx: Contexto) {}

  /**
   * Valida as invariantes de um contrato a criar/atualizar. O CHORA+ incide na
   * fase de execução: o lote não é obrigatório e não há dependência de unicidade
   * de lote (RN-102 deixa de se aplicar). Não há dotações.
   */
  async validar(contrato: Contrato): Promise<void> {
    const existentes = (await this.ctx.repos.contratos.todos()).filter((c) => c.id !== contrato.id);
    exigir(RN_101, { numero: contrato.numero, numerosExistentes: existentes.map((c) => c.numero) });
    exigir(RN_201, {
      dataInicioVigencia: contrato.dataInicioVigencia,
      dataTerminoContratual: contrato.dataTerminoContratual,
    });
    exigir(RN_202, {
      dataInicioVigencia: contrato.dataInicioVigencia,
      dataTerminoContratual: contrato.dataTerminoContratual,
      temExcecao: contrato.excecoes.some((e) => e.regra === 'RN-202'),
    });
    if (contrato.gestores.length === 0) {
      throw new ErroValidacao('O contrato tem de ter um gestor designado.');
    }
  }

  /** Um contrato que exija visto prévio do TdC só pode estar EM_VIGOR com o visto assegurado. */
  private exigirVistoParaVigor(contrato: Contrato): void {
    if (contrato.estado === 'EM_VIGOR' && !vistoAssegurado(contrato)) {
      throw new ErroValidacao('O contrato exige visto prévio do Tribunal de Contas e este não está assegurado (sem data de obtenção do visto nem visto tácito): não pode estar em vigor.');
    }
  }

  /** Cria um contrato após validação. */
  async criar(contrato: Contrato, u: ContextoUtilizador): Promise<Contrato> {
    await this.validar(contrato);
    this.exigirVistoParaVigor(contrato);
    await this.ctx.repos.contratos.guardar(contrato);
    await this.ctx.auditoria.registar({ utilizadorId: u.utilizadorId, entidade: 'Contrato', entidadeId: contrato.id, operacao: 'CRIAR', resultado: 'PERMITIDO', depois: contrato });
    return contrato;
  }

  /** Atualiza os dados editáveis de um contrato já carregado. */
  async atualizar(id: string, campos: Partial<Contrato>, u: ContextoUtilizador): Promise<Contrato> {
    const atual = await this.ctx.repos.contratos.obter(id);
    if (atual === null) throw new ErroNaoEncontrado(`Contrato ${id} inexistente.`);
    const atualizado: Contrato = { ...atual, ...campos, id: atual.id, atualizadoEm: this.ctx.relogio.agora(), atualizadoPor: u.utilizadorId };
    await this.validar(atualizado);
    await this.ctx.repos.contratos.guardar(atualizado);
    await this.ctx.auditoria.registar({ utilizadorId: u.utilizadorId, entidade: 'Contrato', entidadeId: id, operacao: 'ATUALIZAR', resultado: 'PERMITIDO', antes: atual, depois: atualizado });
    return atualizado;
  }

  /** Inativa um contrato com motivo obrigatório (estado terminal). */
  async inativar(id: string, estado: EstadoContrato, motivo: string, u: ContextoUtilizador): Promise<Contrato> {
    if (motivo.trim().length === 0) throw new ErroValidacao('A inativação exige a indicação do motivo.');
    const atual = await this.ctx.repos.contratos.obter(id);
    if (atual === null) throw new ErroNaoEncontrado(`Contrato ${id} inexistente.`);
    const atualizado: Contrato = { ...atual, estado, motivoInativacao: motivo, atualizadoEm: this.ctx.relogio.agora(), atualizadoPor: u.utilizadorId };
    await this.ctx.repos.contratos.guardar(atualizado);
    await this.ctx.auditoria.registar({ utilizadorId: u.utilizadorId, entidade: 'Contrato', entidadeId: id, operacao: `INATIVAR:${estado}`, resultado: 'PERMITIDO', antes: atual, depois: atualizado });
    return atualizado;
  }

  /**
   * Altera o estado do contrato para qualquer outro estado (correção/rollback),
   * mesmo a partir de estados terminais, com nota obrigatória. Não passa pela
   * máquina de estados: destina-se a corrigir enganos, ficando o histórico
   * registado na auditoria e a nota visível na ficha (feedback ronda 3).
   */
  async alterarEstado(id: string, novo: EstadoContrato, nota: string, u: ContextoUtilizador): Promise<Contrato> {
    if (nota.trim().length === 0) throw new ErroValidacao('A alteração de estado exige uma nota (motivo).');
    const atual = await this.ctx.repos.contratos.obter(id);
    if (atual === null) throw new ErroNaoEncontrado(`Contrato ${id} inexistente.`);
    const atualizado: Contrato = { ...atual, estado: novo, notaAlteracaoEstado: nota, atualizadoEm: this.ctx.relogio.agora(), atualizadoPor: u.utilizadorId };
    this.exigirVistoParaVigor(atualizado);
    await this.ctx.repos.contratos.guardar(atualizado);
    await this.ctx.auditoria.registar({ utilizadorId: u.utilizadorId, entidade: 'Contrato', entidadeId: id, operacao: `ALTERAR_ESTADO:${atual.estado}->${novo}`, resultado: 'PERMITIDO', antes: atual, depois: atualizado });
    return atualizado;
  }

  /**
   * Transita encargos por executar para o ano económico seguinte (contratos sem
   * portaria de extensão). A admissibilidade e o limite são validados pelo agente
   * CCP (legislação em vigor). O saldo transitado pode ser executado até à data
   * indicada. Regista uma alteração formal e auditoria.
   */
  async transitarAnoEconomico(id: string, montante: Cent, execucaoTransitadaAte: DataISO, fundamentacao: string, u: ContextoUtilizador): Promise<Contrato> {
    const contrato = await this.ctx.repos.contratos.obter(id);
    if (contrato === null) throw new ErroNaoEncontrado(`Contrato ${id} inexistente.`);
    if (fundamentacao.trim().length === 0) throw new ErroValidacao('A transição de ano económico exige fundamentação.');
    const aprovados = await this.ctx.repos.registosTempo.todos((r) => r.contratoId === id && r.estado === 'APROVADO');
    const executado = aprovados.reduce((s, r) => s + r.valorImputado, 0);
    const saldoPorExecutar = Math.max(0, contrato.precoContratualAtual - executado);
    const temPortariaExtensaoEncargos = contrato.portariaExtensaoEncargos !== undefined || contrato.numeroPortariaExtensaoEncargos !== undefined;

    const av = await new AgenteCCPStub().avaliarTransicaoAnoEconomico({
      precoContratualInicial: contrato.precoContratualInicial,
      precoContratualAtual: contrato.precoContratualAtual,
      saldoPorExecutar, temPortariaExtensaoEncargos, montantePretendido: montante,
    });
    if (!av.permitido) throw new ErroValidacao(av.motivo ?? 'Transição não permitida pela legislação em vigor.');

    const agora = this.ctx.relogio.agora();
    const atualizado: Contrato = {
      ...contrato,
      transicaoAnoEconomico: { montante, execucaoTransitadaAte, fundamentacao, autorizadoEm: agora.slice(0, 10) },
      atualizadoEm: agora, atualizadoPor: u.utilizadorId,
    };
    await this.ctx.repos.contratos.guardar(atualizado);
    const alt: Alteracao = {
      id: this.ctx.ids.novo('alt'), contratoId: id, tipo: 'TRANSICAO_ANO_ECONOMICO', dataEfeito: agora.slice(0, 10),
      descricao: `Transição de encargos para o ano seguinte; execução do saldo até ${execucaoTransitadaAte}.`,
      fundamentacao, valorAcrescido: montante,
      registadoEm: agora, registadoPor: u.utilizadorId, atualizadoEm: agora, atualizadoPor: u.utilizadorId,
    };
    await this.ctx.repos.alteracoes.guardar(alt);
    await this.ctx.auditoria.registar({ utilizadorId: u.utilizadorId, entidade: 'Contrato', entidadeId: id, operacao: 'TRANSICAO_ANO_ECONOMICO', resultado: 'PERMITIDO', antes: contrato, depois: atualizado });
    return atualizado;
  }

  async transitarEstado(id: string, novo: EstadoContrato, utilizador: ContextoUtilizador): Promise<Contrato> {
    const contrato = await this.ctx.repos.contratos.obter(id);
    if (contrato === null) throw new ErroNaoEncontrado(`Contrato ${id} inexistente.`);
    const t = maquinaContrato.transicaoPermitida(contrato.estado, novo, 'GESTOR');
    if (!t.permitida) throw new ErroConflitoEstado(t.motivo ?? 'Transição de estado inválida.');
    const atualizado: Contrato = { ...contrato, estado: novo, atualizadoEm: this.ctx.relogio.agora(), atualizadoPor: utilizador.utilizadorId };
    await this.ctx.repos.contratos.guardar(atualizado);
    await this.ctx.auditoria.registar({
      utilizadorId: utilizador.utilizadorId, entidade: 'Contrato', entidadeId: id,
      operacao: `ESTADO:${novo}`, resultado: 'PERMITIDO', antes: contrato, depois: atualizado,
    });
    return atualizado;
  }

  /** Resumo de execução física e financeira (secção 10.3). */
  async resumoExecucao(id: string): Promise<unknown> {
    const contrato = await this.ctx.repos.contratos.obter(id);
    if (contrato === null) throw new ErroNaoEncontrado(`Contrato ${id} inexistente.`);
    const perfis = await this.ctx.repos.perfis.todos((p) => p.contratoId === id);
    const alteracoes = await this.ctx.repos.alteracoes.todos((a) => a.contratoId === id);
    const aprovados = await this.ctx.repos.registosTempo.todos((r) => r.contratoId === id && r.estado === 'APROVADO');

    // Saldos por perfil: o foco é gerir horas e valor RESTANTES, não analisar a
    // execução física dos trabalhos (ver feedback de requisitos R3).
    const saldosPerfis = perfis.map((p) => {
      const consumo = calcularConsumoPerfil(p, aprovados);
      const valorPrevisto = valorPrevistoPerfil(p);
      return {
        perfilId: p.id,
        nome: p.nome,
        // Horas
        minutosPrevistos: p.quantidadePrevista,
        minutosConsumidos: consumo.minutosConsumidos,
        minutosRestantes: Math.max(0, p.quantidadePrevista - consumo.minutosConsumidos),
        // Valor
        valorPrevisto,
        valorConsumido: consumo.valorConsumido,
        valorRestante: Math.max(0, valorPrevisto - consumo.valorConsumido),
      };
    });

    // Estado do limite legal de trabalhos complementares (RN-301): 50% do valor
    // inicial do contrato.
    const acumulados = complementaresAcumulados(alteracoes);
    const limiteComplementares = Math.floor(contrato.precoContratualInicial * 0.5);
    const complementares = {
      acumulados,
      limite: limiteComplementares,
      percentagem: percentagemComplementares(contrato, alteracoes),
      atingido: acumulados >= limiteComplementares,
      disponivel: Math.max(0, limiteComplementares - acumulados),
    };

    // Terminologia CCP: "valor executado" (execução financeira do contrato).
    const valorExecutado = aprovados.reduce((s, r) => s + r.valorImputado, 0);
    return {
      contratoId: id,
      estado: contrato.estado,
      valorInicialContrato: contrato.precoContratualInicial,
      valorAtualContrato: contrato.precoContratualAtual,
      valorExecutado,
      valorDisponivel: Math.max(0, contrato.precoContratualAtual - valorExecutado),
      complementares,
      saldosPerfis,
    };
  }
}
