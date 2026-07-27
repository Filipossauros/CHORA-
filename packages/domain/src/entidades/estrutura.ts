import { z } from 'zod';
import { zTipoAlteracao, zTipoDotacao } from '../enums/index.js';
import {
  zAuditavel,
  zCent,
  zDataISO,
  zInstanteISO,
  zMinutos,
} from '../tipos/primitivos.js';

export const zDotacao = zAuditavel.extend({
  id: z.string().min(1),
  contratoId: z.string().min(1),
  tipo: zTipoDotacao,
  valor: zCent,
  horasTotais: zMinutos.optional(),
  origemAlteracaoId: z.string().optional(),
});
export type Dotacao = z.infer<typeof zDotacao>;

const zPrecoPerfil = z.object({
  valorHora: zCent, // série temporal — ADR-09
  vigenteDe: zDataISO,
  vigenteAte: zDataISO.optional(),
  origemAlteracaoId: z.string().optional(),
});
export type PrecoPerfil = z.infer<typeof zPrecoPerfil>;

export const zPerfilContratual = zAuditavel.extend({
  id: z.string().min(1),
  contratoId: z.string().min(1),
  nome: z.string().min(1), // ex.: 'Arquiteto de Software Sénior'
  quantidadePrevista: zMinutos, // horas disponíveis para executar
  consomeBolsaValor: z.boolean(),
  consomeTrabalhosComplementares: z.boolean(),
  perfilDeGestao: z.boolean(), // categoria contratual — NÃO confere permissões (RN-501)
  precos: z.array(zPrecoPerfil),
});
export type PerfilContratual = z.infer<typeof zPerfilContratual>;

const zSuspensao = z.object({
  dataInicio: zDataISO,
  dataFim: zDataISO.optional(),
  suspendePrazoExecucao: z.boolean(),
});

/**
 * Alteração contratual. Os campos `registadoEm`/`registadoPor` são os campos de
 * criação (não se duplicam com criadoEm/criadoPor — secção 5.3.2); adiciona-se o
 * carimbo de atualização do bloco Auditável.
 */
export const zAlteracao = z.object({
  id: z.string().min(1),
  contratoId: z.string().min(1),
  tipo: zTipoAlteracao,
  dataEfeito: zDataISO,
  descricao: z.string().min(1),
  fundamentacao: z.string().min(1),
  // Campos por tipo
  valorAcrescido: zCent.optional(), // SERVICOS_COMPLEMENTARES, REFORCO_BOLSA_VALOR, REVISAO_PRECOS
  novaDataTermino: zDataISO.optional(), // PRORROGACAO
  reprogramacaoFinanceira: z.boolean().optional(), // PRORROGACAO — houve reprogramação de encargos plurianuais
  suspensao: zSuspensao.optional(),
  novoPrestador: z.object({ nome: z.string().min(1), nipc: z.string().min(1) }).optional(), // CESSAO_POSICAO_CONTRATUAL
  novoGestorId: z.string().optional(), // SUBSTITUICAO_GESTOR — oid do novo gestor principal
  /** Nº da portaria de extensão de encargos reprogramada com esta modificação. */
  portariaReprogramada: z.string().optional(),
  registadoEm: zInstanteISO,
  registadoPor: z.string().min(1),
  atualizadoEm: zInstanteISO,
  atualizadoPor: z.string().min(1),
});
export type Alteracao = z.infer<typeof zAlteracao>;

export const zDocumentoHabilitacao = zAuditavel.extend({
  id: z.string().min(1),
  contratoId: z.string().min(1),
  tipo: z.enum([
    'CERTIDAO_NAO_DIVIDA_AT',
    'CERTIDAO_NAO_DIVIDA_SS',
    'REGISTO_CRIMINAL',
    'CAUCAO',
    'SEGURO',
    'OUTRO',
  ]),
  emitidoEm: zDataISO,
  validoAte: zDataISO,
  referencia: z.string().optional(),
});
export type DocumentoHabilitacao = z.infer<typeof zDocumentoHabilitacao>;
