import { z } from 'zod';
import { zAuditavel, zDataISO } from '../tipos/primitivos.js';

/**
 * Recurso — colaborador externo. O nome NÃO é persistido (secção 9.4);
 * persiste-se apenas `id`, o oid imutável do Entra ID.
 */
export const zRecurso = zAuditavel.extend({
  id: z.string().min(1), // oid do Entra ID
  entidadeExecutanteNipc: z.string().min(1), // adjudicatário ou subcontratado
  ativo: z.boolean(),
});
export type Recurso = z.infer<typeof zRecurso>;

export const zAfetacao = zAuditavel.extend({
  id: z.string().min(1),
  contratoId: z.string().min(1),
  perfilId: z.string().min(1),
  recursoId: z.string().min(1),
  projetoIds: z.array(z.string().min(1)), // projetos Azure DevOps onde pode registar
  vigenteDe: zDataISO,
  vigenteAte: zDataISO.optional(),
  substituiAfetacaoId: z.string().optional(),
  ativa: z.boolean(),
});
export type Afetacao = z.infer<typeof zAfetacao>;
