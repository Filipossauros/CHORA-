import { z } from 'zod';
import { zAuditavel, zCentNaoNegativo, zDataISO, zInstanteISO } from '../tipos/primitivos.js';

/**
 * ENTREGÁVEL de um contrato CHAVE-NA-MÃO.
 *
 * Num contrato de preço fixo não se paga tempo, paga-se resultado: o preço
 * reparte-se por entregáveis, cada um valendo uma fatia do valor total. A
 * faturação de um entregável só é admissível depois de ele estar assinalado
 * como ENTREGUE e pelo montante exato do entregável (RN-608 e RN-609).
 *
 * O valor pode ser indicado em euros ou como percentagem do contrato — a
 * percentagem é sempre convertida em valor no registo, para que a faturação
 * tenha um montante único e inequívoco contra o qual conferir.
 */
export const zEntregavel = zAuditavel.extend({
  id: z.string().min(1),
  contratoId: z.string().min(1),
  /** Ordem de apresentação e de execução prevista. */
  ordem: z.number().int().nonnegative(),
  designacao: z.string().min(1),
  descricao: z.string().optional(),
  /** Valor faturável do entregável, em cêntimos. */
  valor: zCentNaoNegativo,
  /** Fração do preço contratual que o entregável representa (0..1). */
  percentagemContrato: z.number().min(0).max(1),
  dataPrevista: zDataISO.optional(),
  /** Assinalado como entregue — condição necessária para faturar (RN-608). */
  entregue: z.boolean(),
  entregueEm: zDataISO.optional(),
  /** Quem registou a entrega e a nota de receção/aceitação. */
  registadoEntreguePor: z.string().optional(),
  notaEntrega: z.string().optional(),
  /** Fatura que o liquidou, quando já faturado. */
  faturaId: z.string().optional(),
  faturadoEm: zInstanteISO.optional(),
});
export type Entregavel = z.infer<typeof zEntregavel>;

/** Estado de um entregável, derivado dos carimbos (não é persistido). */
export type EstadoEntregavel = 'PREVISTO' | 'ENTREGUE' | 'FATURADO';

export function estadoEntregavel(e: Entregavel): EstadoEntregavel {
  if (e.faturaId !== undefined) return 'FATURADO';
  return e.entregue ? 'ENTREGUE' : 'PREVISTO';
}
