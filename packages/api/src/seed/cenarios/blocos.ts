import type {
  Afetacao, Compromisso, Contrato, Entregavel, Fatura, PerfilContratual, Procedimento, RegistoTempo, Recurso,
} from '@chora/domain';
import { diaDeInstante } from '@chora/domain';
import type { Contexto } from '../../contexto.js';

/**
 * BLOCOS DE CENÁRIO — as peças com que se monta um conjunto de dados pequeno.
 *
 * Deliberadamente separados do seed de cobertura. Aquele existe para que
 * nenhuma regra fique por exercitar e por isso é grande; estes existem para que
 * uma demonstração mostre uma coisa de cada vez, e por isso têm de ser
 * legíveis. Partilhar código entre os dois faria com que mexer num partisse o
 * outro — e o que os separa não é técnica, é finalidade.
 *
 * Tudo é datado a partir de HOJE. Um cenário com datas fixas envelhece e deixa
 * de demonstrar aquilo para que foi feito: um contrato que devia estar a
 * terminar passa a estar terminado, e o alerta que se queria mostrar
 * desaparece.
 */
export class Oficina {
  readonly hoje: string;
  readonly agora: string;
  readonly audit: { criadoEm: string; criadoPor: string; atualizadoEm: string; atualizadoPor: string };

  constructor(private readonly ctx: Contexto) {
    this.agora = ctx.relogio.agora();
    this.hoje = diaDeInstante(this.agora);
    this.audit = { criadoEm: this.agora, criadoPor: 'oid-gestor-contrato', atualizadoEm: this.agora, atualizadoPor: 'oid-gestor-contrato' };
  }

  /** Data deslocada N meses de hoje — negativo para trás. */
  meses(n: number): string {
    const d = new Date(`${this.hoje}T00:00:00Z`);
    d.setUTCMonth(d.getUTCMonth() + n);
    return d.toISOString().slice(0, 10);
  }

  dias(n: number): string {
    const d = new Date(`${this.hoje}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
  }

  private id(prefixo: string): string {
    return this.ctx.ids.novo(prefixo);
  }

  /** As pessoas do diretório que se podem afetar. Sem isto, RN-702 barra tudo. */
  async recursos(): Promise<void> {
    const nipc = (id: string): string => (id === 'oid-recurso-03' ? '500000777' : '500000001');
    for (const id of ['oid-recurso-01', 'oid-recurso-02', 'oid-recurso-03', 'oid-recurso-09']) {
      const r: Recurso = { id, entidadeExecutanteNipc: nipc(id), ativo: true, ...this.audit };
      await this.ctx.repos.recursos.guardar(r);
    }
  }

  async projeto(id: string, nome: string): Promise<string> {
    await this.ctx.repos.projetos.guardar({ id, nome, ativo: true });
    return id;
  }

  async associar(contratoId: string, projetoId: string): Promise<void> {
    await this.ctx.repos.contratoProjetos.guardar({ id: this.id('cp'), contratoId, projetoId });
  }

  /** O procedimento de que descendem os contratos do cenário. */
  async procedimento(numero = 'CP-2026-001'): Promise<Procedimento> {
    const p: Procedimento = {
      id: this.id('proc'), numero, descricao: 'Serviços de desenvolvimento de software',
      tipo: 'CONCURSO_PUBLICO', precoBase: 500_000_00, ...this.audit,
    };
    await this.ctx.repos.procedimentos.guardar(p);
    await this.ctx.repos.lotes.guardar({ id: this.id('lote'), procedimentoId: p.id, numero: 'L1', designacao: 'Lote único', ...this.audit });
    return p;
  }

  async contrato(over: Partial<Contrato> & Pick<Contrato, 'numero' | 'objeto'>): Promise<Contrato> {
    const c: Contrato = {
      id: this.id('ctr'), estado: 'EM_VIGOR', tipologia: 'BOLSA_HORAS',
      numeroProcedimento: 'CP-2026-001', tipoProcedimento: 'CONCURSO_PUBLICO', numeroLote: 1,
      precoContratualInicial: 100_000_00, precoContratualAtual: 100_000_00,
      prestador: { nome: 'Prestador Alfa, Lda.', nipc: '500000001' },
      dataAssinaturaCA: this.meses(-7), dataInicioVigencia: this.meses(-6),
      dataTerminoContratual: this.meses(18), dataTerminoOriginal: this.meses(18),
      vistoTribunalContasNecessario: false,
      gestores: [{ utilizadorId: 'oid-gestor-contrato', principal: true, designadoEm: this.meses(-7) }],
      excecoes: [], ...this.audit, ...over,
    };
    await this.ctx.repos.contratos.guardar(c);
    return c;
  }

  /** Perfil contratual. `horas` é a dotação prevista; `valorHoraEuros` o preço. */
  async perfil(contrato: Contrato, nome: string, horas: number, valorHoraEuros: number): Promise<PerfilContratual> {
    const p: PerfilContratual = {
      id: this.id('perf'), contratoId: contrato.id, nome, quantidadePrevista: horas * 60,
      consomeBolsaValor: false, consomeTrabalhosComplementares: false, perfilDeGestao: false,
      precos: [{ valorHora: Math.round(valorHoraEuros * 100), vigenteDe: contrato.dataInicioVigencia }],
      ...this.audit,
    };
    await this.ctx.repos.perfis.guardar(p);
    return p;
  }

  async afetar(contrato: Contrato, perfil: PerfilContratual, recursoId: string, projetoIds: string[] = []): Promise<Afetacao> {
    const a: Afetacao = {
      id: this.id('afe'), contratoId: contrato.id, perfilId: perfil.id, recursoId,
      projetoIds, vigenteDe: contrato.dataInicioVigencia, ativa: true, ...this.audit,
    };
    await this.ctx.repos.afetacoes.guardar(a);
    return a;
  }

  /** Registos de tempo de uma afetação, um por dia útil recuado a partir de hoje. */
  async execucao(
    af: Afetacao, perfil: PerfilContratual, quantos: number,
    estado: RegistoTempo['estado'] = 'APROVADO', projetoId = 'azure-devops',
  ): Promise<void> {
    const valorHora = perfil.precos[0]?.valorHora ?? 0;
    for (let i = 0; i < quantos; i += 1) {
      const data = this.dias(-(i + 1) * 3);
      const r: RegistoTempo = {
        id: this.id('rt'), afetacaoId: af.id, contratoId: af.contratoId, perfilId: perfil.id,
        recursoId: af.recursoId, projetoId, workItemId: 4000 + i, data, duracao: 480,
        descricaoAtividade: 'Execução contratada', tipoDotacaoConsumida: 'HORAS_BASE',
        valorHoraAplicado: valorHora, valorImputado: 8 * valorHora, estado,
        ...(estado === 'APROVADO' ? { aprovadoPor: 'oid-gestor-contrato', aprovadoEm: this.agora } : {}),
        ...(estado === 'SUBMETIDO' ? { submetidoEm: this.agora } : {}),
        criadoEm: this.agora, criadoPor: af.recursoId, atualizadoEm: this.agora, atualizadoPor: af.recursoId,
      };
      await this.ctx.repos.registosTempo.guardar(r);
    }
  }

  async compromisso(contrato: Contrato, montante: number): Promise<Compromisso> {
    const c: Compromisso = {
      id: this.id('cmp'), contratoId: contrato.id, numero: `CMP-${contrato.numero}`,
      montante, ano: Number(this.hoje.slice(0, 4)), emitidoEm: this.meses(-6), ...this.audit,
    };
    await this.ctx.repos.compromissos.guardar(c);
    return c;
  }

  async fatura(contrato: Contrato, over: Partial<Fatura> & Pick<Fatura, 'numero' | 'montanteSemIva'>): Promise<Fatura> {
    const f: Fatura = {
      id: this.id('fat'), contratoId: contrato.id, documentos: [], linhas: [],
      numeroContratoIndicado: contrato.numero, nifPrestadorIndicado: contrato.prestador.nipc,
      dataEmissao: this.meses(-1), dataRececao: this.meses(-1),
      periodoDe: this.meses(-2), periodoAte: this.meses(-1),
      montanteIva: Math.round(over.montanteSemIva * 0.23), estado: 'RECEBIDA', tipo: 'BOLSA_HORAS',
      ...this.audit, ...over,
    };
    await this.ctx.repos.faturas.guardar(f);
    return f;
  }

  async entregavel(contrato: Contrato, over: Partial<Entregavel> & Pick<Entregavel, 'ordem' | 'designacao' | 'valor'>): Promise<Entregavel> {
    const e: Entregavel = {
      id: this.id('ent'), contratoId: contrato.id, entregue: false,
      percentagemContrato: over.valor / contrato.precoContratualAtual,
      dataPrevista: this.meses(3), ...this.audit, ...over,
    };
    await this.ctx.repos.entregaveis.guardar(e);
    return e;
  }
}

/** Documentos-tipo, para as faturas não nascerem sem prova anexada. */
export const DOC_FATURA = { tipo: 'FATURA' as const, ficheiroRef: 'arq://f', nomeOriginal: 'fatura.pdf', hashSha256: 'a'.repeat(64), tamanhoBytes: 1024, recebidoEm: '', carregadoPor: 'oid-gestor-contrato' };
export const DOC_HORAS = { tipo: 'RELATORIO_HORAS_FORNECEDOR' as const, ficheiroRef: 'arq://h', nomeOriginal: 'relatorio-horas.pdf', hashSha256: 'b'.repeat(64), tamanhoBytes: 2048, recebidoEm: '', carregadoPor: 'oid-gestor-contrato' };
export const DOC_AUTO = { tipo: 'AUTO_ENTREGA' as const, ficheiroRef: 'arq://a', nomeOriginal: 'auto-entrega.pdf', hashSha256: 'c'.repeat(64), tamanhoBytes: 1536, recebidoEm: '', carregadoPor: 'oid-gestor-contrato' };
