import type { EventoAuditoria, Relogio } from '@chora/domain';
import type { Repositorios } from '../repositorios/memoria/index.js';
import type { GeradorId } from '../util/id.js';

/**
 * Serviço de auditoria (ADR-07). Toda a mutação de estado relevante gera um
 * `EventoAuditoria` imutável e append-only.
 */
export interface DadosEvento {
  utilizadorId: string;
  entidade: string;
  entidadeId: string;
  operacao: string;
  resultado: 'PERMITIDO' | 'NEGADO' | 'ERRO';
  projetoId?: string;
  regraViolada?: string;
  antes?: unknown;
  depois?: unknown;
  ipOrigem?: string;
  tokenValidoAte?: string;
}

export class ServicoAuditoria {
  constructor(
    private readonly repos: Repositorios,
    private readonly relogio: Relogio,
    private readonly ids: GeradorId,
  ) {}

  async registar(dados: DadosEvento): Promise<EventoAuditoria> {
    const evento: EventoAuditoria = {
      id: this.ids.novo('evt'),
      ocorridoEm: this.relogio.agora(),
      utilizadorId: dados.utilizadorId,
      entidade: dados.entidade,
      entidadeId: dados.entidadeId,
      operacao: dados.operacao,
      resultado: dados.resultado,
      ...(dados.projetoId !== undefined ? { projetoId: dados.projetoId } : {}),
      ...(dados.regraViolada !== undefined ? { regraViolada: dados.regraViolada } : {}),
      ...(dados.antes !== undefined ? { antes: dados.antes } : {}),
      ...(dados.depois !== undefined ? { depois: dados.depois } : {}),
      ...(dados.ipOrigem !== undefined ? { ipOrigem: dados.ipOrigem } : {}),
      ...(dados.tokenValidoAte !== undefined ? { tokenValidoAte: dados.tokenValidoAte } : {}),
    };
    await this.repos.eventosAuditoria.guardar(evento);
    return evento;
  }
}
