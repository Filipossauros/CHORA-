import {
  OpenApiGeneratorV31,
  OpenAPIRegistry,
  extendZodWithOpenApi,
} from '@asteasolutions/zod-to-openapi';
import { z } from 'zod';
import {
  zEstadoContrato, zEstadoRegistoTempo, zEstadoFatura, zTipoDotacao,
  zTipoProcedimento, zTipoAlteracao, zUnidadeMedida, zPapelAplicacional,
} from '@chora/domain';

extendZodWithOpenApi(z);

/**
 * Gera o documento OpenAPI 3.1 a partir dos esquemas Zod do domínio (ADR-05).
 * As enumerações provêm diretamente do código; as rotas espelham a secção 8.
 */
export function gerarOpenApi(): Record<string, unknown> {
  const registry = new OpenAPIRegistry();

  registry.register('EstadoContrato', zEstadoContrato.openapi('EstadoContrato'));
  registry.register('EstadoRegistoTempo', zEstadoRegistoTempo.openapi('EstadoRegistoTempo'));
  registry.register('EstadoFatura', zEstadoFatura.openapi('EstadoFatura'));
  registry.register('TipoDotacao', zTipoDotacao.openapi('TipoDotacao'));
  registry.register('TipoProcedimento', zTipoProcedimento.openapi('TipoProcedimento'));
  registry.register('TipoAlteracao', zTipoAlteracao.openapi('TipoAlteracao'));
  registry.register('UnidadeMedida', zUnidadeMedida.openapi('UnidadeMedida'));
  registry.register('PapelAplicacional', zPapelAplicacional.openapi('PapelAplicacional'));

  const zProblema = z
    .object({
      type: z.string(),
      title: z.string(),
      status: z.number().int(),
      detail: z.string(),
      regra: z.string().optional(),
      requisito: z.string().optional(),
      base: z.string().optional(),
      dados: z.record(z.unknown()).optional(),
      excecaoFundamentavel: z.boolean().optional(),
    })
    .openapi('Problema');
  registry.register('Problema', zProblema);

  const generator = new OpenApiGeneratorV31(registry.definitions);
  const componentes = generator.generateComponents();

  const respostaProblema = (status: string, descricao: string) => ({
    [status]: {
      description: descricao,
      content: { 'application/problem+json': { schema: { $ref: '#/components/schemas/Problema' } } },
    },
  });

  const seguranca = [{ bearerAuth: [] as string[] }];

  const paginacaoParams = [
    { name: 'pagina', in: 'query', schema: { type: 'integer', minimum: 1 } },
    { name: 'tamanho', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 200 } },
  ];

  const idRelatorio = { name: 'id', in: 'path', required: true, schema: { type: 'string' } };
  const paths: Record<string, unknown> = {
    '/api/v1/contratos': {
      get: {
        summary: 'Lista contratos', tags: ['Contratos'], security: seguranca,
        parameters: [
          { name: 'estado', in: 'query', schema: { $ref: '#/components/schemas/EstadoContrato' } },
          { name: 'numero', in: 'query', schema: { type: 'string' } },
          { name: 'gestorId', in: 'query', schema: { type: 'string' } },
          ...paginacaoParams,
        ],
        responses: { '200': { description: 'Página de contratos' }, ...respostaProblema('401', 'Não autenticado') },
      },
      post: {
        summary: 'Cria contrato', tags: ['Contratos'], security: seguranca,
        responses: { '201': { description: 'Contrato criado' }, ...respostaProblema('403', 'Papel insuficiente'), ...respostaProblema('422', 'Violação de regra') },
      },
    },
    '/api/v1/contratos/{id}': {
      get: { summary: 'Obtém contrato', tags: ['Contratos'], security: seguranca, parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: { '200': { description: 'Contrato' }, ...respostaProblema('404', 'Não encontrado') } },
      delete: { summary: 'Elimina contrato e dependentes (auditoria conserva o rasto)', tags: ['Contratos'], security: seguranca, parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: { '200': { description: 'Contrato eliminado' }, ...respostaProblema('400', 'Motivo em falta'), ...respostaProblema('403', 'Papel insuficiente'), ...respostaProblema('404', 'Não encontrado') } },
    },
    '/api/v1/contratos/{id}/resumo-execucao': {
      get: { summary: 'Resumo de execução física e financeira', tags: ['Contratos'], security: seguranca, parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: { '200': { description: 'Resumo agregado' } } },
    },
    '/api/v1/contratos/{id}/estado': {
      post: { summary: 'Transição de estado do contrato', tags: ['Contratos'], security: seguranca, parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: { '200': { description: 'Estado atualizado' }, ...respostaProblema('409', 'Transição inválida') } },
    },
    '/api/v1/contratos/{id}/entregaveis': {
      get: { summary: 'Lista os entregáveis do contrato e a repartição do preço', tags: ['Entregáveis'], security: seguranca, parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: { '200': { description: 'Entregáveis e repartição' }, ...respostaProblema('404', 'Não encontrado') } },
      post: { summary: 'Cria entregável (valor em euros e/ou percentagem do contrato)', tags: ['Entregáveis'], security: seguranca, parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: { '201': { description: 'Entregável criado' }, ...respostaProblema('400', 'Sem valor, ou contrato não é chave-na-mão'), ...respostaProblema('403', 'Papel insuficiente'), ...respostaProblema('422', 'Violação de regra (RN-112)') } },
    },
    '/api/v1/entregaveis/{entId}': {
      patch: { summary: 'Atualiza entregável ainda não faturado', tags: ['Entregáveis'], security: seguranca, parameters: [{ name: 'entId', in: 'path', required: true, schema: { type: 'string' } }], responses: { '200': { description: 'Entregável atualizado' }, ...respostaProblema('400', 'Já faturado'), ...respostaProblema('422', 'Violação de regra (RN-112)') } },
      delete: { summary: 'Remove entregável ainda não faturado', tags: ['Entregáveis'], security: seguranca, parameters: [{ name: 'entId', in: 'path', required: true, schema: { type: 'string' } }], responses: { '200': { description: 'Entregável removido' }, ...respostaProblema('400', 'Já faturado'), ...respostaProblema('404', 'Não encontrado') } },
    },
    '/api/v1/entregaveis/{entId}/entrega': {
      post: { summary: 'Assinala a entrega — facto gerador da faturação (RN-608)', tags: ['Entregáveis'], security: seguranca, parameters: [{ name: 'entId', in: 'path', required: true, schema: { type: 'string' } }], responses: { '200': { description: 'Entrega registada' }, ...respostaProblema('403', 'Papel insuficiente'), ...respostaProblema('404', 'Não encontrado') } },
    },
    '/api/v1/entregaveis/{entId}/anular-entrega': {
      post: { summary: 'Anula a entrega mediante motivo (bloqueado após faturação)', tags: ['Entregáveis'], security: seguranca, parameters: [{ name: 'entId', in: 'path', required: true, schema: { type: 'string' } }], responses: { '200': { description: 'Entrega anulada' }, ...respostaProblema('400', 'Já faturado ou motivo em falta') } },
    },
    '/api/v1/contratos/{id}/bolsa-horas': {
      put: { summary: 'Define o valor da bolsa de horas do contrato chave-na-mão', tags: ['Entregáveis'], security: seguranca, parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: { '200': { description: 'Valor definido' }, ...respostaProblema('400', 'Contrato não é chave-na-mão'), ...respostaProblema('422', 'Violação de regra (RN-112)') } },
    },
    '/api/v1/contratos/{id}/excecoes': {
      post: { summary: 'Regista exceção fundamentada a limite legal', tags: ['Contratos'], security: seguranca, parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: { '201': { description: 'Exceção registada' }, ...respostaProblema('403', 'Papel insuficiente') } },
    },
    '/api/v1/registos-tempo': {
      get: {
        summary: 'Lista registos de tempo', tags: ['Registos de tempo'], security: seguranca,
        parameters: [
          { name: 'contratoId', in: 'query', schema: { type: 'string' } },
          { name: 'projetoId', in: 'query', schema: { type: 'string' } },
          { name: 'recursoId', in: 'query', schema: { type: 'string' } },
          { name: 'estado', in: 'query', schema: { $ref: '#/components/schemas/EstadoRegistoTempo' } },
          { name: 'de', in: 'query', schema: { type: 'string', format: 'date' } },
          { name: 'ate', in: 'query', schema: { type: 'string', format: 'date' } },
          ...paginacaoParams,
        ],
        responses: { '200': { description: 'Página de registos' } },
      },
      post: { summary: 'Cria registo (RASCUNHO)', tags: ['Registos de tempo'], security: seguranca, responses: { '201': { description: 'Registo criado' }, ...respostaProblema('422', 'Violação de regra') } },
    },
    '/api/v1/registos-tempo/{id}/submeter': {
      post: { summary: 'Submete registo', tags: ['Registos de tempo'], security: seguranca, parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: { '200': { description: 'Registo submetido' } } },
    },
    '/api/v1/registos-tempo/{id}/anular': {
      post: { summary: 'Anula registo (lógica, com motivo)', tags: ['Registos de tempo'], security: seguranca, parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: { '200': { description: 'Registo anulado' }, ...respostaProblema('422', 'Violação de regra') } },
    },
    '/api/v1/registos-tempo:aprovar': {
      post: { summary: 'Aprova registos em lote', tags: ['Registos de tempo'], security: seguranca, responses: { '200': { description: 'Resultado por item' }, ...respostaProblema('403', 'Papel insuficiente') } },
    },
    '/api/v1/registos-tempo:rejeitar': {
      post: { summary: 'Rejeita registos em lote', tags: ['Registos de tempo'], security: seguranca, responses: { '200': { description: 'Resultado por item' } } },
    },
    '/api/v1/registos-tempo/meus': {
      get: { summary: 'Os meus registos (RN-407)', tags: ['Registos de tempo'], security: seguranca, responses: { '200': { description: 'Lista' } } },
    },
    '/api/v1/relatorios/horas-por-perfil': {
      get: { summary: 'Horas por perfil', tags: ['Relatórios'], security: seguranca, parameters: [{ name: 'contratoId', in: 'query', required: true, schema: { type: 'string' } }], responses: { '200': { description: 'Relatório' } } },
    },
    '/api/v1/relatorios/execucao-financeira': {
      get: { summary: 'Execução financeira', tags: ['Relatórios'], security: seguranca, parameters: [{ name: 'contratoId', in: 'query', required: true, schema: { type: 'string' } }], responses: { '200': { description: 'Relatório' } } },
    },
    '/api/v1/relatorios/ad-hoc': {
      get: { summary: 'Relatórios compostos no assistente (definições, não dados)', tags: ['Relatórios'], security: seguranca, responses: { '200': { description: 'Lista de receitas' } } },
    },
    '/api/v1/relatorios/ad-hoc/{id}': {
      get: { summary: 'Obtém a definição de um relatório ad-hoc', tags: ['Relatórios'], security: seguranca, parameters: [idRelatorio], responses: { '200': { description: 'Definição' }, ...respostaProblema('404', 'Inexistente') } },
      patch: { summary: 'Alterna a leitura do período entre relativa e fixa', tags: ['Relatórios'], security: seguranca, parameters: [idRelatorio], responses: { '200': { description: 'Definição atualizada' }, ...respostaProblema('403', 'Papel insuficiente') } },
      delete: { summary: 'Apaga um relatório ad-hoc', tags: ['Relatórios'], security: seguranca, parameters: [idRelatorio], responses: { '204': { description: 'Apagado' }, ...respostaProblema('403', 'Papel insuficiente') } },
    },
    '/api/v1/relatorios/ad-hoc/{id}/executar': {
      post: { summary: 'Executa a receita com os dados de hoje e as permissões de quem pede', tags: ['Relatórios'], security: seguranca, parameters: [idRelatorio], responses: { '200': { description: 'Tabela, ou o passo que impediu a execução' }, ...respostaProblema('404', 'Inexistente') } },
    },
    '/api/v1/alertas': {
      get: { summary: 'Lista alertas', tags: ['Alertas'], security: seguranca, responses: { '200': { description: 'Lista de alertas' } } },
    },
    '/api/v1/jobs/alertas:executar': {
      post: { summary: 'Executa o job de alertas (apenas dev)', tags: ['Alertas'], security: seguranca, responses: { '200': { description: 'Alertas gerados' } } },
    },
    '/api/v1/auditoria': {
      get: { summary: 'Consulta a trilha de auditoria', tags: ['Auditoria'], security: seguranca, responses: { '200': { description: 'Eventos de auditoria' }, ...respostaProblema('403', 'Papel insuficiente') } },
    },
  };

  const schemas = (componentes.components?.schemas ?? {}) as Record<string, unknown>;

  return {
    openapi: '3.1.0',
    info: {
      title: 'CHORA+ API',
      version: '1.0.0',
      description: 'API REST do CHORA+ — controlo de horas e registo de atividades. Erros em application/problem+json (ADR-06).',
    },
    servers: [{ url: 'http://localhost:7071', description: 'Desenvolvimento local' }],
    tags: [
      { name: 'Contratos' }, { name: 'Registos de tempo' },
      { name: 'Relatórios' }, { name: 'Alertas' }, { name: 'Auditoria' },
    ],
    paths,
    components: {
      securitySchemes: {
        bearerAuth: { type: 'http', scheme: 'bearer', description: 'Token via SDK.getAccessToken() do Azure DevOps.' },
      },
      schemas,
    },
  };
}
