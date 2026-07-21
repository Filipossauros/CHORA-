/**
 * Núcleo da API sem dependências de HTTP (Fastify). Reúne o que é reutilizável
 * fora de um servidor — nomeadamente no browser, para a demonstração estática
 * (GitHub Pages). NÃO importar `server.ts` a partir daqui.
 */
export { criarContexto, CONFIG_OMISSAO, type Contexto, type Config } from './contexto.js';
export { criarRepositoriosMemoria, type Repositorios, type ContratoProjeto } from './repositorios/memoria/index.js';
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
export type { Acesso, RelatorioEvidencia } from './repositorios/memoria/index.js';
export { JobAlertas, NotifierConsola } from './alertas/job-alertas.js';
export { paraProblema, ErroProibido, ErroNaoEncontrado, type Problema } from './erros/problema.js';
export { semear, resumoSeed } from './seed/semear.js';
export { UTILIZADORES_DEV } from './seed/utilizadores.js';
