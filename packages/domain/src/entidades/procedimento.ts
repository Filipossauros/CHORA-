import { z } from 'zod';
import { zTipoProcedimento } from '../enums/index.js';
import { zAuditavel, zCentNaoNegativo } from '../tipos/primitivos.js';

export const zLote = zAuditavel.extend({
  id: z.string().min(1),
  procedimentoId: z.string().min(1),
  numero: z.string().min(1), // único dentro do procedimento
  designacao: z.string().min(1),
  precoBase: zCentNaoNegativo.optional(),
});
export type Lote = z.infer<typeof zLote>;

export const zProcedimento = zAuditavel.extend({
  id: z.string().min(1),
  numero: z.string().min(1), // obrigatório, único
  descricao: z.string().min(1),
  tipo: zTipoProcedimento,
  cpv: z.string().optional(),
  precoBase: zCentNaoNegativo.optional(),
  acordoQuadroId: z.string().optional(),
});
export type Procedimento = z.infer<typeof zProcedimento>;
