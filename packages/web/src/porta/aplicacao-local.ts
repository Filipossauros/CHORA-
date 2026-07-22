import {
  criarContexto, semear, resumoSeed, JobAlertas, FakeTokenValidator, UTILIZADORES_DEV,
  ServicoContratos, ServicoRegistosTempo, ServicoProcedimentos, ServicoEstrutura,
  ServicoAfetacoes, ServicoFaturas, ServicoRecursos, ServicoAcessos,
  type Contexto, type Repositorios, type ContextoUtilizador,
} from '@chora/api/nucleo';
import { relogioSistema, type PapelAplicacional } from '@chora/domain';
import { RepositorioLocalStorage } from '../persistencia/repositorio-localstorage.js';

/** Utilizadores de demonstração (papéis fixos; espelham o seed). */
export const UTILIZADORES = [
  { id: 'oid-gestor-contrato', nome: 'Gestor de Contrato', papeis: ['GESTOR_CONTRATO'] as PapelAplicacional[] },
  { id: 'oid-gestor-tecnico', nome: 'Gestor Técnico', papeis: ['GESTOR_TECNICO'] as PapelAplicacional[] },
  { id: 'oid-recurso-01', nome: 'Elemento — recurso 01', papeis: ['ELEMENTO_EQUIPA_TECNICA'] as PapelAplicacional[] },
  { id: 'oid-recurso-02', nome: 'Elemento — recurso 02', papeis: ['ELEMENTO_EQUIPA_TECNICA'] as PapelAplicacional[] },
];

/**
 * Diretório de utilizadores do workspace Azure (simulado). Todos os utilizadores
 * têm conta Azure — não se criam manualmente. Serve para selecionar o gestor do
 * contrato e para apresentar o nome/prestador dos recursos.
 */
export const AZURE_USERS: Array<{ id: string; nome: string; prestador?: string }> = [
  { id: 'oid-gestor-contrato', nome: 'Ana Gestora (Contraente)' },
  { id: 'oid-gestor-tecnico', nome: 'Bruno Técnico (Contraente)' },
  { id: 'oid-recurso-01', nome: 'Carla Andrade', prestador: 'Prestador Alfa, Lda.' },
  { id: 'oid-recurso-02', nome: 'Diogo Marques', prestador: 'Prestador Alfa, Lda.' },
  { id: 'oid-recurso-03', nome: 'Eva Nogueira', prestador: 'Subcontratado Beta, S.A.' },
  { id: 'oid-recurso-09', nome: 'Filipe Costa', prestador: 'Prestador Alfa, Lda.' },
];
export const nomeAzure = (id: string): string => AZURE_USERS.find((u) => u.id === id)?.nome ?? id;
export const prestadorAzure = (id: string): string | undefined => AZURE_USERS.find((u) => u.id === id)?.prestador;

function criarReposLocais(): Repositorios {
  const r = <T extends { id: string }>(nome: string) => new RepositorioLocalStorage<T>(nome);
  return {
    procedimentos: r('procedimentos'), lotes: r('lotes'), contratos: r('contratos'),
    dotacoes: r('dotacoes'), perfis: r('perfis'), alteracoes: r('alteracoes'),
    recursos: r('recursos'), afetacoes: r('afetacoes'), registosTempo: r('registosTempo'),
    compromissos: r('compromissos'), faturas: r('faturas'), documentosHabilitacao: r('documentosHabilitacao'),
    alertas: r('alertas'), eventosAuditoria: r('eventosAuditoria'), contratoProjetos: r('contratoProjetos'),
    acessos: r('acessos'), relatoriosEvidencia: r('relatoriosEvidencia'),
  };
}

/** Fachada da aplicação a correr inteiramente no browser (localStorage). */
export class AplicacaoLocal {
  readonly ctx: Contexto;
  readonly contratos: ServicoContratos;
  readonly registos: ServicoRegistosTempo;
  readonly procedimentos: ServicoProcedimentos;
  readonly estrutura: ServicoEstrutura;
  readonly afetacoes: ServicoAfetacoes;
  readonly faturas: ServicoFaturas;
  readonly recursos: ServicoRecursos;
  readonly acessos: ServicoAcessos;
  private utilizadorId = 'oid-gestor-contrato';

  constructor() {
    const tokenValidator = new FakeTokenValidator(UTILIZADORES_DEV, relogioSistema);
    this.ctx = criarContexto({ tokenValidator, relogio: relogioSistema, repos: criarReposLocais() });
    this.contratos = new ServicoContratos(this.ctx);
    this.registos = new ServicoRegistosTempo(this.ctx);
    this.procedimentos = new ServicoProcedimentos(this.ctx);
    this.estrutura = new ServicoEstrutura(this.ctx);
    this.afetacoes = new ServicoAfetacoes(this.ctx);
    this.faturas = new ServicoFaturas(this.ctx);
    this.recursos = new ServicoRecursos(this.ctx);
    this.acessos = new ServicoAcessos(this.ctx);
  }

  /** Semeia se estiver vazio (primeiro arranque) e gera os alertas. */
  async inicializar(): Promise<void> {
    const vazio = (await this.ctx.repos.procedimentos.todos()).length === 0;
    if (vazio) {
      await semear(this.ctx);
      await new JobAlertas(this.ctx).executar();
    }
  }

  /** Repõe os dados de demonstração (limpa localStorage e semeia de novo). */
  async reporSeed(): Promise<void> {
    for (const chave of Object.keys(localStorage)) {
      if (chave.startsWith('chora:')) localStorage.removeItem(chave);
    }
    location.reload();
  }

  async resumo(): Promise<Record<string, number>> {
    return resumoSeed(this.ctx);
  }

  setUtilizador(id: string): void {
    this.utilizadorId = id;
  }

  papeisAtuais(): PapelAplicacional[] {
    return UTILIZADORES.find((u) => u.id === this.utilizadorId)?.papeis ?? ['ELEMENTO_EQUIPA_TECNICA'];
  }

  utilizador(): ContextoUtilizador {
    return { utilizadorId: this.utilizadorId, papeis: this.papeisAtuais(), projetoId: 'proj-P1', validoAte: relogioSistema.agora() };
  }
}

/** Instância única partilhada pela app. */
export const app = new AplicacaoLocal();
