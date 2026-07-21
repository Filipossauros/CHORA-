import { RN_102, exigir, type Lote, type Procedimento, type TipoProcedimento, type Cent } from '@chora/domain';
import type { Contexto } from '../contexto.js';
import { ErroNaoEncontrado } from '../erros/problema.js';
import type { ContextoUtilizador } from '../auth/token-validator.js';

export interface NovoProcedimento {
  numero: string;
  descricao: string;
  tipo: TipoProcedimento;
  cpv?: string;
  precoBase?: Cent;
  acordoQuadroId?: string;
}

export class ServicoProcedimentos {
  constructor(private readonly ctx: Contexto) {}

  async criar(novo: NovoProcedimento, u: ContextoUtilizador): Promise<Procedimento> {
    const agora = this.ctx.relogio.agora();
    const proc: Procedimento = {
      id: this.ctx.ids.novo('proc'),
      numero: novo.numero, descricao: novo.descricao, tipo: novo.tipo,
      ...(novo.cpv !== undefined ? { cpv: novo.cpv } : {}),
      ...(novo.precoBase !== undefined ? { precoBase: novo.precoBase } : {}),
      ...(novo.acordoQuadroId !== undefined ? { acordoQuadroId: novo.acordoQuadroId } : {}),
      criadoEm: agora, criadoPor: u.utilizadorId, atualizadoEm: agora, atualizadoPor: u.utilizadorId,
    };
    await this.ctx.repos.procedimentos.guardar(proc);
    await this.ctx.auditoria.registar({ utilizadorId: u.utilizadorId, entidade: 'Procedimento', entidadeId: proc.id, operacao: 'CRIAR', resultado: 'PERMITIDO', depois: proc });
    return proc;
  }

  async criarLote(procedimentoId: string, numero: string, designacao: string, precoBase: Cent | undefined, u: ContextoUtilizador): Promise<Lote> {
    const proc = await this.ctx.repos.procedimentos.obter(procedimentoId);
    if (proc === null) throw new ErroNaoEncontrado(`Procedimento ${procedimentoId} inexistente.`);
    const agora = this.ctx.relogio.agora();
    const lote: Lote = {
      id: this.ctx.ids.novo('lote'), procedimentoId, numero, designacao,
      ...(precoBase !== undefined ? { precoBase } : {}),
      criadoEm: agora, criadoPor: u.utilizadorId, atualizadoEm: agora, atualizadoPor: u.utilizadorId,
    };
    await this.ctx.repos.lotes.guardar(lote);
    await this.ctx.auditoria.registar({ utilizadorId: u.utilizadorId, entidade: 'Lote', entidadeId: lote.id, operacao: 'CRIAR', resultado: 'PERMITIDO', depois: lote });
    return lote;
  }

  /** Lotes de um procedimento com contagem de contratos (RN-102: 0..1 por lote). */
  async lotesComContratos(procedimentoId: string): Promise<Array<Lote & { temContrato: boolean }>> {
    const lotes = await this.ctx.repos.lotes.todos((l) => l.procedimentoId === procedimentoId);
    const contratos = await this.ctx.repos.contratos.todos();
    return lotes.map((l) => ({ ...l, temContrato: contratos.some((c) => c.loteId === l.id) }));
  }

  /** Valida a associação lote→contrato (RN-102) antes de criar um contrato. */
  async validarLoteLivre(loteId: string): Promise<void> {
    const contratos = await this.ctx.repos.contratos.todos((c) => c.loteId === loteId);
    exigir(RN_102, { loteId, contratosNoLote: contratos.map((c) => c.id) });
  }
}
