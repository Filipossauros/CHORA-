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

/** Contentor de dependências da aplicação. */
export interface Contexto {
  repos: Repositorios;
  relogio: Relogio;
  ids: GeradorId;
  auditoria: ServicoAuditoria;
  config: Config;
  tokenValidator: TokenValidator;
}

export interface OpcoesContexto {
  relogio?: Relogio;
  ids?: GeradorId;
  config?: Partial<Config>;
  tokenValidator: TokenValidator;
  repos?: Repositorios;
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
    auditoria: new ServicoAuditoria(repos, relogio, ids),
  };
}
