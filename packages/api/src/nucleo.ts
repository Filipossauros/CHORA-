/**
 * Núcleo da API sem dependências de HTTP (Fastify). Reúne o que é reutilizável
 * fora de um servidor — nomeadamente no browser, para a demonstração estática
 * (GitHub Pages). NÃO importar `server.ts` a partir daqui.
 */
export { criarContexto, CONFIG_OMISSAO, type Contexto, type Config } from './contexto.js';
export { criarRepositoriosMemoria, type Repositorios, type ContratoProjeto, type Projeto, type OrcamentoGuardado, type RelatorioAdHoc } from './repositorios/memoria/index.js';
export { RepositorioMemoria } from './repositorios/memoria/repositorio-memoria.js';
export { normalizarPaginacao } from './repositorios/tipos.js';
export type { Repository, Filtro, Ordenacao, Pagina, Paginacao } from './repositorios/tipos.js';
export { criarGeradorSequencial } from './util/id.js';
export { FakeTokenValidator, type UtilizadorDev } from './auth/fake-token-validator.js';
export { podeExecutar, temPapelGestao, type Operacao } from './auth/permissoes.js';
export type { ContextoUtilizador } from './auth/token-validator.js';
export { ServicoRegistosTempo, type NovoRegisto, type ResultadoItem } from './servicos/registos-tempo.js';
export { ServicoContratos } from './servicos/contratos.js';
export { ServicoProcedimentos, type NovoProcedimento } from './servicos/procedimentos.js';
export { ServicoEstrutura } from './servicos/estrutura.js';
export { ServicoAfetacoes, type NovaAfetacao } from './servicos/afetacoes.js';
export { ServicoFaturas, gerarFraseEvidencia } from './servicos/faturas.js';
export { ServicoRecursos, ServicoAcessos } from './servicos/recursos-acessos.js';
export { ServicoAlertas, ATO_RESOLVE } from './servicos/alertas.js';
export { ServicoEntregaveis } from './servicos/entregaveis.js';
export { ServicoOrcamentos, type OrcamentoComResumo } from './servicos/orcamentos.js';
export { ServicoRelatoriosAdHoc, type NovoRelatorioAdHoc } from './servicos/relatorios-adhoc.js';
export { executarRelatorio, periodoDoRelatorio, type ResultadoRelatorio, type MotivoFalha } from './servicos/relatorios-executar.js';
export { folhasDe as folhasDaTabela, ficheiro as nomeFicheiroTabela } from './assistente/capacidades/tabela.js';
export { ServicoAssistente, type Interpretacao, type Esclarecimento } from './servicos/assistente.js';
export { CAPACIDADES, capacidadePorNome } from './assistente/capacidades/index.js';
export { encaminhar, normalizar, numeroContratoNaFrase, valorHoraNaFrase, montanteNaFrase, type Encaminhamento } from './assistente/router.js';
export { periodoNaFrase, periodoERelativo, anoCorrente, type Periodo } from './assistente/tempo.js';
export { ErroEsclarecimento } from './assistente/erros.js';
export { AgenteLocal, CONFIG_MODELO_OMISSAO, type ConfigModeloLocal } from './assistente/agente-local.js';
export type {
  Capacidade, CapacidadePublica, TipoCapacidade, Simulacao, RegraAvaliada,
  ResultadoCapacidade, TabelaResposta, TabelaTrabalho, ChaveLinha, TipoEntidade,
  UiEmbebida, Exportavel, ContextoConversa,
} from './assistente/tipos.js';
export { type Diretorio, DIRETORIO_VAZIO } from './contexto.js';
export { DIRETORIO_SEED, PESSOAS } from './seed/diretorio.js';
export type { Acesso, RelatorioEvidencia, PassoRelatorio } from './repositorios/memoria/index.js';
export { JobAlertas, NotifierConsola } from './alertas/job-alertas.js';
export { paraProblema, ErroProibido, ErroNaoEncontrado, type Problema } from './erros/problema.js';
export { semear, resumoSeed } from './seed/semear.js';
export { UTILIZADORES_DEV } from './seed/utilizadores.js';
