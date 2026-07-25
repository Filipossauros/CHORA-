import { z } from 'zod';
import { zEstadoAlerta, zSeveridadeAlerta } from '../enums/index.js';
import { zCent, zDataISO, zInstanteISO } from '../tipos/primitivos.js';

/**
 * Opção de atuação proposta com um alerta ("escada de opções"), ordenada por
 * atrito jurídico crescente. É sempre indicativa: quem decide é o gestor.
 */
export const zOpcaoAlerta = z.object({
  ordem: z.number().int().nonnegative(), // 1 = menor atrito
  titulo: z.string().min(1),
  detalhe: z.string().min(1),
  viabilidade: z.enum(['VIAVEL', 'CONDICIONADA', 'INVIAVEL']),
  fundamento: z.string().optional(), // base legal / regra aplicável
  impactoValor: zCent.optional(), // diferencial de custo, quando quantificável
});
export type OpcaoAlerta = z.infer<typeof zOpcaoAlerta>;

/**
 * Alerta gerado por job (secção 11). Não é Auditável (não tem autor humano);
 * tem `geradoEm`.
 *
 * Além do sinal, o alerta transporta a JANELA DE DECISÃO (`dataLimiteAcao`: até
 * quando é preciso agir, calculada para trás a partir do evento com o prazo de
 * instrução do ato), o IMPACTO quantificado e a ESCADA DE OPÇÕES.
 */
export const zAlerta = z.object({
  id: z.string().min(1),
  contratoId: z.string().min(1),
  codigo: z.string().min(1), // ver secção 11
  /**
   * Identidade ESTÁVEL da decisão: `contratoId|codigo|referencia`. Duas
   * execuções do job sobre a mesma situação produzem a mesma chave — e portanto
   * a mesma decisão, não duas. A `referencia` distingue ocorrências legítimas
   * do mesmo código (ex.: o perfil a que respeita, ou o ano económico).
   */
  chave: z.string().min(1),
  estado: zEstadoAlerta,
  severidade: zSeveridadeAlerta,
  titulo: z.string().min(1),
  detalhe: z.string().min(1),
  destinatarioId: z.string().min(1),
  geradoEm: zInstanteISO, // primeira deteção (não muda entre reconciliações)
  atualizadoEm: zInstanteISO.optional(), // última reconciliação
  lidoEm: zInstanteISO.optional(),
  notificadoEm: zInstanteISO.optional(),
  /** Quando passou a RESOLVIDA (ato registado ou condição deixou de existir). */
  resolvidaEm: zInstanteISO.optional(),
  motivoResolucao: z.string().optional(),
  /** Dispensa temporária: reaparece depois desta data, ou se agravar. */
  dispensadaAte: zDataISO.optional(),
  motivoDispensa: z.string().optional(),
  /** Data-limite para agir (janela de decisão). */
  dataLimiteAcao: zDataISO.optional(),
  /** Dias que faltam até à data-limite; negativo se já passou. */
  diasParaLimite: z.number().int().optional(),
  /** Evento a que a janela se refere (ex.: 'fecho do ano económico'). */
  eventoAncora: z.string().optional(),
  /** Impacto financeiro quantificado (€, em cêntimos). */
  impactoValor: zCent.optional(),
  /** Impacto em horas (minutos), quando aplicável. */
  impactoMinutos: z.number().int().optional(),
  /** Escada de opções de atuação. */
  opcoes: z.array(zOpcaoAlerta).optional(),
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
