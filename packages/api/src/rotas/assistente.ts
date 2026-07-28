import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { Contexto } from '../contexto.js';
import { exigirUtilizador } from '../servidor/seguranca.js';
import { ErroValidacao } from '../erros/problema.js';
import { ServicoAssistente } from '../servicos/assistente.js';

function parse<T>(s: z.ZodType<T>, corpo: unknown): T {
  const r = s.safeParse(corpo);
  if (!r.success) throw new ErroValidacao('Corpo inválido.', r.error.issues);
  return r.data;
}

const zConversa = z.object({
  contratoId: z.string().optional(), contratoNumero: z.string().optional(),
  projetoId: z.string().optional(), projetoNome: z.string().optional(),
  pessoaId: z.string().optional(), pessoaNome: z.string().optional(),
  perfilNome: z.string().optional(),
  periodoDe: z.string().optional(), periodoAte: z.string().optional(),
});

const zInterpretar = z.object({
  frase: z.string().min(1),
  /** Memória da conversa devolvida no turno anterior. */
  conversa: zConversa.optional(),
  /**
   * Encaminhamento já resolvido por um modelo no cliente. O servidor não confia
   * nele: valida o nome contra o catálogo, os parâmetros contra o esquema e o
   * papel contra a matriz, exatamente como faria com o seu próprio.
   */
  encaminhamento: z.object({
    capacidade: z.string().min(1),
    parametros: z.record(z.unknown()),
    confianca: z.number().min(0).max(1).optional(),
  }).optional(),
});

const zExecutar = z.object({
  capacidade: z.string().min(1),
  parametros: z.record(z.unknown()),
  frase: z.string().optional(),
  conversa: zConversa.optional(),
});

export function rotasAssistente(app: FastifyInstance, ctx: Contexto): void {
  const servico = new ServicoAssistente(ctx);

  /** Catálogo público: o que o assistente pode fazer, e mais nada. */
  app.get('/api/v1/assistente/capacidades', async (req) => {
    exigirUtilizador(req);
    return { dados: servico.capacidades() };
  });

  app.get('/api/v1/assistente/sugestoes', async (req) => {
    const u = exigirUtilizador(req);
    return { dados: servico.sugestoes(u.papeis) };
  });

  /** Consulta corre já; ação devolve a simulação e espera confirmação. */
  app.post('/api/v1/assistente/interpretar', async (req) => {
    const u = exigirUtilizador(req);
    const d = parse(zInterpretar, req.body);
    return servico.interpretar(
      d.frase, u,
      d.encaminhamento !== undefined ? { ...d.encaminhamento, confianca: d.encaminhamento.confianca ?? 0.5, origem: 'MODELO' as const } : undefined,
      d.conversa ?? {},
    );
  });

  /** Executa a ação depois de confirmada. Revalida tudo. */
  app.post('/api/v1/assistente/executar', async (req) => {
    const u = exigirUtilizador(req);
    const d = parse(zExecutar, req.body);
    return servico.executar(d.capacidade, d.parametros, d.frase ?? '', u, d.conversa ?? {});
  });
}
