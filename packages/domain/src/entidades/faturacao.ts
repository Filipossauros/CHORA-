import { z } from 'zod';
import { zEstadoFatura, zTipoDocumentoFatura } from '../enums/index.js';
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

const zDeducao = z.object({
  motivo: z.string().min(1),
  montante: zCent,
});

export const zFatura = zAuditavel.extend({
  id: z.string().min(1),
  contratoId: z.string().min(1),
  compromissoId: z.string().optional(),
  numero: z.string().min(1),
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
  dataLimitePagamento: zDataISO.optional(),
  dataAprovacao: zDataISO.optional(),
  montanteAprovado: zCent.optional(),
  deducoes: z.array(zDeducao).optional(),
  relatorioEvidenciaId: z.string().optional(),
});
export type Fatura = z.infer<typeof zFatura>;
