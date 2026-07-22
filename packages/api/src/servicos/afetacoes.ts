import {
  RN_701, RN_702, exigir,
  type Afetacao,
} from '@chora/domain';
import type { Contexto } from '../contexto.js';
import { ErroNaoEncontrado } from '../erros/problema.js';
import type { ContextoUtilizador } from '../auth/token-validator.js';

export interface NovaAfetacao {
  contratoId: string;
  perfilId: string;
  recursoId: string;
}

/**
 * Casos de uso de afetações. Uma afetação começa pela indicação do contrato e do
 * perfil (da lista de perfis desse contrato) e do recurso. Sem projeto e sem
 * período de vigência: a afetação mantém-se até indicação manual de inativação
 * ou substituição. Estado apenas ativa/inativa (feedback R1/ronda 2).
 */
export class ServicoAfetacoes {
  constructor(private readonly ctx: Contexto) {}

  private async carregar(id: string): Promise<Afetacao> {
    const a = await this.ctx.repos.afetacoes.obter(id);
    if (a === null) throw new ErroNaoEncontrado(`Afetação ${id} inexistente.`);
    return a;
  }

  async criar(nova: NovaAfetacao, utilizador: ContextoUtilizador): Promise<Afetacao> {
    const contrato = await this.ctx.repos.contratos.obter(nova.contratoId);
    if (contrato === null) throw new ErroNaoEncontrado(`Contrato ${nova.contratoId} inexistente.`);
    const recurso = await this.ctx.repos.recursos.obter(nova.recursoId);
    exigir(RN_702, { entidadeExecutanteNipc: recurso?.entidadeExecutanteNipc ?? contrato.prestador.nipc });

    const agora = this.ctx.relogio.agora();
    const afetacao: Afetacao = {
      id: this.ctx.ids.novo('afe'),
      contratoId: nova.contratoId,
      perfilId: nova.perfilId,
      recursoId: nova.recursoId,
      projetoIds: [], // projeto desassociado da afetação (ronda 2)
      vigenteDe: contrato.dataInicioVigencia, // início alinhado à vigência; sem fim até inativação
      ativa: true,
      criadoEm: agora, criadoPor: utilizador.utilizadorId,
      atualizadoEm: agora, atualizadoPor: utilizador.utilizadorId,
    };
    await this.ctx.repos.afetacoes.guardar(afetacao);
    await this.ctx.auditoria.registar({ utilizadorId: utilizador.utilizadorId, entidade: 'Afetacao', entidadeId: afetacao.id, operacao: 'CRIAR', resultado: 'PERMITIDO', depois: afetacao });
    return afetacao;
  }

  /** Ativa/inativa uma afetação. */
  async definirAtiva(id: string, ativa: boolean, utilizador: ContextoUtilizador): Promise<Afetacao> {
    const atual = await this.carregar(id);
    const atualizado: Afetacao = { ...atual, ativa, atualizadoEm: this.ctx.relogio.agora(), atualizadoPor: utilizador.utilizadorId };
    await this.ctx.repos.afetacoes.guardar(atualizado);
    await this.ctx.auditoria.registar({ utilizadorId: utilizador.utilizadorId, entidade: 'Afetacao', entidadeId: id, operacao: ativa ? 'ATIVAR' : 'INATIVAR', resultado: 'PERMITIDO', antes: atual, depois: atualizado });
    return atualizado;
  }

  /**
   * Substitui o recurso de uma afetação (RN-701): inativa a atual e cria uma
   * sucessora ativa com o novo recurso. Perfil e entidade executante têm de
   * coincidir.
   */
  async substituir(id: string, novoRecursoId: string, utilizador: ContextoUtilizador): Promise<{ anterior: Afetacao; sucessora: Afetacao }> {
    const atual = await this.carregar(id);
    const recursoAntigo = await this.ctx.repos.recursos.obter(atual.recursoId);
    const recursoNovo = await this.ctx.repos.recursos.obter(novoRecursoId);
    exigir(RN_701, {
      perfilAntigo: atual.perfilId, perfilNovo: atual.perfilId,
      entidadeAntiga: recursoAntigo?.entidadeExecutanteNipc ?? '',
      entidadeNova: recursoNovo?.entidadeExecutanteNipc ?? (recursoAntigo?.entidadeExecutanteNipc ?? ''),
      encerraAnterior: true,
    });
    const agora = this.ctx.relogio.agora();
    const anterior: Afetacao = { ...atual, ativa: false, atualizadoEm: agora, atualizadoPor: utilizador.utilizadorId };
    const sucessora: Afetacao = {
      id: this.ctx.ids.novo('afe'), contratoId: atual.contratoId, perfilId: atual.perfilId, recursoId: novoRecursoId,
      projetoIds: [], vigenteDe: atual.vigenteDe, ativa: true, substituiAfetacaoId: atual.id,
      criadoEm: agora, criadoPor: utilizador.utilizadorId, atualizadoEm: agora, atualizadoPor: utilizador.utilizadorId,
    };
    await this.ctx.repos.afetacoes.guardar(anterior);
    await this.ctx.repos.afetacoes.guardar(sucessora);
    await this.ctx.auditoria.registar({ utilizadorId: utilizador.utilizadorId, entidade: 'Afetacao', entidadeId: sucessora.id, operacao: 'SUBSTITUIR', resultado: 'PERMITIDO', antes: atual, depois: sucessora });
    return { anterior, sucessora };
  }
}
