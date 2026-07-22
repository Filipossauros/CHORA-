import type { PapelAplicacional, Recurso } from '@chora/domain';
import type { Contexto } from '../contexto.js';
import type { Acesso } from '../repositorios/memoria/index.js';
import type { ContextoUtilizador } from '../auth/token-validator.js';
import { ErroNaoEncontrado } from '../erros/problema.js';

/** Recursos (colaboradores externos). O nome não é persistido (secção 9.4). */
export class ServicoRecursos {
  constructor(private readonly ctx: Contexto) {}

  async criar(id: string, entidadeExecutanteNipc: string, u: ContextoUtilizador): Promise<Recurso> {
    const agora = this.ctx.relogio.agora();
    const recurso: Recurso = {
      id, entidadeExecutanteNipc, ativo: true,
      criadoEm: agora, criadoPor: u.utilizadorId, atualizadoEm: agora, atualizadoPor: u.utilizadorId,
    };
    await this.ctx.repos.recursos.guardar(recurso);
    await this.ctx.auditoria.registar({ utilizadorId: u.utilizadorId, entidade: 'Recurso', entidadeId: id, operacao: 'CRIAR', resultado: 'PERMITIDO', depois: recurso });
    return recurso;
  }

  /**
   * Ativa/inativa um recurso. A inativação não remove as afetações a
   * contratos/perfis (preserva o histórico); só filtra a vista por omissão.
   */
  async definirAtivo(id: string, ativo: boolean, u: ContextoUtilizador): Promise<Recurso> {
    const atual = await this.ctx.repos.recursos.obter(id);
    if (atual === null) throw new ErroNaoEncontrado(`Recurso ${id} inexistente.`);
    const atualizado: Recurso = { ...atual, ativo, atualizadoEm: this.ctx.relogio.agora(), atualizadoPor: u.utilizadorId };
    await this.ctx.repos.recursos.guardar(atualizado);
    await this.ctx.auditoria.registar({ utilizadorId: u.utilizadorId, entidade: 'Recurso', entidadeId: id, operacao: ativo ? 'ATIVAR' : 'INATIVAR', resultado: 'PERMITIDO', antes: atual, depois: atualizado });
    return atualizado;
  }
}

/**
 * Gestão de acessos (secção 9.3). O Azure DevOps autentica; o CHORA+ guarda
 * apenas o papel de cada utilizador. Só o GESTOR_CONTRATO altera a tabela
 * (verificado na rota, RN-501).
 */
export class ServicoAcessos {
  constructor(private readonly ctx: Contexto) {}

  async conceder(utilizadorId: string, papeis: PapelAplicacional[], entidade: string | undefined, ambito: string | undefined, u: ContextoUtilizador): Promise<Acesso> {
    const existente = (await this.ctx.repos.acessos.todos((a) => a.utilizadorId === utilizadorId))[0];
    const acesso: Acesso = {
      id: existente?.id ?? this.ctx.ids.novo('acs'),
      utilizadorId, papeis, ativo: true,
      ...(entidade !== undefined ? { entidade } : {}),
      ...(ambito !== undefined ? { ambito } : {}),
    };
    await this.ctx.repos.acessos.guardar(acesso);
    await this.ctx.auditoria.registar({ utilizadorId: u.utilizadorId, entidade: 'Acesso', entidadeId: acesso.id, operacao: 'CONCEDER', resultado: 'PERMITIDO', depois: acesso });
    return acesso;
  }

  async revogar(id: string, u: ContextoUtilizador): Promise<void> {
    const a = await this.ctx.repos.acessos.obter(id);
    if (a !== null) {
      await this.ctx.repos.acessos.guardar({ ...a, ativo: false });
      await this.ctx.auditoria.registar({ utilizadorId: u.utilizadorId, entidade: 'Acesso', entidadeId: id, operacao: 'REVOGAR', resultado: 'PERMITIDO' });
    }
  }

  /** Resolve os papéis de um utilizador a partir da tabela de acessos. */
  async papeisDe(utilizadorId: string): Promise<PapelAplicacional[]> {
    const a = (await this.ctx.repos.acessos.todos((x) => x.utilizadorId === utilizadorId && x.ativo))[0];
    return a?.papeis ?? ['ELEMENTO_EQUIPA_TECNICA'];
  }
}
