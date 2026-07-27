import type { DataISO, Relogio } from '@chora/domain';
import { relogioSistema } from '@chora/domain';
import { criarRepositoriosMemoria, type Repositorios } from './repositorios/memoria/index.js';
import { criarGeradorSequencial, type GeradorId } from './util/id.js';
import { ServicoAuditoria } from './servicos/auditoria.js';
import type { TokenValidator } from './auth/token-validator.js';

/** Configuração de negócio ajustável (secção 6: valores configuráveis). */
export interface Config {
  duracaoMaximaDiariaMin: number;
  feriadosMoveis: DataISO[];
  retencaoAuditoriaAnos: number;
}

export const CONFIG_OMISSAO: Config = {
  duracaoMaximaDiariaMin: 720,
  feriadosMoveis: [],
  retencaoAuditoriaAnos: 5,
};

/**
 * Diretório de pessoas (Entra ID / Azure). Não é uma entidade do domínio: as
 * pessoas não se criam aqui, herdam-se do workspace. O assistente precisa dele
 * para resolver «o Diogo Marques» num identificador — sem isto só se poderia
 * falar em `oid-recurso-02`.
 */
export interface Diretorio {
  nome(id: string): string | undefined;
  /** Pessoas cujo nome corresponde ao texto (correspondência tolerante). */
  procurar(texto: string): Array<{ id: string; nome: string }>;
}

/** Diretório vazio — a aplicação funciona sem ele, só não resolve nomes. */
export const DIRETORIO_VAZIO: Diretorio = { nome: () => undefined, procurar: () => [] };

/** Contentor de dependências da aplicação. */
export interface Contexto {
  repos: Repositorios;
  relogio: Relogio;
  ids: GeradorId;
  auditoria: ServicoAuditoria;
  config: Config;
  tokenValidator: TokenValidator;
  diretorio: Diretorio;
}

export interface OpcoesContexto {
  relogio?: Relogio;
  ids?: GeradorId;
  config?: Partial<Config>;
  tokenValidator: TokenValidator;
  repos?: Repositorios;
  diretorio?: Diretorio;
}

export function criarContexto(opcoes: OpcoesContexto): Contexto {
  const relogio = opcoes.relogio ?? relogioSistema;
  const ids = opcoes.ids ?? criarGeradorSequencial();
  const repos = opcoes.repos ?? criarRepositoriosMemoria();
  const config: Config = { ...CONFIG_OMISSAO, ...opcoes.config };
  return {
    repos,
    relogio,
    ids,
    config,
    tokenValidator: opcoes.tokenValidator,
    diretorio: opcoes.diretorio ?? DIRETORIO_VAZIO,
    auditoria: new ServicoAuditoria(repos, relogio, ids),
  };
}
