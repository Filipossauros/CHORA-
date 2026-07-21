import { z } from 'zod';
import { zSeveridadeAlerta } from '../enums/index.js';
import { zInstanteISO } from '../tipos/primitivos.js';

/**
 * Alerta gerado por job (secção 11). Não é Auditável (não tem autor humano);
 * tem `geradoEm`.
 */
export const zAlerta = z.object({
  id: z.string().min(1),
  contratoId: z.string().min(1),
  codigo: z.string().min(1), // ver secção 11
  severidade: zSeveridadeAlerta,
  titulo: z.string().min(1),
  detalhe: z.string().min(1),
  destinatarioId: z.string().min(1),
  geradoEm: zInstanteISO,
  lidoEm: zInstanteISO.optional(),
  notificadoEm: zInstanteISO.optional(),
});
export type Alerta = z.infer<typeof zAlerta>;

/**
 * Evento de auditoria append-only (ADR-07). Imutável por natureza; tem apenas o
 * carimbo `ocorridoEm`. O `utilizadorId` nunca é o nome (secção 9.4).
 */
export const zEventoAuditoria = z.object({
  id: z.string().min(1),
  ocorridoEm: zInstanteISO,
  utilizadorId: z.string().min(1),
  projetoId: z.string().optional(),
  entidade: z.string().min(1), // 'RegistoTempo', 'Contrato', ...
  entidadeId: z.string().min(1),
  operacao: z.string().min(1), // 'CRIAR' | 'APROVAR' | 'ANULAR' | ...
  resultado: z.enum(['PERMITIDO', 'NEGADO', 'ERRO']),
  regraViolada: z.string().optional(),
  antes: z.unknown().optional(),
  depois: z.unknown().optional(),
  ipOrigem: z.string().optional(),
  tokenValidoAte: zInstanteISO.optional(),
});
export type EventoAuditoria = z.infer<typeof zEventoAuditoria>;
