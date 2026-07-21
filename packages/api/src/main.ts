import { relogioSistema } from '@chora/domain';
import { criarContexto } from './contexto.js';
import { construirServidor } from './server.js';
import { FakeTokenValidator } from './auth/fake-token-validator.js';
import { UTILIZADORES_DEV } from './seed/utilizadores.js';
import { semear } from './seed/semear.js';

const PORTA = Number(process.env['PORT'] ?? 7071);

async function principal(): Promise<void> {
  const tokenValidator = new FakeTokenValidator(UTILIZADORES_DEV, relogioSistema);
  const ctx = criarContexto({ tokenValidator, relogio: relogioSistema });
  await semear(ctx);
  const app = construirServidor(ctx);
  await app.listen({ port: PORTA, host: '0.0.0.0' });
  // eslint-disable-next-line no-console
  console.log(`CHORA+ API em http://localhost:${PORTA} (FakeTokenValidator; use o cabeçalho X-Dev-User)`);
}

principal().catch((e: unknown) => {
  // eslint-disable-next-line no-console
  console.error('Falha ao arrancar a API:', e);
  process.exit(1);
});
