import { z } from 'zod';
import { DateTime } from 'luxon';

/**
 * Tipos primitivos e convenções temporais (secção 5.3.1).
 *
 * Nenhum campo é declarado como `string` nu quando representa um valor tipado.
 * Todos os aliases são serializáveis e validados por Zod. Objetos `Date` e
 * `DateTime` NÃO atravessam fronteiras de entidade — existem apenas dentro das
 * funções de cálculo (ver src/calculos e src/tipos/tempo.ts).
 */

/** Valor monetário em cêntimos, inteiro. Nunca vírgula flutuante. */
export type Cent = number;

/** Duração em minutos, inteiro não negativo. */
export type Minutos = number;

/**
 * Data de calendário, sem hora e sem fuso: 'YYYY-MM-DD'.
 * Para factos jurídicos que ocorrem num dia, não num instante.
 */
export type DataISO = string;

/**
 * Instante absoluto, ISO 8601 com desvio explícito.
 * Armazenado sempre em UTC; convertido para Europe/Lisbon apenas na apresentação.
 */
export type InstanteISO = string;

/** Mês de calendário: 'YYYY-MM'. */
export type MesISO = string;

/** Ano civil, inteiro de quatro dígitos. */
export type AnoCivil = number;

// -------------------------------------------------------------------------
// Esquemas Zod
// -------------------------------------------------------------------------

export const zDataISO = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Data inválida: esperado YYYY-MM-DD')
  .refine((v) => DateTime.fromISO(v).isValid, 'Data inexistente no calendário');

/**
 * Instante ISO 8601 com desvio de fuso obrigatório.
 * Um instante sem desvio (`2026-03-14T09:21:07`) é rejeitado — nunca interpretado
 * como hora local (é a principal fonte de erro silencioso neste tipo de sistema).
 * O valor é normalizado para UTC.
 */
export const zInstanteISO = z
  .string()
  .datetime({ offset: true })
  .transform((v) => {
    const iso = DateTime.fromISO(v, { setZone: true }).toUTC().toISO();
    if (iso === null) {
      throw new Error('Instante inválido');
    }
    return iso;
  });

export const zMesISO = z
  .string()
  .regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Mês inválido: esperado YYYY-MM');

export const zCent = z.number().int('Valor em cêntimos tem de ser inteiro');
export const zCentNaoNegativo = z.number().int().nonnegative();
export const zMinutos = z.number().int('Minutos tem de ser inteiro').nonnegative();
export const zAnoCivil = z.number().int().gte(1000).lte(9999);

/** Bloco de auditoria uniforme presente em todas as entidades mutáveis. */
export const zAuditavel = z.object({
  criadoEm: zInstanteISO,
  criadoPor: z.string().min(1),
  atualizadoEm: zInstanteISO,
  atualizadoPor: z.string().min(1),
});
export type Auditavel = z.infer<typeof zAuditavel>;
