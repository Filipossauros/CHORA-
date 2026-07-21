import type { FastifyInstance } from 'fastify';
import type { Contexto } from '../contexto.js';
import { rotasRegistosTempo } from './registos-tempo.js';
import { rotasContratos } from './contratos.js';
import { rotasRelatorios, rotasAlertas, rotasAuditoria } from './relatorios.js';

export function registarRotas(app: FastifyInstance, ctx: Contexto): void {
  rotasContratos(app, ctx);
  rotasRegistosTempo(app, ctx);
  rotasRelatorios(app, ctx);
  rotasAlertas(app, ctx);
  rotasAuditoria(app, ctx);
}
