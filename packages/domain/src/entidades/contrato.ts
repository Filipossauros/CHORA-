import { z } from 'zod';
import { zEstadoContrato, zUnidadeMedida } from '../enums/index.js';
import {
  zAnoCivil,
  zAuditavel,
  zCent,
  zCentNaoNegativo,
  zDataISO,
} from '../tipos/primitivos.js';

const zMembroAgrupamento = z.object({
  nome: z.string().min(1),
  nipc: z.string().min(1),
});

const zPrestador = z.object({
  nome: z.string().min(1),
  nipc: z.string().min(1),
  agrupamento: z.object({ membros: z.array(zMembroAgrupamento) }).optional(),
});

const zPortariaExtensaoEncargos = z.object({
  numero: z.string().min(1),
  data: zDataISO,
  reparticaoAnual: z.array(z.object({ ano: zAnoCivil, montante: zCent })),
});

const zGestorContrato = z.object({
  utilizadorId: z.string().min(1),
  principal: z.boolean(),
  funcoes: z.string().optional(), // delimitação quando há mais do que um gestor
  designadoEm: zDataISO,
  cessouEm: zDataISO.optional(),
  declaracaoConflitoInteressesEm: zDataISO.optional(),
});
export type GestorContrato = z.infer<typeof zGestorContrato>;

const zExcecaoContrato = z.object({
  regra: z.string().min(1), // ex.: 'RN-301'
  fundamentacao: z.string().min(1),
  autorizadoPor: z.string().min(1),
  autorizadoEm: zDataISO,
  documentoRef: z.string().optional(),
});
export type ExcecaoContrato = z.infer<typeof zExcecaoContrato>;

export const zContrato = zAuditavel.extend({
  id: z.string().min(1),
  loteId: z.string().min(1),
  numero: z.string().min(1), // obrigatório, único
  objeto: z.string().min(1),
  estado: zEstadoContrato,

  // Financeiro
  precoContratualInicial: zCentNaoNegativo, // IMUTÁVEL após entrada em vigor (RN-104)
  precoContratualAtual: zCentNaoNegativo,
  unidadeMedida: zUnidadeMedida,

  // Prestador
  prestador: zPrestador,

  // Datas
  dataAssinaturaCA: zDataISO,
  dataInicioVigencia: zDataISO,
  dataTerminoContratual: zDataISO, // valor atual
  dataTerminoOriginal: zDataISO, // congelado à entrada em vigor

  // Fiscalização prévia
  vistoTribunalContasNecessario: z.boolean(),
  dataRemessaTribunalContas: zDataISO.optional(),
  dataVistoTribunalContas: zDataISO.optional(),
  vistoTacito: z.boolean().optional(),

  // Encargos plurianuais
  portariaExtensaoEncargos: zPortariaExtensaoEncargos.optional(),

  // Gestão
  gestores: z.array(zGestorContrato),

  // Exceções fundamentadas a limites legais (ADR-10)
  excecoes: z.array(zExcecaoContrato),
});
export type Contrato = z.infer<typeof zContrato>;
