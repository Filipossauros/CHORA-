import {
  RN_208, RN_303, RN_304, RN_401, RN_403, RN_405, RN_406, RN_408, RN_409, RN_410,
  RN_501, RN_502, RN_503, RN_504, RN_506, RN_508, RN_509,
  ViolacaoRegra, exigir,
  calcularConsumoPerfil, minutosDisponiveisPerfil, valorHoraVigente, valorImputado,
  valorPrevistoPerfil, periodosSuspensao, maquinaRegistoTempo,
  type AfetacaoContexto, type Contrato, type PerfilContratual, type RegistoTempo,
  type Afetacao, type TipoDotacao, type DataISO, type Minutos,
} from '@chora/domain';
import type { Contexto } from '../contexto.js';
import type { ContextoUtilizador } from '../auth/token-validator.js';
import { temPapelGestao } from '../auth/permissoes.js';
import { ErroNaoEncontrado, ErroProibido } from '../erros/problema.js';

export interface NovoRegisto {
  afetacaoId: string;
  workItemId: number;
  data: DataISO;
  duracao: Minutos;
  descricaoAtividade: string;
  tipoDotacaoConsumida?: TipoDotacao;
  justificacaoExcessoDiario?: string;
  projetoIdWorkItem?: string; // resolvido pela extensão/ClienteAzureDevOps
}

export interface ResultadoItem {
  id: string;
  ok: boolean;
  regra?: string;
  detalhe?: string;
}

function afetacaoParaContexto(a: Afetacao): AfetacaoContexto {
  return {
    contratoId: a.contratoId,
    perfilId: a.perfilId,
    recursoId: a.recursoId,
    projetoIds: a.projetoIds,
    vigenteDe: a.vigenteDe,
    vigenteAte: a.vigenteAte,
    ativa: a.ativa,
  };
}

export class ServicoRegistosTempo {
  constructor(private readonly ctx: Contexto) {}

  private async carregarPerfil(perfilId: string): Promise<PerfilContratual> {
    const p = await this.ctx.repos.perfis.obter(perfilId);
    if (p === null) throw new ErroNaoEncontrado(`Perfil ${perfilId} inexistente.`);
    return p;
  }

  private async carregarContrato(contratoId: string): Promise<Contrato> {
    const c = await this.ctx.repos.contratos.obter(contratoId);
    if (c === null) throw new ErroNaoEncontrado(`Contrato ${contratoId} inexistente.`);
    return c;
  }

  private async validarCriacao(
    novo: NovoRegisto,
    afetacao: Afetacao,
    contrato: Contrato,
    perfil: PerfilContratual,
    tipoDotacao: TipoDotacao,
    recursoId: string,
  ): Promise<void> {
    exigir(RN_208, { estado: contrato.estado });
    exigir(RN_405, { duracao: novo.duracao });
    exigir(RN_409, { data: novo.data, agora: this.ctx.relogio.agora() });
    exigir(RN_401, {
      afetacao: afetacaoParaContexto(afetacao),
      recursoId, contratoId: contrato.id, perfilId: perfil.id,
      projetoId: afetacao.projetoIds[0] ?? '', data: novo.data,
    });
    exigir(RN_408, {
      data: novo.data,
      vigenciaContratoDe: contrato.dataInicioVigencia,
      vigenciaContratoAte: contrato.dataTerminoContratual,
      afetacaoDe: afetacao.vigenteDe,
      afetacaoAte: afetacao.vigenteAte,
    });
    const suspensoes = periodosSuspensao(await this.ctx.repos.alteracoes.todos((a) => a.contratoId === contrato.id));
    exigir(RN_410, { data: novo.data, suspensoes });
    exigir(RN_303, { tipoDotacao, consomeBolsaValor: perfil.consomeBolsaValor });
    exigir(RN_304, { tipoDotacao, consomeTrabalhosComplementares: perfil.consomeTrabalhosComplementares });

    // RN-403: soma diária do recurso.
    const doDia = await this.ctx.repos.registosTempo.todos(
      (r) => r.recursoId === recursoId && r.data === novo.data && r.estado !== 'ANULADO' && r.estado !== 'REJEITADO',
    );
    const minutosNoDia = doDia.reduce((s, r) => s + r.duracao, 0);
    exigir(RN_403, {
      minutosNoDia, novaDuracao: novo.duracao,
      maximo: this.ctx.config.duracaoMaximaDiariaMin,
      ...(novo.justificacaoExcessoDiario !== undefined ? { justificacao: novo.justificacaoExcessoDiario } : {}),
    });
  }

  /** Cria um registo em RASCUNHO em nome do utilizador. */
  async criar(novo: NovoRegisto, utilizador: ContextoUtilizador): Promise<RegistoTempo> {
    const afetacao = await this.ctx.repos.afetacoes.obter(novo.afetacaoId);
    if (afetacao === null) throw new ErroNaoEncontrado(`Afetação ${novo.afetacaoId} inexistente.`);

    // O recurso do registo é o titular da afetação; um gestor pode lançar em nome dele.
    const recursoId = afetacao.recursoId;
    const ehProprio = recursoId === utilizador.utilizadorId;
    if (!ehProprio && !temPapelGestao(utilizador.papeis)) {
      throw new ErroProibido('Só um gestor pode lançar registos em nome de outro recurso.');
    }

    const perfil = await this.carregarPerfil(afetacao.perfilId);
    const contrato = await this.carregarContrato(afetacao.contratoId);
    const tipoDotacao: TipoDotacao =
      novo.tipoDotacaoConsumida ??
      (perfil.consomeBolsaValor ? 'BOLSA_VALOR' : perfil.consomeTrabalhosComplementares ? 'TRABALHOS_COMPLEMENTARES' : 'HORAS_BASE');

    await this.validarCriacao(novo, afetacao, contrato, perfil, tipoDotacao, recursoId);

    const agora = this.ctx.relogio.agora();
    const registo: RegistoTempo = {
      id: this.ctx.ids.novo('rt'),
      afetacaoId: afetacao.id,
      contratoId: contrato.id,
      perfilId: perfil.id,
      recursoId,
      projetoId: afetacao.projetoIds[0] ?? '',
      workItemId: novo.workItemId,
      data: novo.data,
      duracao: novo.duracao,
      descricaoAtividade: novo.descricaoAtividade,
      tipoDotacaoConsumida: tipoDotacao,
      valorHoraAplicado: 0, // congelado só na aprovação (RN-506)
      valorImputado: 0,
      estado: 'RASCUNHO',
      criadoEm: agora,
      criadoPor: utilizador.utilizadorId,
      atualizadoEm: agora,
      atualizadoPor: utilizador.utilizadorId,
    };
    await this.ctx.repos.registosTempo.guardar(registo);
    await this.ctx.auditoria.registar({
      utilizadorId: utilizador.utilizadorId, entidade: 'RegistoTempo', entidadeId: registo.id,
      operacao: 'CRIAR', resultado: 'PERMITIDO', projetoId: registo.projetoId, depois: registo,
    });
    return registo;
  }

  private async carregarRegisto(id: string): Promise<RegistoTempo> {
    const r = await this.ctx.repos.registosTempo.obter(id);
    if (r === null) throw new ErroNaoEncontrado(`Registo ${id} inexistente.`);
    return r;
  }

  /** Submete um registo próprio (RASCUNHO → SUBMETIDO). */
  async submeter(id: string, utilizador: ContextoUtilizador): Promise<RegistoTempo> {
    const registo = await this.carregarRegisto(id);
    const t = maquinaRegistoTempo.transicaoPermitida(registo.estado, 'SUBMETIDO', 'PROPRIO');
    if (!t.permitida) throw new ErroProibido(t.motivo ?? 'Transição não permitida.');
    if (registo.criadoPor !== utilizador.utilizadorId && !temPapelGestao(utilizador.papeis)) {
      throw new ErroProibido('Só o próprio pode submeter o registo.');
    }
    const agora = this.ctx.relogio.agora();
    const atualizado: RegistoTempo = { ...registo, estado: 'SUBMETIDO', submetidoEm: agora, atualizadoEm: agora, atualizadoPor: utilizador.utilizadorId };
    await this.ctx.repos.registosTempo.guardar(atualizado);
    await this.ctx.auditoria.registar({
      utilizadorId: utilizador.utilizadorId, entidade: 'RegistoTempo', entidadeId: id,
      operacao: 'SUBMETER', resultado: 'PERMITIDO', antes: registo, depois: atualizado,
    });
    return atualizado;
  }

  /** Aprova um lote de registos, congelando valor/hora e valor imputado (RN-506). */
  async aprovar(ids: string[], utilizador: ContextoUtilizador): Promise<ResultadoItem[]> {
    exigir(RN_501, { papel: utilizador.papeis.includes('GESTOR_CONTRATO') ? 'GESTOR_CONTRATO' : utilizador.papeis.includes('GESTOR_TECNICO') ? 'GESTOR_TECNICO' : 'ELEMENTO_EQUIPA_TECNICA' });

    const resultados: ResultadoItem[] = [];
    // Tally por perfil, para não exceder ao aprovar vários no mesmo lote.
    const tallyMin = new Map<string, number>();
    const tallyVal = new Map<string, number>();

    for (const id of ids) {
      try {
        const registo = await this.carregarRegisto(id);
        const t = maquinaRegistoTempo.transicaoPermitida(registo.estado, 'APROVADO', 'GESTOR');
        if (!t.permitida) throw new ViolacaoRegra(RN_507Meta, t.motivo ?? 'Transição inválida.');

        exigir(RN_502, { aprovadorId: utilizador.utilizadorId, recursoIdRegisto: registo.recursoId });

        const contrato = await this.carregarContrato(registo.contratoId);
        exigir(RN_208, { estado: contrato.estado });
        exigir(RN_509, {
          vistoNecessario: contrato.vistoTribunalContasNecessario,
          vistoObtido: contrato.dataVistoTribunalContas !== undefined,
          vistoTacito: contrato.vistoTacito ?? false,
          suportaFaturacao: true,
        });

        const perfil = await this.carregarPerfil(registo.perfilId);
        const aprovados = await this.ctx.repos.registosTempo.todos((r) => r.perfilId === perfil.id && r.estado === 'APROVADO');
        const jaLote = tallyMin.get(perfil.id) ?? 0;
        const disponiveis = minutosDisponiveisPerfil(perfil, aprovados);
        exigir(RN_503, { minutosDisponiveis: disponiveis, minutosAAprovar: jaLote + registo.duracao });

        const valorHora = valorHoraVigente(perfil, registo.data);
        const impEsperado = valorHora === null ? 0 : valorImputado(registo.duracao, valorHora);

        const consumo = calcularConsumoPerfil(perfil, aprovados);
        const jaLoteVal = tallyVal.get(perfil.id) ?? 0;
        const valorPrevisto = valorPrevistoPerfil(perfil);
        const faturadoContrato = (await this.ctx.repos.registosTempo.todos((r) => r.contratoId === contrato.id && r.estado === 'APROVADO'))
          .reduce((s, r) => s + r.valorImputado, 0);
        exigir(RN_504, {
          valorDisponivelPerfil: valorPrevisto - consumo.valorConsumido,
          valorDisponivelContrato: contrato.precoContratualAtual - faturadoContrato,
          valorAAprovar: jaLoteVal + impEsperado,
        });

        exigir(RN_506, {
          valorHoraVigente: valorHora,
          valorHoraAplicado: valorHora ?? 0,
          valorImputadoEsperado: impEsperado,
          valorImputado: impEsperado,
        });

        const agora = this.ctx.relogio.agora();
        const atualizado: RegistoTempo = {
          ...registo, estado: 'APROVADO',
          valorHoraAplicado: valorHora ?? 0, valorImputado: impEsperado,
          aprovadoPor: utilizador.utilizadorId, aprovadoEm: agora,
          atualizadoEm: agora, atualizadoPor: utilizador.utilizadorId,
        };
        await this.ctx.repos.registosTempo.guardar(atualizado);
        tallyMin.set(perfil.id, jaLote + registo.duracao);
        tallyVal.set(perfil.id, jaLoteVal + impEsperado);
        await this.ctx.auditoria.registar({
          utilizadorId: utilizador.utilizadorId, entidade: 'RegistoTempo', entidadeId: id,
          operacao: 'APROVAR', resultado: 'PERMITIDO', antes: registo, depois: atualizado,
        });
        resultados.push({ id, ok: true });
      } catch (e) {
        if (e instanceof ViolacaoRegra) {
          await this.ctx.auditoria.registar({
            utilizadorId: utilizador.utilizadorId, entidade: 'RegistoTempo', entidadeId: id,
            operacao: 'APROVAR', resultado: 'NEGADO', regraViolada: e.codigo,
          });
          resultados.push({ id, ok: false, regra: e.codigo, detalhe: e.message });
        } else {
          resultados.push({ id, ok: false, detalhe: e instanceof Error ? e.message : 'erro' });
        }
      }
    }
    return resultados;
  }

  /** Rejeita um lote de registos (motivo obrigatório). */
  async rejeitar(ids: string[], motivo: string, utilizador: ContextoUtilizador): Promise<ResultadoItem[]> {
    exigir(RN_501, { papel: temPapelGestao(utilizador.papeis) ? 'GESTOR_CONTRATO' : 'ELEMENTO_EQUIPA_TECNICA' });
    const resultados: ResultadoItem[] = [];
    for (const id of ids) {
      const registo = await this.carregarRegisto(id);
      const t = maquinaRegistoTempo.transicaoPermitida(registo.estado, 'REJEITADO', 'GESTOR');
      if (!t.permitida) { resultados.push({ id, ok: false, detalhe: t.motivo }); continue; }
      const agora = this.ctx.relogio.agora();
      const atualizado: RegistoTempo = { ...registo, estado: 'REJEITADO', motivoRejeicao: motivo, atualizadoEm: agora, atualizadoPor: utilizador.utilizadorId };
      await this.ctx.repos.registosTempo.guardar(atualizado);
      await this.ctx.auditoria.registar({
        utilizadorId: utilizador.utilizadorId, entidade: 'RegistoTempo', entidadeId: id,
        operacao: 'REJEITAR', resultado: 'PERMITIDO', antes: registo, depois: atualizado,
      });
      resultados.push({ id, ok: true });
    }
    return resultados;
  }

  /** Anula um registo (lógica). Elemento: próprios em rascunho/submetido (RN-406). Gestor: aprovados (RN-508). */
  async anular(id: string, motivo: string, utilizador: ContextoUtilizador): Promise<RegistoTempo> {
    const registo = await this.carregarRegisto(id);
    const ehGestor = temPapelGestao(utilizador.papeis);

    if (registo.estado === 'APROVADO') {
      exigir(RN_508, { papel: ehGestor ? 'GESTOR_CONTRATO' : 'ELEMENTO_EQUIPA_TECNICA', motivo });
    } else {
      exigir(RN_406, { estado: registo.estado, autorId: registo.criadoPor, utilizadorId: ehGestor ? registo.criadoPor : utilizador.utilizadorId });
    }
    const ator = registo.estado === 'APROVADO' ? 'GESTOR' : ehGestor ? 'GESTOR' : 'PROPRIO';
    const t = maquinaRegistoTempo.transicaoPermitida(registo.estado, 'ANULADO', ator);
    if (!t.permitida) throw new ErroProibido(t.motivo ?? 'Transição não permitida.');

    const agora = this.ctx.relogio.agora();
    const atualizado: RegistoTempo = { ...registo, estado: 'ANULADO', anuladoPor: utilizador.utilizadorId, anuladoEm: agora, motivoAnulacao: motivo, atualizadoEm: agora, atualizadoPor: utilizador.utilizadorId };
    await this.ctx.repos.registosTempo.guardar(atualizado);
    await this.ctx.auditoria.registar({
      utilizadorId: utilizador.utilizadorId, entidade: 'RegistoTempo', entidadeId: id,
      operacao: 'ANULAR', resultado: 'PERMITIDO', antes: registo, depois: atualizado,
    });
    return atualizado;
  }
}

// Metadados de RN-507 para o erro de transição inválida na aprovação.
const RN_507Meta = { codigo: 'RN-507', requisito: 'RNF11', base: '—', excecaoFundamentavel: false };
