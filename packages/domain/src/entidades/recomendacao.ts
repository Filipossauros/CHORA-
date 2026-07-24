import { z } from 'zod';
import { zEstadoRecomendacao, zOrigemRecomendacao } from '../enums/index.js';
import { zInstanteISO } from '../tipos/primitivos.js';

/**
 * Recomendação como entidade de 1.ª classe (melhoria transversal). Persiste a
 * sugestão feita pela camada determinística/agente com fundamento, referência
 * legal, confiança e estado (proposta → aceite/rejeitada). Torna a "inteligência"
 * auditável e habilita o loop de feedback. NUNCA é vinculativa: as regras do
 * catálogo (RN-xxx) é que condicionam decisões.
 */
export const zRecomendacao = z.object({
  id: z.string().min(1),
  contratoId: z.string().optional(),
  origem: zOrigemRecomendacao,
  codigo: z.string().optional(), // ex.: código do alerta ou da previsão
  titulo: z.string().min(1),
  texto: z.string().min(1),
  fundamentacao: z.string().optional(),
  referenciaLegal: z.string().optional(),
  confianca: z.number().min(0).max(1),
  estado: zEstadoRecomendacao,
  criadoEm: zInstanteISO,
  criadoPor: z.string().min(1),
  decididoEm: zInstanteISO.optional(),
  decididoPor: z.string().optional(),
  notaDecisao: z.string().optional(),
});
export type Recomendacao = z.infer<typeof zRecomendacao>;
