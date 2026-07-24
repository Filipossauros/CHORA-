import type { EstadoRecomendacao, Recomendacao } from '@chora/domain';
import type { Contexto } from '../contexto.js';
import { ErroNaoEncontrado, ErroValidacao } from '../erros/problema.js';
import type { ContextoUtilizador } from '../auth/token-validator.js';

/**
 * Recomendações (camada inteligente) persistidas. Guardam a sugestão com
 * fundamento e referência legal e o seu estado (proposta → aceite/rejeitada),
 * habilitando auditoria e loop de feedback. Nunca são vinculativas.
 */
export class ServicoRecomendacoes {
  constructor(private readonly ctx: Contexto) {}

  async criar(dados: Omit<Recomendacao, 'id' | 'estado' | 'criadoEm' | 'criadoPor'>, u: ContextoUtilizador): Promise<Recomendacao> {
    const rec: Recomendacao = {
      ...dados,
      id: this.ctx.ids.novo('rec'),
      estado: 'PROPOSTA',
      criadoEm: this.ctx.relogio.agora(),
      criadoPor: u.utilizadorId,
    };
    await this.ctx.repos.recomendacoes.guardar(rec);
    await this.ctx.auditoria.registar({ utilizadorId: u.utilizadorId, entidade: 'Recomendacao', entidadeId: rec.id, operacao: 'CRIAR', resultado: 'PERMITIDO', depois: rec });
    return rec;
  }

  /** Aceita ou rejeita uma recomendação (feedback do gestor). */
  async decidir(id: string, estado: Exclude<EstadoRecomendacao, 'PROPOSTA'>, nota: string | undefined, u: ContextoUtilizador): Promise<Recomendacao> {
    const atual = await this.ctx.repos.recomendacoes.obter(id);
    if (atual === null) throw new ErroNaoEncontrado(`Recomendação ${id} inexistente.`);
    if (atual.estado !== 'PROPOSTA') throw new ErroValidacao('A recomendação já foi decidida.');
    const atualizada: Recomendacao = {
      ...atual, estado,
      decididoEm: this.ctx.relogio.agora(), decididoPor: u.utilizadorId,
      ...(nota !== undefined && nota.trim() !== '' ? { notaDecisao: nota } : {}),
    };
    await this.ctx.repos.recomendacoes.guardar(atualizada);
    await this.ctx.auditoria.registar({ utilizadorId: u.utilizadorId, entidade: 'Recomendacao', entidadeId: id, operacao: `DECIDIR:${estado}`, resultado: 'PERMITIDO', antes: atual, depois: atualizada });
    return atualizada;
  }
}
