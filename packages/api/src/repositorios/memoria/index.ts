import type {
  Afetacao,
  Alerta,
  Alteracao,
  Compromisso,
  Contrato,
  DocumentoHabilitacao,
  Dotacao,
  EventoAuditoria,
  Fatura,
  Lote,
  PerfilContratual,
  Procedimento,
  Recurso,
  RegistoTempo,
} from '@chora/domain';
import { RepositorioMemoria } from './repositorio-memoria.js';

/** Conjunto de repositórios da aplicação. */
export interface Repositorios {
  procedimentos: RepositorioMemoria<Procedimento>;
  lotes: RepositorioMemoria<Lote>;
  contratos: RepositorioMemoria<Contrato>;
  dotacoes: RepositorioMemoria<Dotacao>;
  perfis: RepositorioMemoria<PerfilContratual>;
  alteracoes: RepositorioMemoria<Alteracao>;
  recursos: RepositorioMemoria<Recurso>;
  afetacoes: RepositorioMemoria<Afetacao>;
  registosTempo: RepositorioMemoria<RegistoTempo>;
  compromissos: RepositorioMemoria<Compromisso>;
  faturas: RepositorioMemoria<Fatura>;
  documentosHabilitacao: RepositorioMemoria<DocumentoHabilitacao>;
  alertas: RepositorioMemoria<Alerta>;
  eventosAuditoria: RepositorioMemoria<EventoAuditoria>;
  /** Associações N:N contrato↔projeto (RN-103). */
  contratoProjetos: RepositorioMemoria<{ id: string; contratoId: string; projetoId: string }>;
  /** Papéis aplicacionais por utilizador (secção 9.3). Gerido em "Gestão de acessos". */
  acessos: RepositorioMemoria<Acesso>;
  /** Relatórios de evidência de decisão de fatura (RN-604), imutáveis. */
  relatoriosEvidencia: RepositorioMemoria<RelatorioEvidencia>;
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
  };
}

export { RepositorioMemoria };
