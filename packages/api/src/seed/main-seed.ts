import { relogioFixo } from '@chora/domain';
import { criarContexto } from '../contexto.js';
import { FakeTokenValidator } from '../auth/fake-token-validator.js';
import { UTILIZADORES_DEV } from './utilizadores.js';
import { semear, resumoSeed } from './semear.js';

/** `pnpm seed` — popula um contexto e imprime o resumo determinístico. */
async function principal(): Promise<void> {
  const relogio = relogioFixo('2026-07-21T09:00:00.000Z');
  const tokenValidator = new FakeTokenValidator(UTILIZADORES_DEV, relogio);
  const ctx = criarContexto({ tokenValidator, relogio });
  await semear(ctx);
  const resumo = await resumoSeed(ctx);
  // eslint-disable-next-line no-console
  console.log('Seed determinístico gerado:', JSON.stringify(resumo, null, 2));
}

principal().catch((e: unknown) => {
  // eslint-disable-next-line no-console
  console.error(e);
  process.exit(1);
});
