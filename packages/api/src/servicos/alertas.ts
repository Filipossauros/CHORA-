import { adicionarDias, diaDeInstante, decisoesPendentes, saudeContrato, type Alerta, type SeveridadeAlerta } from '@chora/domain';
import type { Contexto } from '../contexto.js';
import { ErroNaoEncontrado, ErroValidacao } from '../erros/problema.js';
import type { ContextoUtilizador } from '../auth/token-validator.js';

/**
 * Ciclo de vida das decisões (alertas). O gestor pode marcar em curso, dispensar
 * por um período com motivo, ou reabrir. A resolução automática por ato — quando
 * a transição, a modificação ou a substituição são registadas — é feita por
 * `resolverPorAto`, chamada pelos serviços de negócio.
 */
export class ServicoAlertas {
  constructor(private readonly ctx: Contexto) {}

  private async obter(id: string): Promise<Alerta> {
    const a = await this.ctx.repos.alertas.obter(id);
    if (a === null) throw new ErroNaoEncontrado(`Alerta ${id} inexistente.`);
    return a;
  }

  /** Decisões que exigem atenção (abertas ou em curso), opcionalmente de um contrato. */
  async pendentes(contratoId?: string): Promise<Alerta[]> {
    const todos = await this.ctx.repos.alertas.todos(
      contratoId !== undefined ? (a) => a.contratoId === contratoId : undefined,
    );
    return decisoesPendentes(todos);
  }

  /** Saúde agregada de um contrato a partir das decisões pendentes. */
  async saude(contratoId: string): Promise<SeveridadeAlerta | null> {
    return saudeContrato(await this.ctx.repos.alertas.todos((a) => a.contratoId === contratoId));
  }

  /** Marca a decisão como em curso (o gestor abriu uma opção ou guardou recomendação). */
  async marcarEmCurso(id: string, u: ContextoUtilizador): Promise<Alerta> {
    const atual = await this.obter(id);
    if (atual.estado === 'RESOLVIDA') throw new ErroValidacao('A decisão já está resolvida.');
    const atualizado: Alerta = { ...atual, estado: 'EM_CURSO', atualizadoEm: this.ctx.relogio.agora() };
    await this.ctx.repos.alertas.guardar(atualizado);
    await this.ctx.auditoria.registar({ utilizadorId: u.utilizadorId, entidade: 'Alerta', entidadeId: id, operacao: 'ALERTA:EM_CURSO', resultado: 'PERMITIDO', antes: atual, depois: atualizado });
    return atualizado;
  }

  /**
   * Dispensa a decisão por um período, com motivo obrigatório. Reabre quando o
   * período caduca ou se a severidade agravar (ver `reconciliarAlertas`).
   */
  async dispensar(id: string, motivo: string, dias: number, u: ContextoUtilizador): Promise<Alerta> {
    if (motivo.trim().length === 0) throw new ErroValidacao('A dispensa exige a indicação do motivo.');
    if (!Number.isFinite(dias) || dias <= 0) throw new ErroValidacao('Indique um período de dispensa (> 0 dias).');
    const atual = await this.obter(id);
    if (atual.estado === 'RESOLVIDA') throw new ErroValidacao('A decisão já está resolvida.');
    const hoje = diaDeInstante(this.ctx.relogio.agora());
    const atualizado: Alerta = {
      ...atual, estado: 'DISPENSADA', motivoDispensa: motivo,
      dispensadaAte: adicionarDias(hoje, Math.floor(dias)),
      atualizadoEm: this.ctx.relogio.agora(),
    };
    await this.ctx.repos.alertas.guardar(atualizado);
    await this.ctx.auditoria.registar({ utilizadorId: u.utilizadorId, entidade: 'Alerta', entidadeId: id, operacao: 'ALERTA:DISPENSAR', resultado: 'PERMITIDO', antes: atual, depois: atualizado });
    return atualizado;
  }

  /** Reabre uma decisão dispensada ou resolvida. */
  async reabrir(id: string, u: ContextoUtilizador): Promise<Alerta> {
    const atual = await this.obter(id);
    const atualizado: Alerta = {
      ...atual, estado: 'ABERTA',
      dispensadaAte: undefined, motivoDispensa: undefined,
      resolvidaEm: undefined, motivoResolucao: undefined,
      atualizadoEm: this.ctx.relogio.agora(),
    };
    await this.ctx.repos.alertas.guardar(atualizado);
    await this.ctx.auditoria.registar({ utilizadorId: u.utilizadorId, entidade: 'Alerta', entidadeId: id, operacao: 'ALERTA:REABRIR', resultado: 'PERMITIDO', antes: atual, depois: atualizado });
    return atualizado;
  }

  /**
   * SUPRESSÃO AUTOMÁTICA: fecha as decisões pendentes de um contrato cujos
   * códigos são satisfeitos pelo ato registado. Chamada pelos serviços de
   * negócio — registar a transição fecha a decisão de transição, sem passo
   * manual do utilizador.
   */
  async resolverPorAto(contratoId: string, codigos: ReadonlyArray<string>, motivo: string): Promise<number> {
    const pendentes = await this.ctx.repos.alertas.todos(
      (a) => a.contratoId === contratoId && codigos.includes(a.codigo) && a.estado !== 'RESOLVIDA',
    );
    const agora = this.ctx.relogio.agora();
    for (const a of pendentes) {
      await this.ctx.repos.alertas.guardar({ ...a, estado: 'RESOLVIDA', resolvidaEm: agora, motivoResolucao: motivo, atualizadoEm: agora });
    }
    return pendentes.length;
  }
}

/** Códigos de decisão que cada ato de negócio satisfaz. */
export const ATO_RESOLVE: Record<string, ReadonlyArray<string>> = {
  TRANSICAO_ANO_ECONOMICO: ['AL-FIM-ANO-ECONOMICO', 'AL-FOLGA-SEM-TEMPO'],
  PRORROGACAO: ['AL-FOLGA-SEM-TEMPO', 'AL-NOVO-PROCEDIMENTO', 'AL-TERMINO-3M', 'AL-TERMINO-6M'],
  SERVICOS_COMPLEMENTARES: ['AL-VALOR-DISPONIVEL', 'AL-CAPACIDADE-INSUFICIENTE'],
  SUSPENSAO: [],
  SUBSTITUICAO_AFETACAO: ['AL-PERFIL-ESGOTA-ANTES-TERMINO', 'AL-PERFIL-80', 'AL-PERFIL-90'],
};
