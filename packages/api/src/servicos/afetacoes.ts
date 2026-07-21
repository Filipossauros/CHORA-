import {
  RN_701, RN_702, exigir, adicionarDias,
  type Afetacao, type DataISO,
} from '@chora/domain';
import type { Contexto } from '../contexto.js';
import { ErroNaoEncontrado } from '../erros/problema.js';
import type { ContextoUtilizador } from '../auth/token-validator.js';

export interface NovaAfetacao {
  contratoId: string;
  perfilId: string;
  recursoId: string;
  projetoIds: string[];
  vigenteDe: DataISO;
  vigenteAte?: DataISO;
}

/**
 * Casos de uso de afetações. Uma afetação tem apenas dois estados: **ativa** ou
 * **inativa** (campo booleano `ativa`) — não há mais estados (feedback R1). A
 * substituição de recurso (RN-701) encerra a anterior (fica inativa) e cria uma
 * sucessora ativa, mantendo o rastreio por `substituiAfetacaoId`.
 */
export class ServicoAfetacoes {
  constructor(private readonly ctx: Contexto) {}

  private async carregar(id: string): Promise<Afetacao> {
    const a = await this.ctx.repos.afetacoes.obter(id);
    if (a === null) throw new ErroNaoEncontrado(`Afetação ${id} inexistente.`);
    return a;
  }

  async criar(nova: NovaAfetacao, utilizador: ContextoUtilizador): Promise<Afetacao> {
    const recurso = await this.ctx.repos.recursos.obter(nova.recursoId);
    exigir(RN_702, { entidadeExecutanteNipc: recurso?.entidadeExecutanteNipc ?? '' });

    const agora = this.ctx.relogio.agora();
    const afetacao: Afetacao = {
      id: this.ctx.ids.novo('afe'),
      contratoId: nova.contratoId,
      perfilId: nova.perfilId,
      recursoId: nova.recursoId,
      projetoIds: nova.projetoIds,
      vigenteDe: nova.vigenteDe,
      ...(nova.vigenteAte !== undefined ? { vigenteAte: nova.vigenteAte } : {}),
      ativa: true,
      criadoEm: agora, criadoPor: utilizador.utilizadorId,
      atualizadoEm: agora, atualizadoPor: utilizador.utilizadorId,
    };
    await this.ctx.repos.afetacoes.guardar(afetacao);
    await this.ctx.auditoria.registar({
      utilizadorId: utilizador.utilizadorId, entidade: 'Afetacao', entidadeId: afetacao.id,
      operacao: 'CRIAR', resultado: 'PERMITIDO', depois: afetacao,
    });
    return afetacao;
  }

  /** Atualiza campos editáveis, incluindo ativar/inativar. */
  async atualizar(id: string, campos: Partial<Pick<Afetacao, 'projetoIds' | 'vigenteAte' | 'ativa'>>, utilizador: ContextoUtilizador): Promise<Afetacao> {
    const atual = await this.carregar(id);
    const atualizado: Afetacao = {
      ...atual,
      ...(campos.projetoIds !== undefined ? { projetoIds: campos.projetoIds } : {}),
      ...(campos.vigenteAte !== undefined ? { vigenteAte: campos.vigenteAte } : {}),
      ...(campos.ativa !== undefined ? { ativa: campos.ativa } : {}),
      atualizadoEm: this.ctx.relogio.agora(), atualizadoPor: utilizador.utilizadorId,
    };
    await this.ctx.repos.afetacoes.guardar(atualizado);
    await this.ctx.auditoria.registar({
      utilizadorId: utilizador.utilizadorId, entidade: 'Afetacao', entidadeId: id,
      operacao: 'ATUALIZAR', resultado: 'PERMITIDO', antes: atual, depois: atualizado,
    });
    return atualizado;
  }

  /**
   * Substitui o recurso de uma afetação (RN-701): encerra a atual (fica inativa,
   * com data-fim) e cria uma sucessora ativa com o novo recurso. Perfil e
   * entidade executante têm de coincidir.
   */
  async substituir(
    id: string,
    novoRecursoId: string,
    vigenteDe: DataISO,
    utilizador: ContextoUtilizador,
  ): Promise<{ anterior: Afetacao; sucessora: Afetacao }> {
    const atual = await this.carregar(id);
    const recursoAntigo = await this.ctx.repos.recursos.obter(atual.recursoId);
    const recursoNovo = await this.ctx.repos.recursos.obter(novoRecursoId);
    if (recursoNovo === null) throw new ErroNaoEncontrado(`Recurso ${novoRecursoId} inexistente.`);

    exigir(RN_701, {
      perfilAntigo: atual.perfilId, perfilNovo: atual.perfilId,
      entidadeAntiga: recursoAntigo?.entidadeExecutanteNipc ?? '',
      entidadeNova: recursoNovo.entidadeExecutanteNipc,
      encerraAnterior: true,
    });

    const agora = this.ctx.relogio.agora();
    const fimAnterior = adicionarDias(vigenteDe, -1);
    const anterior: Afetacao = { ...atual, ativa: false, vigenteAte: fimAnterior, atualizadoEm: agora, atualizadoPor: utilizador.utilizadorId };
    const sucessora: Afetacao = {
      id: this.ctx.ids.novo('afe'),
      contratoId: atual.contratoId, perfilId: atual.perfilId, recursoId: novoRecursoId,
      projetoIds: atual.projetoIds, vigenteDe, ativa: true, substituiAfetacaoId: atual.id,
      criadoEm: agora, criadoPor: utilizador.utilizadorId, atualizadoEm: agora, atualizadoPor: utilizador.utilizadorId,
    };
    await this.ctx.repos.afetacoes.guardar(anterior);
    await this.ctx.repos.afetacoes.guardar(sucessora);
    await this.ctx.auditoria.registar({
      utilizadorId: utilizador.utilizadorId, entidade: 'Afetacao', entidadeId: sucessora.id,
      operacao: 'SUBSTITUIR', resultado: 'PERMITIDO', antes: atual, depois: sucessora,
    });
    return { anterior, sucessora };
  }
}
