import type { FastifyInstance } from 'fastify';
import type { Contexto } from '../contexto.js';
import { exigirUtilizador } from '../servidor/seguranca.js';
import { normalizarPaginacao } from '../repositorios/tipos.js';
import { podeExecutar } from '../auth/permissoes.js';

/**
 * Rotas de afetações (secção 8.1). No protótipo expõe-se a leitura, necessária
 * ao seletor de afetações ativas da vista de registo de tempo (RN-401).
 */
export function rotasAfetacoes(app: FastifyInstance, ctx: Contexto): void {
  app.get('/api/v1/afetacoes', async (req) => {
    const u = exigirUtilizador(req);
    const q = req.query as Record<string, string | undefined>;
    const podeVerTerceiros = podeExecutar(u.papeis, 'registo.ver.terceiros');
    const pag = normalizarPaginacao(
      q['pagina'] !== undefined ? Number(q['pagina']) : undefined,
      q['tamanho'] !== undefined ? Number(q['tamanho']) : undefined,
    );
    return ctx.repos.afetacoes.listar(
      (a) =>
        (podeVerTerceiros || a.recursoId === u.utilizadorId) &&
        (q['contratoId'] === undefined || a.contratoId === q['contratoId']) &&
        (q['recursoId'] === undefined || a.recursoId === q['recursoId']) &&
        (q['projetoId'] === undefined || a.projetoIds.includes(q['projetoId'])) &&
        (q['ativa'] === undefined || a.ativa === (q['ativa'] === 'true')),
      pag,
    );
  });
}
