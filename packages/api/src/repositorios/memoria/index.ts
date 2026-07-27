import type {
  Afetacao,
  Alerta,
  Alteracao,
  Compromisso,
  Contrato,
  DocumentoHabilitacao,
  Dotacao,
  Entregavel,
  EventoAuditoria,
  Fatura,
  Lote,
  PerfilContratual,
  Procedimento,
  Recurso,
  RegistoTempo,
} from '@chora/domain';
import { RepositorioMemoria } from './repositorio-memoria.js';
import type { Repository } from '../tipos.js';

export type ContratoProjeto = { id: string; contratoId: string; projetoId: string };

/**
 * Projeto da unidade. Até aqui os projetos eram só identificadores soltos nas
 * afetações; a orçamentação organiza-se por projeto, e um orçamento com
 * «proj-P1» em vez de um nome não se apresenta a ninguém.
 */
export interface Projeto {
  id: string;
  nome: string;
  ativo: boolean;
}

/**
 * Conjunto de repositórios da aplicação. Depende da interface `Repository<T>`
 * (ADR-03) — a implementação pode ser em memória (servidor), localStorage
 * (browser) ou MongoDB (produção) sem tocar em serviços nem rotas.
 */
export interface Repositorios {
  procedimentos: Repository<Procedimento>;
  lotes: Repository<Lote>;
  contratos: Repository<Contrato>;
  dotacoes: Repository<Dotacao>;
  perfis: Repository<PerfilContratual>;
  entregaveis: Repository<Entregavel>;
  alteracoes: Repository<Alteracao>;
  recursos: Repository<Recurso>;
  afetacoes: Repository<Afetacao>;
  registosTempo: Repository<RegistoTempo>;
  compromissos: Repository<Compromisso>;
  faturas: Repository<Fatura>;
  documentosHabilitacao: Repository<DocumentoHabilitacao>;
  alertas: Repository<Alerta>;
  eventosAuditoria: Repository<EventoAuditoria>;
  /** Associações N:N contrato↔projeto (RN-103). */
  contratoProjetos: Repository<ContratoProjeto>;
  /** Papéis aplicacionais por utilizador (secção 9.3). Gerido em "Gestão de acessos". */
  acessos: Repository<Acesso>;
  /** Relatórios de evidência de decisão de fatura (RN-604), imutáveis. */
  relatoriosEvidencia: Repository<RelatorioEvidencia>;
  /** Projetos da unidade — o eixo por que se organiza a orçamentação. */
  projetos: Repository<Projeto>;
  /** Orçamentos anuais em preparação ou fechados. */
  orcamentos: Repository<OrcamentoGuardado>;
}

/** Orçamento anual da unidade, tal como fica guardado. */
export interface OrcamentoGuardado {
  id: string;
  ano: number;
  estado: 'EM_PREPARACAO' | 'FECHADO';
  linhas: import('@chora/domain').LinhaOrcamento[];
  criadoEm: string;
  criadoPor: string;
  atualizadoEm: string;
  atualizadoPor: string;
  fechadoEm?: string;
}

/** Relatório de evidência gerado na decisão de uma fatura (RN-604, imutável). */
export interface RelatorioEvidencia {
  id: string;
  faturaId: string;
  contratoId: string;
  decisao: 'VALIDADA' | 'INVALIDADA';
  motivo?: string;
  frase: string;
  linhas: Array<{ perfil?: string; recurso?: string; quantidadeFatura: number; quantidadeAprovada: number; valorFatura: number; valorAprovado: number; confere: boolean }>;
  geradoEm: string;
  geradoPor: string;
}

/** Registo de acesso: papel(éis) de um utilizador no CHORA+ (autorização). */
export interface Acesso {
  id: string;
  utilizadorId: string;
  papeis: import('@chora/domain').PapelAplicacional[];
  entidade?: string;
  ambito?: string;
  ativo: boolean;
}

export function criarRepositoriosMemoria(): Repositorios {
  return {
    procedimentos: new RepositorioMemoria('procedimentos'),
    lotes: new RepositorioMemoria('lotes'),
    contratos: new RepositorioMemoria('contratos'),
    dotacoes: new RepositorioMemoria('dotacoes'),
    perfis: new RepositorioMemoria('perfis'),
    entregaveis: new RepositorioMemoria('entregaveis'),
    alteracoes: new RepositorioMemoria('alteracoes'),
    recursos: new RepositorioMemoria('recursos'),
    afetacoes: new RepositorioMemoria('afetacoes'),
    registosTempo: new RepositorioMemoria('registosTempo'),
    compromissos: new RepositorioMemoria('compromissos'),
    faturas: new RepositorioMemoria('faturas'),
    documentosHabilitacao: new RepositorioMemoria('documentosHabilitacao'),
    alertas: new RepositorioMemoria('alertas'),
    eventosAuditoria: new RepositorioMemoria('eventosAuditoria'),
    contratoProjetos: new RepositorioMemoria('contratoProjetos'),
    acessos: new RepositorioMemoria('acessos'),
    relatoriosEvidencia: new RepositorioMemoria('relatoriosEvidencia'),
    projetos: new RepositorioMemoria('projetos'),
    orcamentos: new RepositorioMemoria('orcamentos'),
  };
}

export { RepositorioMemoria };
