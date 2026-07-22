import { z } from 'zod';

/**
 * Enumerações do domínio CHORA+ (secção 5.2 da especificação).
 * Cada enumeração exporta o tipo TypeScript e o respetivo esquema Zod,
 * mantidos lado a lado para impedir divergência.
 */

/** Figuras pré-contratuais previstas no CCP (art. 16.º e ss.). */
export const TIPOS_PROCEDIMENTO = [
  'AJUSTE_DIRETO',
  'CONSULTA_PREVIA',
  'CONCURSO_PUBLICO',
  'CONCURSO_LIMITADO',
  'PROCEDIMENTO_NEGOCIACAO',
  'DIALOGO_CONCORRENCIAL',
  'PARCERIA_INOVACAO',
  'ACORDO_QUADRO',
  'SISTEMA_AQUISICAO_DINAMICA',
] as const;
export type TipoProcedimento = (typeof TIPOS_PROCEDIMENTO)[number];
export const zTipoProcedimento = z.enum(TIPOS_PROCEDIMENTO);

/**
 * Tipologia do contrato quanto ao modo de execução:
 * - BOLSA_HORAS: exige a identificação dos perfis contratuais (horas e
 *   valor/hora); as horas são consumidas contra esses perfis.
 * - CHAVE_NA_MAO: empreitada de preço fixo paga pelo resultado; sem perfis.
 */
export const TIPOLOGIAS_CONTRATO = ['BOLSA_HORAS', 'CHAVE_NA_MAO'] as const;
export type TipologiaContrato = (typeof TIPOLOGIAS_CONTRATO)[number];
export const zTipologiaContrato = z.enum(TIPOLOGIAS_CONTRATO);

export const TIPOS_DOTACAO = ['HORAS_BASE', 'BOLSA_VALOR', 'TRABALHOS_COMPLEMENTARES'] as const;
export type TipoDotacao = (typeof TIPOS_DOTACAO)[number];
export const zTipoDotacao = z.enum(TIPOS_DOTACAO);

export const ESTADOS_CONTRATO = [
  'EM_PREPARACAO',
  'AGUARDA_VISTO',
  'EM_VIGOR',
  'SUSPENSO',
  'TERMINADO',
  'RESOLVIDO',
  'CADUCADO',
  'REVOGADO',
] as const;
export type EstadoContrato = (typeof ESTADOS_CONTRATO)[number];
export const zEstadoContrato = z.enum(ESTADOS_CONTRATO);

export const TIPOS_ALTERACAO = [
  'PRORROGACAO',
  'SUSPENSAO',
  'SERVICOS_COMPLEMENTARES',
  'REVISAO_PRECOS',
  'CESSAO_POSICAO_CONTRATUAL',
  'SUBSTITUICAO_GESTOR',
  'REFORCO_BOLSA_VALOR',
  'OUTRA',
] as const;
export type TipoAlteracao = (typeof TIPOS_ALTERACAO)[number];
export const zTipoAlteracao = z.enum(TIPOS_ALTERACAO);

export const ESTADOS_REGISTO_TEMPO = [
  'RASCUNHO',
  'SUBMETIDO',
  'APROVADO',
  'REJEITADO',
  'ANULADO',
] as const;
export type EstadoRegistoTempo = (typeof ESTADOS_REGISTO_TEMPO)[number];
export const zEstadoRegistoTempo = z.enum(ESTADOS_REGISTO_TEMPO);

export const PAPEIS_APLICACIONAIS = [
  'GESTOR_CONTRATO',
  'GESTOR_TECNICO',
  'ELEMENTO_EQUIPA_TECNICA',
] as const;
export type PapelAplicacional = (typeof PAPEIS_APLICACIONAIS)[number];
export const zPapelAplicacional = z.enum(PAPEIS_APLICACIONAIS);

export const ESTADOS_FATURA = [
  'RECEBIDA',
  'EM_CONFERENCIA',
  'VALIDADA',
  'INVALIDADA',
  'DEVOLVIDA',
  'PAGA',
] as const;
export type EstadoFatura = (typeof ESTADOS_FATURA)[number];
export const zEstadoFatura = z.enum(ESTADOS_FATURA);

export const TIPOS_DOCUMENTO_FATURA = [
  'FATURA',
  'RELATORIO_HORAS_FORNECEDOR',
  'NOTA_CREDITO',
  'OUTRO',
] as const;
export type TipoDocumentoFatura = (typeof TIPOS_DOCUMENTO_FATURA)[number];
export const zTipoDocumentoFatura = z.enum(TIPOS_DOCUMENTO_FATURA);

export const UNIDADES_MEDIDA = ['HORA', 'DIA_HOMEM', 'FTE_MES'] as const;
export type UnidadeMedida = (typeof UNIDADES_MEDIDA)[number];
export const zUnidadeMedida = z.enum(UNIDADES_MEDIDA);

export const TIPOS_DOCUMENTO_HABILITACAO = [
  'CERTIDAO_NAO_DIVIDA_AT',
  'CERTIDAO_NAO_DIVIDA_SS',
  'REGISTO_CRIMINAL',
  'CAUCAO',
  'SEGURO',
  'OUTRO',
] as const;
export type TipoDocumentoHabilitacao = (typeof TIPOS_DOCUMENTO_HABILITACAO)[number];
export const zTipoDocumentoHabilitacao = z.enum(TIPOS_DOCUMENTO_HABILITACAO);

export const SEVERIDADES_ALERTA = ['INFO', 'AVISO', 'CRITICO'] as const;
export type SeveridadeAlerta = (typeof SEVERIDADES_ALERTA)[number];
export const zSeveridadeAlerta = z.enum(SEVERIDADES_ALERTA);
