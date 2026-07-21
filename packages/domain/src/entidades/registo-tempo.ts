import { z } from 'zod';
import { zEstadoRegistoTempo, zTipoDotacao } from '../enums/index.js';
import {
  zCent,
  zDataISO,
  zInstanteISO,
  zMinutos,
} from '../tipos/primitivos.js';

/**
 * Registo de tempo. Extende o bloco Auditável (criadoPor/atualizadoPor): no
 * RegistoTempo, `criadoPor` coincide normalmente com `recursoId`, mas os campos
 * são distintos e ambos obrigatórios — a auditoria distingue quem executou a
 * atividade de quem a lançou (secção 5.3.2).
 */
export const zRegistoTempo = z.object({
  id: z.string().min(1),
  afetacaoId: z.string().min(1),
  contratoId: z.string().min(1), // desnormalizado para consulta
  perfilId: z.string().min(1), // desnormalizado
  recursoId: z.string().min(1), // desnormalizado
  projetoId: z.string().min(1),
  workItemId: z.number().int().positive(),
  data: zDataISO,
  duracao: zMinutos,
  descricaoAtividade: z.string().min(1),
  tipoDotacaoConsumida: zTipoDotacao,
  valorHoraAplicado: zCent, // congelado no momento da aprovação
  valorImputado: zCent, // congelado no momento da aprovação
  estado: zEstadoRegistoTempo,
  submetidoEm: zInstanteISO.optional(),
  aprovadoPor: z.string().optional(),
  aprovadoEm: zInstanteISO.optional(),
  motivoRejeicao: z.string().optional(),
  anuladoPor: z.string().optional(),
  anuladoEm: zInstanteISO.optional(),
  motivoAnulacao: z.string().optional(),
  criadoEm: zInstanteISO,
  criadoPor: z.string().min(1),
  atualizadoEm: zInstanteISO,
  atualizadoPor: z.string().min(1),
});
export type RegistoTempo = z.infer<typeof zRegistoTempo>;
