import {
  criarContexto, semear, resumoSeed, JobAlertas, FakeTokenValidator, UTILIZADORES_DEV,
  ServicoContratos, ServicoRegistosTempo, ServicoProcedimentos, ServicoEstrutura,
  ServicoAfetacoes, ServicoFaturas, ServicoRecursos, ServicoAcessos, ServicoEntregaveis,
  ServicoOrcamentos, ServicoRelatoriosAdHoc, DIRETORIO_SEED, PESSOAS,
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
export const AZURE_USERS: ReadonlyArray<{ id: string; nome: string; prestador?: string }> = PESSOAS;
export const nomeAzure = (id: string): string => AZURE_USERS.find((u) => u.id === id)?.nome ?? id;
export const prestadorAzure = (id: string): string | undefined => AZURE_USERS.find((u) => u.id === id)?.prestador;

/**
 * Versão do formato dos dados guardados no browser. Bastam dados novos no seed
 * ou campos novos nas entidades para a memória antiga ficar desatualizada — e o
 * utilizador não tem como saber que o que vê é de uma versão anterior. Subir
 * este número repõe a demonstração no arranque seguinte.
 */
const VERSAO_DADOS = '2026-07-28.relatorios-adhoc';
const CHAVE_VERSAO = 'chora:versao';

function criarReposLocais(): Repositorios {
  const r = <T extends { id: string }>(nome: string) => new RepositorioLocalStorage<T>(nome);
  return {
    procedimentos: r('procedimentos'), lotes: r('lotes'), contratos: r('contratos'),
    dotacoes: r('dotacoes'), perfis: r('perfis'), alteracoes: r('alteracoes'), entregaveis: r('entregaveis'),
    recursos: r('recursos'), afetacoes: r('afetacoes'), registosTempo: r('registosTempo'),
    compromissos: r('compromissos'), faturas: r('faturas'), documentosHabilitacao: r('documentosHabilitacao'),
    alertas: r('alertas'), eventosAuditoria: r('eventosAuditoria'), contratoProjetos: r('contratoProjetos'),
    acessos: r('acessos'), relatoriosEvidencia: r('relatoriosEvidencia'),
    projetos: r('projetos'), orcamentos: r('orcamentos'), relatoriosAdHoc: r('relatoriosAdHoc'),
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
  readonly entregaveis: ServicoEntregaveis;
  readonly orcamentos: ServicoOrcamentos;
  readonly relatoriosAdHoc: ServicoRelatoriosAdHoc;
  private utilizadorId = 'oid-gestor-contrato';

  constructor() {
    const tokenValidator = new FakeTokenValidator(UTILIZADORES_DEV, relogioSistema);
    this.ctx = criarContexto({ tokenValidator, relogio: relogioSistema, repos: criarReposLocais(), diretorio: DIRETORIO_SEED });
    this.contratos = new ServicoContratos(this.ctx);
    this.registos = new ServicoRegistosTempo(this.ctx);
    this.procedimentos = new ServicoProcedimentos(this.ctx);
    this.estrutura = new ServicoEstrutura(this.ctx);
    this.afetacoes = new ServicoAfetacoes(this.ctx);
    this.faturas = new ServicoFaturas(this.ctx);
    this.recursos = new ServicoRecursos(this.ctx);
    this.acessos = new ServicoAcessos(this.ctx);
    this.entregaveis = new ServicoEntregaveis(this.ctx);
    this.orcamentos = new ServicoOrcamentos(this.ctx);
    this.relatoriosAdHoc = new ServicoRelatoriosAdHoc(this.ctx);
  }

  /**
   * Semeia no primeiro arranque, repõe quando o formato dos dados mudou, e
   * reavalia SEMPRE as decisões.
   *
   * As decisões guardadas trazem prazos e opções calculados no dia em que foram
   * geradas: sem reavaliar, a fila envelhece silenciosamente e — pior — dados
   * gravados por uma versão anterior nunca ganham os campos novos. A
   * reconciliação preserva o que o gestor decidiu (em curso, dispensada), pelo
   * que reavaliar em cada arranque não custa nada ao utilizador.
   */
  async inicializar(): Promise<void> {
    const vazio = (await this.ctx.repos.procedimentos.todos()).length === 0;
    if (vazio || localStorage.getItem(CHAVE_VERSAO) !== VERSAO_DADOS) {
      this.limpar();
      await semear(this.ctx);
      localStorage.setItem(CHAVE_VERSAO, VERSAO_DADOS);
    }
    await new JobAlertas(this.ctx).executar();
  }

  /** Apaga tudo o que é da aplicação, sem recarregar. */
  private limpar(): void {
    for (const chave of Object.keys(localStorage)) {
      if (chave.startsWith('chora:')) localStorage.removeItem(chave);
    }
  }

  /** Repõe os dados de demonstração (limpa localStorage e semeia de novo). */
  async reporSeed(): Promise<void> {
    this.limpar();
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
