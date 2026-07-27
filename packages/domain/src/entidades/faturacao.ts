import { z } from 'zod';
import { zEstadoFatura, zTipoDocumentoFatura, zTipoFaturacao } from '../enums/index.js';
import {
  zAnoCivil,
  zAuditavel,
  zCent,
  zCentNaoNegativo,
  zDataISO,
  zInstanteISO,
  zMinutos,
} from '../tipos/primitivos.js';

export const zCompromisso = zAuditavel.extend({
  id: z.string().min(1),
  contratoId: z.string().min(1),
  numero: z.string().min(1), // número de compromisso (LCPA)
  montante: zCentNaoNegativo,
  ano: zAnoCivil,
  emitidoEm: zDataISO,
});
export type Compromisso = z.infer<typeof zCompromisso>;

const zDocumentoFatura = z.object({
  tipo: zTipoDocumentoFatura,
  ficheiroRef: z.string().min(1), // referência no arquivo documental; o PDF não vai para a BD
  nomeOriginal: z.string().min(1),
  hashSha256: z.string().regex(/^[a-f0-9]{64}$/i, 'Hash SHA-256 inválido'),
  tamanhoBytes: z.number().int().nonnegative(),
  recebidoEm: zInstanteISO,
  carregadoPor: z.string().min(1),
});
export type DocumentoFatura = z.infer<typeof zDocumentoFatura>;

const zLinhaFatura = z.object({
  perfilId: z.string().optional(),
  recursoId: z.string().optional(),
  quantidade: zMinutos,
  valorHora: zCent,
  montante: zCent,
  origem: z.enum(['MANUAL', 'EXTRAIDA']), // no protótipo, sempre 'MANUAL'
});
export type LinhaFatura = z.infer<typeof zLinhaFatura>;

export const zFatura = zAuditavel.extend({
  id: z.string().min(1),
  contratoId: z.string().min(1),
  compromissoId: z.string().optional(),
  numero: z.string().min(1),
  /**
   * O que a fatura liquida. Por omissão BOLSA_HORAS (tempo prestado), que é o
   * comportamento de todos os contratos exceto os entregáveis de chave-na-mão.
   */
  tipo: zTipoFaturacao.default('BOLSA_HORAS'),
  /** Entregável liquidado, obrigatório quando `tipo` é ENTREGAVEL (RN-608). */
  entregavelId: z.string().optional(),
  /**
   * O contrato e o prestador TAL COMO VÊM NO DOCUMENTO — por OCR ou digitados.
   * Não são o contrato e o prestador que a base conhece: é a comparação entre
   * uns e outros que deteta a fatura trocada, que é dos erros mais caros de
   * apanhar tarde (RN-613).
   */
  numeroContratoIndicado: z.string().min(1),
  nifPrestadorIndicado: z.string().min(1),
  documentos: z.array(zDocumentoFatura),
  referenciaSistemaFaturacao: z.string().optional(),
  dataEmissao: zDataISO,
  dataRececao: zDataISO,
  periodoDe: zDataISO,
  periodoAte: zDataISO,
  montanteSemIva: zCent,
  montanteIva: zCent,
  linhas: z.array(zLinhaFatura),
  estado: zEstadoFatura,
  /**
   * Nota de crédito que corrige a fatura. Existe quando o fornecedor faturou a
   * mais e a correção vem por documento próprio em vez de fatura substituta: o
   * que se valida passa a ser o líquido (fatura − nota de crédito), decidido de
   * uma só vez (RN-612).
   */
  notaCredito: z.object({
    numero: z.string().min(1),
    montante: zCentNaoNegativo,
    motivo: z.string().min(1),
    registadaEm: zDataISO,
  }).optional(),
  /** Data da DECISÃO (validação ou invalidação). Não há data de pagamento. */
  dataAprovacao: zDataISO.optional(),
  montanteAprovado: zCent.optional(),
  relatorioEvidenciaId: z.string().optional(),
});
export type Fatura = z.infer<typeof zFatura>;
