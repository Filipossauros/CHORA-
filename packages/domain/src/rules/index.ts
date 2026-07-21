import type { Regra } from '../erros/regra.js';
import { REGRAS_CONTRATOS } from './contratos.js';
import { REGRAS_PRAZOS } from './prazos.js';
import { REGRAS_DOTACOES } from './dotacoes.js';
import { REGRAS_REGISTO_TEMPO } from './registo-tempo.js';
import { REGRAS_APROVACAO } from './aprovacao.js';
import { REGRAS_FATURACAO } from './faturacao.js';
import { REGRAS_RECURSOS } from './recursos.js';

export * from './contratos.js';
export * from './prazos.js';
export * from './dotacoes.js';
export * from './registo-tempo.js';
export * from './aprovacao.js';
export * from './faturacao.js';
export * from './recursos.js';

/** Famílias de regras, na ordem da secção 6. */
export const FAMILIAS_REGRAS = {
  'Contratos e procedimentos': REGRAS_CONTRATOS,
  'Prazos e vigência': REGRAS_PRAZOS,
  'Dotações e serviços complementares': REGRAS_DOTACOES,
  'Registo de tempo': REGRAS_REGISTO_TEMPO,
  'Aprovação': REGRAS_APROVACAO,
  'Faturação e execução financeira': REGRAS_FATURACAO,
  'Recursos e habilitações': REGRAS_RECURSOS,
} as const;

/** Catálogo completo de regras, indexado pelo código RN-xxx. */
export const CATALOGO_REGRAS: ReadonlyArray<Regra<unknown>> = [
  ...REGRAS_CONTRATOS,
  ...REGRAS_PRAZOS,
  ...REGRAS_DOTACOES,
  ...REGRAS_REGISTO_TEMPO,
  ...REGRAS_APROVACAO,
  ...REGRAS_FATURACAO,
  ...REGRAS_RECURSOS,
] as ReadonlyArray<Regra<unknown>>;

const porCodigo = new Map<string, Regra<unknown>>(
  CATALOGO_REGRAS.map((r) => [r.codigo, r]),
);

/** Obtém a regra pelo código, ou `undefined`. */
export function regraPorCodigo(codigo: string): Regra<unknown> | undefined {
  return porCodigo.get(codigo);
}
