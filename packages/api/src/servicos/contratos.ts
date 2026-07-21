import {
  RN_101, RN_102, RN_106, RN_107, RN_108, RN_201, RN_202, exigir,
  maquinaContrato, complementaresAcumulados, percentagemComplementares,
  calcularConsumoPerfil, valorPrevistoPerfil, totalDotacoes,
  type Contrato, type EstadoContrato,
} from '@chora/domain';
import type { Contexto } from '../contexto.js';
import { ErroConflitoEstado, ErroNaoEncontrado } from '../erros/problema.js';
import type { ContextoUtilizador } from '../auth/token-validator.js';

export class ServicoContratos {
  constructor(private readonly ctx: Contexto) {}

  /** Valida as invariantes estruturais de um contrato a criar/atualizar. */
  async validar(contrato: Contrato): Promise<void> {
    const existentes = (await this.ctx.repos.contratos.todos()).filter((c) => c.id !== contrato.id);
    exigir(RN_101, { numero: contrato.numero, numerosExistentes: existentes.map((c) => c.numero) });
    exigir(RN_102, {
      loteId: contrato.loteId,
      contratosNoLote: existentes.filter((c) => c.loteId === contrato.loteId).map((c) => c.id),
    });
    exigir(RN_201, {
      dataInicioVigencia: contrato.dataInicioVigencia,
      dataTerminoContratual: contrato.dataTerminoContratual,
    });
    exigir(RN_202, {
      dataInicioVigencia: contrato.dataInicioVigencia,
      dataTerminoContratual: contrato.dataTerminoContratual,
      temExcecao: contrato.excecoes.some((e) => e.regra === 'RN-202'),
    });
    exigir(RN_107, { gestores: contrato.gestores, dataInicioVigencia: contrato.dataInicioVigencia });
    exigir(RN_108, { gestores: contrato.gestores });
    const dotacoes = await this.ctx.repos.dotacoes.todos((d) => d.contratoId === contrato.id);
    if (dotacoes.length > 0) {
      exigir(RN_106, { dotacoes });
    }
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
    const dotacoes = await this.ctx.repos.dotacoes.todos((d) => d.contratoId === id);
    const alteracoes = await this.ctx.repos.alteracoes.todos((a) => a.contratoId === id);
    const aprovados = await this.ctx.repos.registosTempo.todos((r) => r.contratoId === id && r.estado === 'APROVADO');

    const execucaoPerfis = perfis.map((p) => {
      const consumo = calcularConsumoPerfil(p, aprovados);
      return {
        perfilId: p.id, nome: p.nome,
        minutosDisponiveis: consumo.minutosDisponiveis,
        minutosConsumidos: consumo.minutosConsumidos,
        minutosPorTipo: consumo.minutosPorTipo,
        valorPrevisto: valorPrevistoPerfil(p),
        valorConsumido: consumo.valorConsumido,
        percentagemHoras: consumo.percentagemHoras,
      };
    });

    const valorImputadoTotal = aprovados.reduce((s, r) => s + r.valorImputado, 0);
    return {
      contratoId: id, estado: contrato.estado,
      precoContratualInicial: contrato.precoContratualInicial,
      precoContratualAtual: contrato.precoContratualAtual,
      totalDotacoes: totalDotacoes(dotacoes),
      complementaresAcumulados: complementaresAcumulados(alteracoes),
      percentagemComplementares: percentagemComplementares(contrato, alteracoes),
      valorImputadoTotal,
      execucaoFisica: execucaoPerfis,
    };
  }
}
