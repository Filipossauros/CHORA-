import { relogioFixo } from '@chora/domain';
import { criarContexto, type Contexto } from '../src/contexto.js';
import { construirServidor } from '../src/server.js';
import { FakeTokenValidator } from '../src/auth/fake-token-validator.js';
import { UTILIZADORES_DEV } from '../src/seed/utilizadores.js';
import { semear } from '../src/seed/semear.js';
import { criarGeradorSequencial } from '../src/util/id.js';

export const INSTANTE_TESTE = '2026-07-21T09:00:00.000Z';

export async function montarApp(comSeed = true): Promise<{ app: ReturnType<typeof construirServidor>; ctx: Contexto }> {
  const relogio = relogioFixo(INSTANTE_TESTE);
  const tokenValidator = new FakeTokenValidator(UTILIZADORES_DEV, relogio);
  const ctx = criarContexto({ tokenValidator, relogio, ids: criarGeradorSequencial() });
  if (comSeed) await semear(ctx);
  const app = construirServidor(ctx);
  await app.ready();
  return { app, ctx };
}

export function comoGestor() {
  return { 'x-dev-user': 'oid-gestor-contrato' };
}
export function comoGestorTecnico() {
  return { 'x-dev-user': 'oid-gestor-tecnico' };
}
export function comoRecurso(id = 'oid-recurso-01') {
  return { 'x-dev-user': id };
}
