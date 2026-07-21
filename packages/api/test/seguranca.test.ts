import { describe, it, expect, afterEach } from 'vitest';
import { montarApp, comoGestor } from './helpers.js';

let fechar: (() => Promise<void>) | undefined;
afterEach(async () => { if (fechar) await fechar(); fechar = undefined; });

describe('segurança de transporte (secção 8.3/8.4)', () => {
  it('exige autenticação (401 sem token)', async () => {
    const { app } = await montarApp(false);
    fechar = () => app.close();
    const r = await app.inject({ method: 'GET', url: '/api/v1/contratos' });
    expect(r.statusCode).toBe(401);
    expect(r.headers['content-type']).toContain('application/problem+json');
  });

  it('rejeita credenciais em query string com 401', async () => {
    const { app } = await montarApp(false);
    fechar = () => app.close();
    const r = await app.inject({ method: 'GET', url: '/api/v1/contratos?token=abc', headers: comoGestor() });
    expect(r.statusCode).toBe(401);
  });

  it('inclui Cache-Control: no-store e X-Request-Id em todas as leituras', async () => {
    const { app } = await montarApp();
    fechar = () => app.close();
    const r = await app.inject({ method: 'GET', url: '/api/v1/contratos', headers: comoGestor() });
    expect(r.statusCode).toBe(200);
    expect(r.headers['cache-control']).toBe('no-store');
    expect(r.headers['pragma']).toBe('no-cache');
    expect(r.headers['x-request-id']).toBeDefined();
  });

  it('a rota de saúde é pública', async () => {
    const { app } = await montarApp(false);
    fechar = () => app.close();
    const r = await app.inject({ method: 'GET', url: '/saude' });
    expect(r.statusCode).toBe(200);
  });
});
