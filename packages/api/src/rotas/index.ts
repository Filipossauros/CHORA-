import type { FastifyInstance } from 'fastify';
import type { Contexto } from '../contexto.js';
import { rotasRegistosTempo } from './registos-tempo.js';
import { rotasContratos } from './contratos.js';
import { rotasAfetacoes } from './afetacoes.js';
import { rotasProcedimentos } from './procedimentos.js';
import { rotasEstrutura } from './estrutura.js';
import { rotasFaturas } from './faturas.js';
import { rotasRecursos, rotasAcessos } from './recursos-acessos.js';
import { rotasRelatorios, rotasAlertas, rotasAuditoria } from './relatorios.js';
import { rotasOrcamentos } from './orcamentos.js';

export function registarRotas(app: FastifyInstance, ctx: Contexto): void {
  rotasProcedimentos(app, ctx);
  rotasContratos(app, ctx);
  rotasEstrutura(app, ctx);
  rotasAfetacoes(app, ctx);
  rotasRecursos(app, ctx);
  rotasRegistosTempo(app, ctx);
  rotasFaturas(app, ctx);
  rotasRelatorios(app, ctx);
  rotasAlertas(app, ctx);
  rotasAuditoria(app, ctx);
  rotasAcessos(app, ctx);
  rotasOrcamentos(app, ctx);
}
