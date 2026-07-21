/**
 * @chora/domain — camada de domínio do CHORA+.
 *
 * Puro TypeScript + Zod + Luxon. Sem dependências de HTTP, base de dados ou
 * framework (ADR-02). É o artefacto de maior valor e o mais longevo.
 */

export * from './enums/index.js';
export * from './tipos/primitivos.js';
export * from './tipos/tempo.js';
export * from './erros/regra.js';
export * from './erros/violacao-regra.js';
export * from './entidades/index.js';
export * from './calculos/index.js';
export * from './rules/index.js';
export * from './maquinas-estado/index.js';
