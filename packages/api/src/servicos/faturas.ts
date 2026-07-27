import {
  RN_601, RN_602, RN_602_A, RN_603, RN_604, RN_607, RN_608, RN_609, RN_610, RN_611, RN_612, exigir, ViolacaoRegra,
  totalFaturado, dentroDoIntervalo, maquinaFatura,
  type Fatura, type Compromisso, type DataISO, type Cent, type AnoCivil,
  type LinhaConferencia, type TipoFaturacao,
} from '@chora/domain';
import type { Contexto } from '../contexto.js';
import type { RelatorioEvidencia } from '../repositorios/memoria/index.js';
import { ErroConflitoEstado, ErroNaoEncontrado, ErroValidacao } from '../erros/problema.js';
import type { ContextoUtilizador } from '../auth/token-validator.js';

type DocFatura = Fatura['documentos'][number];
type LinhaFatura = Fatura['linhas'][number];

/**
 * Resultado da conferência. `linhas` só é povoada quando se liquida tempo; numa
 * fatura de entregável o que se confere é o entregável, devolvido em `entregavel`.
 */
export interface ResultadoConferencia {
  linhas: LinhaConferencia[];
  conforme: boolean;
  /** O que a aplicação apurou que devia ter sido faturado. */
  montanteConferido: Cent;
  /** O que a fatura vale depois da nota de crédito (igual ao faturado se não houver). */
  montanteLiquido: Cent;
  entregavel?: { designacao: string; valor: Cent; entregue: boolean; entregueEm?: DataISO };
  /** Contexto da licença, quando o que se confere é um licenciamento. */
  licenciamento?: { precoContratual: Cent; vigencia?: { de: DataISO; ate: DataISO } };
  /** Motivo da não conformidade, já redigido — evita obrigar a escrevê-lo. */
  motivo?: string;
}

/** Dados da nota de crédito que corrige uma fatura emitida a mais. */
export interface DadosNotaCredito {
  numero: string;
  montante: Cent;
  /** Quando não vem, mantém-se o motivo registado ao pôr a fatura em espera. */
  motivo?: string;
  documento?: DocFatura;
}

export class ServicoFaturas {
  constructor(private readonly ctx: Contexto) {}

  private async carregar(id: string): Promise<Fatura> {
    const f = await this.ctx.repos.faturas.obter(id);
    if (f === null) throw new ErroNaoEncontrado(`Fatura ${id} inexistente.`);
    return f;
  }

  async criarCompromisso(contratoId: string, numero: string, montante: Cent, ano: AnoCivil, emitidoEm: DataISO, u: ContextoUtilizador): Promise<Compromisso> {
    const agora = this.ctx.relogio.agora();
    const c: Compromisso = { id: this.ctx.ids.novo('cmp'), contratoId, numero, montante, ano, emitidoEm, criadoEm: agora, criadoPor: u.utilizadorId, atualizadoEm: agora, atualizadoPor: u.utilizadorId };
    await this.ctx.repos.compromissos.guardar(c);
    await this.ctx.auditoria.registar({ utilizadorId: u.utilizadorId, entidade: 'Compromisso', entidadeId: c.id, operacao: 'CRIAR', resultado: 'PERMITIDO', depois: c });
    return c;
  }

  async criarFatura(
    contratoId: string,
    dados: Omit<Fatura, 'id' | 'documentos' | 'linhas' | 'estado' | 'tipo' | 'criadoEm' | 'criadoPor' | 'atualizadoEm' | 'atualizadoPor' | 'contratoId'> & { tipo?: TipoFaturacao },
    u: ContextoUtilizador,
  ): Promise<Fatura> {
    const agora = this.ctx.relogio.agora();
    const contrato = await this.ctx.repos.contratos.obter(contratoId);
    if (contrato === null) throw new ErroNaoEncontrado(`Contrato ${contratoId} inexistente.`);
    // O tipo vem do contrato quando não é indicado: é o contrato que determina o
    // que se pode faturar, e obrigar a escolhê-lo à mão só convida ao engano.
    const tipo: TipoFaturacao = dados.tipo ?? (contrato.tipologia === 'LICENCIAMENTO' ? 'LICENCIAMENTO' : 'BOLSA_HORAS');

    // RN-610/RN-611 — o licenciamento tem UMA fatura, pela totalidade.
    if (tipo === 'LICENCIAMENTO') {
      const existentes = await this.ctx.repos.faturas.todos((f) => f.contratoId === contratoId && f.montanteSemIva > 0 && f.estado !== 'INVALIDADA');
      exigir(RN_610, { tipoFaturacao: tipo, faturasPositivasExistentes: existentes.length, montante: dados.montanteSemIva });
      exigir(RN_611, { tipoFaturacao: tipo, montante: dados.montanteSemIva, precoContratualAtual: contrato.precoContratualAtual });
    }

    // RN-608/RN-609 — uma fatura de entregável exige entregável identificado,
    // assinalado como entregue, e montante igual ao valor do entregável.
    if (tipo === 'ENTREGAVEL') {
      const entregavel = dados.entregavelId !== undefined ? await this.ctx.repos.entregaveis.obter(dados.entregavelId) : null;
      exigir(RN_608, {
        tipoFaturacao: tipo,
        entregavelIdentificado: entregavel !== null,
        entregue: entregavel?.entregue ?? false,
      });
      if (entregavel!.contratoId !== contratoId) {
        throw new ErroValidacao('O entregável indicado pertence a outro contrato.');
      }
      if (entregavel!.faturaId !== undefined) {
        throw new ErroValidacao('O entregável já foi faturado.');
      }
      exigir(RN_609, { tipoFaturacao: tipo, montanteFatura: dados.montanteSemIva, valorEntregavel: entregavel!.valor });
    }

    const fatura: Fatura = {
      id: this.ctx.ids.novo('fat'), contratoId, documentos: [], linhas: [], estado: 'RECEBIDA',
      ...dados, tipo,
      criadoEm: agora, criadoPor: u.utilizadorId, atualizadoEm: agora, atualizadoPor: u.utilizadorId,
    };
    await this.ctx.repos.faturas.guardar(fatura);
    // Liga o entregável à fatura que o liquida.
    if (tipo === 'ENTREGAVEL' && dados.entregavelId !== undefined) {
      const e = await this.ctx.repos.entregaveis.obter(dados.entregavelId);
      if (e !== null) await this.ctx.repos.entregaveis.guardar({ ...e, faturaId: fatura.id, faturadoEm: agora, atualizadoEm: agora, atualizadoPor: u.utilizadorId });
    }
    await this.ctx.auditoria.registar({ utilizadorId: u.utilizadorId, entidade: 'Fatura', entidadeId: fatura.id, operacao: 'CRIAR', resultado: 'PERMITIDO', depois: fatura });
    return fatura;
  }

  /** Anexa um documento (PDF). RN-602-A: o hash de fatura já decidida não muda. */
  async anexarDocumento(faturaId: string, doc: DocFatura, u: ContextoUtilizador): Promise<Fatura> {
    const fatura = await this.carregar(faturaId);
    const existente = fatura.documentos.find((d) => d.tipo === doc.tipo);
    exigir(RN_602_A, { estadoFatura: fatura.estado, hashAntes: existente?.hashSha256 ?? doc.hashSha256, hashDepois: doc.hashSha256 });
    const documentos = [...fatura.documentos.filter((d) => d.tipo !== doc.tipo), doc];
    const atualizado: Fatura = { ...fatura, documentos, atualizadoEm: this.ctx.relogio.agora(), atualizadoPor: u.utilizadorId };
    await this.ctx.repos.faturas.guardar(atualizado);
    return atualizado;
  }

  /** Define as linhas (transcrição manual ou extração OCR — stub IFaturaValidator). */
  async definirLinhas(faturaId: string, linhas: LinhaFatura[], u: ContextoUtilizador): Promise<Fatura> {
    const fatura = await this.carregar(faturaId);
    const atualizado: Fatura = { ...fatura, linhas, atualizadoEm: this.ctx.relogio.agora(), atualizadoPor: u.utilizadorId };
    await this.ctx.repos.faturas.guardar(atualizado);
    return atualizado;
  }

  /** Passa a EM_CONFERENCIA (RN-601 compromisso/saldo, RN-602 documentos). */
  async iniciarConferencia(faturaId: string, u: ContextoUtilizador): Promise<Fatura> {
    const fatura = await this.carregar(faturaId);
    const t = maquinaFatura.transicaoPermitida(fatura.estado, 'EM_CONFERENCIA', 'GESTOR_CONTRATO');
    if (!t.permitida) throw new ErroConflitoEstado(t.motivo ?? 'Transição inválida.');

    const compromisso = fatura.compromissoId !== undefined ? await this.ctx.repos.compromissos.obter(fatura.compromissoId) : null;
    const saldo = compromisso !== null ? await this.saldoCompromisso(compromisso, fatura.id) : 0;
    exigir(RN_601, { temCompromisso: compromisso !== null, saldoCompromisso: saldo, montanteFatura: fatura.montanteSemIva });
    exigir(RN_602, { tiposDocumentosPresentes: fatura.documentos.map((d) => d.tipo), tipoFaturacao: fatura.tipo });

    const atualizado: Fatura = { ...fatura, estado: 'EM_CONFERENCIA', atualizadoEm: this.ctx.relogio.agora(), atualizadoPor: u.utilizadorId };
    await this.ctx.repos.faturas.guardar(atualizado);
    await this.ctx.auditoria.registar({ utilizadorId: u.utilizadorId, entidade: 'Fatura', entidadeId: faturaId, operacao: 'CONFERENCIA:INICIAR', resultado: 'PERMITIDO' });
    return atualizado;
  }

  /**
   * Conferência determinística. O que se confere depende do que se fatura:
   * tempo prestado compara-se com os registos aprovados do período (RN-603);
   * um entregável compara-se com o próprio entregável — entregue e pelo valor
   * exato (RN-608/RN-609).
   */
  async conferir(faturaId: string): Promise<ResultadoConferencia> {
    const fatura = await this.carregar(faturaId);
    const nc = fatura.notaCredito;
    const liquido = fatura.montanteSemIva - (nc?.montante ?? 0);

    /**
     * Aplica a nota de crédito ao veredicto. Havendo nota, o que se decide é o
     * LÍQUIDO: a fatura emitida a mais não deixa de estar errada, mas a correção
     * já está documentada e a decisão é uma só sobre os dois documentos (RN-612).
     */
    const comNotaCredito = (base: ResultadoConferencia): ResultadoConferencia => {
      if (nc === undefined) return base;
      const r = RN_612.avaliar({
        temNotaCredito: true,
        documentoNotaCreditoPresente: fatura.documentos.some((d) => d.tipo === 'NOTA_CREDITO'),
        montanteFatura: fatura.montanteSemIva,
        montanteNotaCredito: nc.montante,
        montanteConferido: base.montanteConferido,
      });
      const { motivo: _antigo, ...semMotivo } = base;
      return { ...semMotivo, conforme: r.ok, ...(r.ok ? {} : { motivo: r.mensagem }) };
    };

    if (fatura.tipo === 'LICENCIAMENTO') {
      const contrato = await this.ctx.repos.contratos.obter(fatura.contratoId);
      const precoContratual = contrato?.precoContratualAtual ?? 0;
      const r611 = RN_611.avaliar({ tipoFaturacao: 'LICENCIAMENTO', montante: fatura.montanteSemIva, precoContratualAtual: precoContratual });
      return comNotaCredito({
        linhas: [], conforme: r611.ok, montanteConferido: precoContratual, montanteLiquido: liquido,
        licenciamento: {
          precoContratual,
          vigencia: contrato?.vigenciaLicenciamento,
        },
        ...(!r611.ok ? { motivo: r611.mensagem } : {}),
      });
    }

    if (fatura.tipo === 'ENTREGAVEL') {
      const e = fatura.entregavelId !== undefined ? await this.ctx.repos.entregaveis.obter(fatura.entregavelId) : null;
      const r608 = RN_608.avaliar({ tipoFaturacao: 'ENTREGAVEL', entregavelIdentificado: e !== null, entregue: e?.entregue ?? false });
      const r609 = RN_609.avaliar({ tipoFaturacao: 'ENTREGAVEL', montanteFatura: fatura.montanteSemIva, valorEntregavel: e?.valor ?? 0 });
      return comNotaCredito({
        linhas: [], conforme: r608.ok && r609.ok, montanteConferido: e?.valor ?? 0, montanteLiquido: liquido,
        ...(e !== null ? { entregavel: { designacao: e.designacao, valor: e.valor, entregue: e.entregue, entregueEm: e.entregueEm } } : {}),
        ...(!r608.ok ? { motivo: r608.mensagem } : !r609.ok ? { motivo: r609.mensagem } : {}),
      });
    }

    const aprovados = await this.ctx.repos.registosTempo.todos(
      (r) => r.contratoId === fatura.contratoId && r.estado === 'APROVADO' && dentroDoIntervalo(r.data, fatura.periodoDe, fatura.periodoAte),
    );
    const linhas: LinhaConferencia[] = fatura.linhas.map((l) => {
      const grupo = aprovados.filter((r) => (l.perfilId === undefined || r.perfilId === l.perfilId) && (l.recursoId === undefined || r.recursoId === l.recursoId));
      const quantidadeAprovada = grupo.reduce((s, r) => s + r.duracao, 0);
      const valorAprovado = grupo.reduce((s, r) => s + r.valorImputado, 0);
      return {
        perfilId: l.perfilId, recursoId: l.recursoId,
        quantidadeFatura: l.quantidade, valorFatura: l.montante,
        quantidadeAprovada, valorAprovado,
      };
    });
    // O conferido é o que os registos aprovados do período valem — a referência
    // independente da fatura, e a que a nota de crédito tem de fazer bater.
    const montanteConferido = aprovados.reduce((s, r) => s + r.valorImputado, 0);
    const resultado = RN_603.avaliar({ linhas });
    return comNotaCredito({
      linhas, conforme: resultado.ok, montanteConferido, montanteLiquido: liquido,
      ...(resultado.ok ? {} : { motivo: motivoDivergencia(linhas) }),
    });
  }

  /**
   * Marca a fatura como errada e por conferir até chegar a nota de crédito.
   *
   * Não é invalidar — a fatura existe e vai ser corrigida — nem validar, porque
   * o montante ainda não é o certo. Fica em espera para que a decisão aconteça
   * uma só vez, sobre a fatura e a nota em conjunto.
   */
  async aguardarNotaCredito(faturaId: string, motivo: string, u: ContextoUtilizador): Promise<Fatura> {
    const fatura = await this.carregar(faturaId);
    const t = maquinaFatura.transicaoPermitida(fatura.estado, 'AGUARDA_NOTA_CREDITO', 'GESTOR_CONTRATO');
    if (!t.permitida) throw new ErroConflitoEstado(t.motivo ?? 'Transição inválida.');
    if (motivo.trim().length === 0) {
      throw new ErroValidacao('Indique porque a fatura fica a aguardar nota de crédito.');
    }
    const agora = this.ctx.relogio.agora();
    const { montanteConferido } = await this.conferir(faturaId);
    const atualizada: Fatura = {
      ...fatura, estado: 'AGUARDA_NOTA_CREDITO',
      notaCredito: {
        numero: 'por emitir',
        montante: Math.max(0, fatura.montanteSemIva - montanteConferido),
        motivo: motivo.trim(),
        registadaEm: agora.slice(0, 10),
      },
      atualizadoEm: agora, atualizadoPor: u.utilizadorId,
    };
    await this.ctx.repos.faturas.guardar(atualizada);
    await this.ctx.auditoria.registar({ utilizadorId: u.utilizadorId, entidade: 'Fatura', entidadeId: faturaId, operacao: 'AGUARDAR_NOTA_CREDITO', resultado: 'PERMITIDO', depois: { motivo: motivo.trim(), montanteEsperado: atualizada.notaCredito?.montante } });
    return atualizada;
  }

  /**
   * Regista a nota de crédito recebida (com o respetivo PDF) e devolve a fatura
   * à conferência, para que fatura e nota sejam decididas em simultâneo.
   */
  async registarNotaCredito(faturaId: string, dados: DadosNotaCredito, u: ContextoUtilizador): Promise<{ fatura: Fatura; conferencia: ResultadoConferencia }> {
    const fatura = await this.carregar(faturaId);
    if (fatura.estado !== 'AGUARDA_NOTA_CREDITO' && fatura.estado !== 'EM_CONFERENCIA') {
      throw new ErroConflitoEstado('Só se regista nota de crédito numa fatura por conferir.');
    }
    if (dados.numero.trim().length === 0) throw new ErroValidacao('Indique o número da nota de crédito.');
    if (dados.montante <= 0) throw new ErroValidacao('A nota de crédito tem de ter montante positivo.');
    if (dados.montante > fatura.montanteSemIva) {
      throw new ErroValidacao('A nota de crédito não pode exceder o montante da fatura.');
    }
    const agora = this.ctx.relogio.agora();
    const documentos = dados.documento !== undefined
      ? [...fatura.documentos.filter((d) => d.tipo !== 'NOTA_CREDITO'), dados.documento]
      : fatura.documentos;
    const atualizada: Fatura = {
      ...fatura, estado: 'EM_CONFERENCIA', documentos,
      notaCredito: {
        numero: dados.numero.trim(), montante: dados.montante,
        motivo: (dados.motivo ?? '').trim().length > 0 ? dados.motivo!.trim() : fatura.notaCredito?.motivo ?? 'correção do montante faturado',
        registadaEm: agora.slice(0, 10),
      },
      atualizadoEm: agora, atualizadoPor: u.utilizadorId,
    };
    await this.ctx.repos.faturas.guardar(atualizada);
    await this.ctx.auditoria.registar({ utilizadorId: u.utilizadorId, entidade: 'Fatura', entidadeId: faturaId, operacao: 'NOTA_CREDITO:REGISTAR', resultado: 'PERMITIDO', depois: atualizada.notaCredito });
    return { fatura: atualizada, conferencia: await this.conferir(faturaId) };
  }

  /**
   * RECEBER E CONFERIR numa só operação. A receção, a passagem a conferência e a
   * conferência determinística não têm decisão pelo meio: separá-las em três
   * cliques só adiava o único ecrã que interessa — o do resultado.
   */
  async receberEConferir(
    contratoId: string,
    dados: Parameters<ServicoFaturas['criarFatura']>[1] & { documentos?: DocFatura[]; linhas?: LinhaFatura[] },
    u: ContextoUtilizador,
  ): Promise<{ fatura: Fatura; conferencia: ResultadoConferencia }> {
    const { documentos = [], linhas, ...resto } = dados;
    const criada = await this.criarFatura(contratoId, resto, u);
    for (const doc of documentos) await this.anexarDocumento(criada.id, doc, u);
    // As linhas vêm da extração; quando não vêm, derivam-se dos registos
    // aprovados do período, que é a base contra a qual a fatura é conferida.
    const aExtrair = linhas ?? await this.linhasSugeridas(criada);
    if (aExtrair.length > 0) await this.definirLinhas(criada.id, aExtrair, u);
    const emConferencia = await this.iniciarConferencia(criada.id, u);
    return { fatura: emConferencia, conferencia: await this.conferir(criada.id) };
  }

  /**
   * Linhas propostas a partir dos registos aprovados do período — o resultado da
   * extração no protótipo (o OCR real entra por `IFaturaValidator`, secção 14).
   */
  async linhasSugeridas(fatura: Fatura): Promise<LinhaFatura[]> {
    if (fatura.tipo !== 'BOLSA_HORAS') return [];
    const aprovados = await this.ctx.repos.registosTempo.todos(
      (r) => r.contratoId === fatura.contratoId && r.estado === 'APROVADO' && dentroDoIntervalo(r.data, fatura.periodoDe, fatura.periodoAte),
    );
    const grupos = new Map<string, LinhaFatura>();
    for (const r of aprovados) {
      const chave = `${r.perfilId}|${r.recursoId}`;
      const atual = grupos.get(chave);
      if (atual === undefined) {
        grupos.set(chave, { perfilId: r.perfilId, recursoId: r.recursoId, quantidade: r.duracao, valorHora: r.valorHoraAplicado, montante: r.valorImputado, origem: 'EXTRAIDA' });
      } else {
        grupos.set(chave, { ...atual, quantidade: atual.quantidade + r.duracao, montante: atual.montante + r.valorImputado });
      }
    }
    return [...grupos.values()];
  }

  /**
   * Decide a fatura (VALIDADA/INVALIDADA). Gera RelatorioEvidencia imutável
   * (RN-604) com a frase juridicamente prudente, regista o nº da fatura e sela os
   * documentos. RN-607 no caso de validação. (Feedback R4.)
   */
  async decidir(faturaId: string, decisao: 'VALIDADA' | 'INVALIDADA', motivo: string | undefined, u: ContextoUtilizador): Promise<{ fatura: Fatura; relatorio: RelatorioEvidencia }> {
    const fatura = await this.carregar(faturaId);
    const t = maquinaFatura.transicaoPermitida(fatura.estado, decisao, 'GESTOR_CONTRATO');
    if (!t.permitida) throw new ErroConflitoEstado(t.motivo ?? 'Transição inválida.');

    const { linhas, conforme, motivo: motivoNaoConforme, montanteConferido, montanteLiquido } = await this.conferir(faturaId);
    const nc = fatura.notaCredito;

    if (decisao === 'VALIDADA') {
      // Com nota de crédito, o que se valida é o líquido: RN-612 exige a nota
      // documentada e o líquido a corresponder ao conferido.
      if (nc !== undefined) {
        exigir(RN_612, {
          temNotaCredito: true,
          documentoNotaCreditoPresente: fatura.documentos.some((d) => d.tipo === 'NOTA_CREDITO'),
          montanteFatura: fatura.montanteSemIva,
          montanteNotaCredito: nc.montante,
          montanteConferido,
        });
      } else if (!conforme && fatura.tipo === 'ENTREGAVEL') {
        // Divergência bloqueia a validação: face aos registos aprovados (RN-603)
        // ou face ao entregável que a fatura diz liquidar (RN-608/RN-609).
        throw new ViolacaoRegra(RN_609, motivoNaoConforme ?? 'A fatura não corresponde ao entregável que liquida.');
      } else if (!conforme) {
        throw new ViolacaoRegra(RN_603, 'Há divergências entre a fatura e os registos aprovados do período.', { divergencias: linhas.filter((l) => l.quantidadeFatura !== l.quantidadeAprovada || l.valorFatura !== l.valorAprovado) });
      }
      const contrato = await this.ctx.repos.contratos.obter(fatura.contratoId);
      const outras = (await this.ctx.repos.faturas.todos((f) => f.contratoId === fatura.contratoId && f.id !== fatura.id));
      exigir(RN_607, { totalFaturado: totalFaturado(outras), novoMontante: montanteLiquido, precoContratualAtual: contrato?.precoContratualAtual ?? 0 });
    } else if ((motivo ?? '').trim().length === 0) {
      throw new ViolacaoRegra(RN_604, 'A invalidação exige a indicação do motivo.');
    }

    const relatorio: RelatorioEvidencia = {
      id: this.ctx.ids.novo('rev'), faturaId, contratoId: fatura.contratoId, decisao,
      ...(decisao === 'INVALIDADA' && motivo !== undefined ? { motivo } : {}),
      frase: gerarFraseEvidencia({ decisao, numeroFatura: fatura.numero, periodoDe: fatura.periodoDe, periodoAte: fatura.periodoAte, tipo: fatura.tipo, ...(nc !== undefined ? { notaCredito: { numero: nc.numero, montante: nc.montante, liquido: montanteLiquido } } : {}), ...(motivo !== undefined ? { motivo } : {}) }),
      linhas: linhas.map((l) => ({ perfil: l.perfilId, recurso: l.recursoId, quantidadeFatura: l.quantidadeFatura, quantidadeAprovada: l.quantidadeAprovada, valorFatura: l.valorFatura, valorAprovado: l.valorAprovado, confere: l.quantidadeFatura === l.quantidadeAprovada && l.valorFatura === l.valorAprovado })),
      geradoEm: this.ctx.relogio.agora(), geradoPor: u.utilizadorId,
    };
    exigir(RN_604, { temRelatorioEvidencia: true });
    await this.ctx.repos.relatoriosEvidencia.guardar(relatorio);

    const agora = this.ctx.relogio.agora();
    const atualizada: Fatura = {
      ...fatura, estado: decisao, relatorioEvidenciaId: relatorio.id,
      dataAprovacao: agora.slice(0, 10),
      ...(decisao === 'VALIDADA' ? { montanteAprovado: montanteLiquido } : {}),
      atualizadoEm: agora, atualizadoPor: u.utilizadorId,
    };
    await this.ctx.repos.faturas.guardar(atualizada);
    await this.ctx.auditoria.registar({ utilizadorId: u.utilizadorId, entidade: 'Fatura', entidadeId: faturaId, operacao: `DECIDIR:${decisao}`, resultado: 'PERMITIDO', depois: { numero: fatura.numero, relatorioEvidenciaId: relatorio.id } });
    return { fatura: atualizada, relatorio };
  }

  private async saldoCompromisso(compromisso: Compromisso, faturaAtualId: string): Promise<Cent> {
    const faturas = await this.ctx.repos.faturas.todos((f) => f.compromissoId === compromisso.id && f.id !== faturaAtualId && f.estado === 'VALIDADA');
    const usado = faturas.reduce((s, f) => s + (f.montanteAprovado ?? 0), 0);
    return compromisso.montante - usado;
  }
}

/**
 * Gera a frase juridicamente prudente que acompanha o relatório de evidência
 * (feedback R4). A frase é copy/paste para o sistema de faturação da empresa.
 * Na validação, atesta a realização dos trabalhos com base na conferência dos
 * registos aprovados, limitando o alcance à conformidade documental e
 * quantitativa; na invalidação, reporta apenas a não conformidade, sem
 * reconhecer a realização dos trabalhos.
 */
export function gerarFraseEvidencia(dados: {
  decisao: 'VALIDADA' | 'INVALIDADA'; numeroFatura: string; periodoDe: DataISO; periodoAte: DataISO;
  tipo?: TipoFaturacao; motivo?: string;
  notaCredito?: { numero: string; montante: Cent; liquido: Cent };
}): string {
  const periodo = `${dados.periodoDe} a ${dados.periodoAte}`;

  // Havendo nota de crédito, o que se atesta é o LÍQUIDO: a frase tem de o
  // dizer, sob pena de o sistema de faturação processar o valor emitido a mais.
  if (dados.decisao === 'VALIDADA' && dados.notaCredito !== undefined) {
    const eur = (c: number): string => `${(c / 100).toLocaleString('pt-PT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
    return (
      `Da conferência da fatura ${dados.numeroFatura}, relativa ao período de ${periodo}, resultou divergência face aos elementos de execução aprovados, ` +
      `corrigida pela nota de crédito ${dados.notaCredito.numero}, no montante de ${eur(dados.notaCredito.montante)}. ` +
      `Conferidos ambos os documentos em conjunto, o montante líquido de ${eur(dados.notaCredito.liquido)} corresponde integralmente ao apurado. ` +
      `Nessa medida, e exclusivamente para efeitos da presente validação, atesta-se a conformidade do valor líquido conferido. ` +
      `A presente validação circunscreve-se ao montante líquido verificado, não constituindo pronúncia sobre quaisquer outras matérias.`
    );
  }

  // Numa fatura de entregável o facto conferido é a entrega, não o tempo: a
  // frase tem de o dizer, sob pena de atestar algo que não foi verificado.
  if (dados.tipo === 'ENTREGAVEL') {
    if (dados.decisao === 'VALIDADA') {
      return (
        `Da conferência entre a fatura ${dados.numeroFatura} e o entregável que titula, resulta que este se encontra assinalado como entregue ` +
        `e que o montante faturado corresponde integralmente ao valor contratualmente afeto ao entregável. Nessa medida, e exclusivamente para efeitos da presente validação, ` +
        `atesta-se a conformidade da fatura com o entregável recebido. A presente validação circunscreve-se à conformidade documental e ao valor verificado, ` +
        `não constituindo pronúncia sobre a qualidade técnica do entregável nem sobre quaisquer outras matérias.`
      );
    }
    const m = (dados.motivo ?? '').trim().length > 0 ? dados.motivo : 'a fatura não corresponde ao entregável que diz liquidar';
    return (
      `Da conferência entre a fatura ${dados.numeroFatura} e o entregável que titula, verifica-se não conformidade que obsta à validação, pelo seguinte motivo: ${m}. ` +
      `A presente informação reporta exclusivamente a não conformidade verificada, não constituindo reconhecimento sobre a receção do entregável nem qualquer outra vinculação.`
    );
  }

  if (dados.decisao === 'VALIDADA') {
    return (
      `Da conferência determinística entre as linhas da fatura ${dados.numeroFatura} e os registos de tempo aprovados do período de ${periodo}, ` +
      `resulta a correspondência integral em quantidade e valor. Nessa medida, e exclusivamente para efeitos da presente validação, ` +
      `atesta-se que os trabalhos titulados foram efetivamente realizados em conformidade com os registos de tempo previamente aprovados. ` +
      `A presente validação circunscreve-se à conformidade documental e quantitativa verificada, não constituindo pronúncia sobre quaisquer outras matérias.`
    );
  }
  const motivo = (dados.motivo ?? '').trim().length > 0 ? dados.motivo : 'divergência entre as linhas da fatura e os registos aprovados';
  return (
    `Da conferência determinística entre as linhas da fatura ${dados.numeroFatura} e os registos de tempo aprovados do período de ${periodo}, ` +
    `verifica-se não conformidade que obsta à validação, pelo seguinte motivo: ${motivo}. ` +
    `A presente informação reporta exclusivamente a não conformidade verificada, não constituindo reconhecimento sobre a realização dos trabalhos nem qualquer outra vinculação.`
  );
}

/**
 * Descreve a divergência entre a fatura e os registos aprovados, em linguagem
 * de ofício. É gerada dos próprios números: quem confere não deve ter de
 * redigir o que a aplicação já sabe — só de rever e assinar.
 */
export function motivoDivergencia(linhas: ReadonlyArray<LinhaConferencia>): string {
  const div = linhas.filter((l) => l.quantidadeFatura !== l.quantidadeAprovada || l.valorFatura !== l.valorAprovado);
  if (div.length === 0) {
    return 'Fatura não conforme com os elementos de execução aprovados no período.';
  }
  const h = (min: number): string => `${Math.round(min / 60)} h`;
  const eur = (c: number): string => `${(c / 100).toLocaleString('pt-PT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
  const partes = div.map((l) => {
    const bits: string[] = [];
    if (l.quantidadeFatura !== l.quantidadeAprovada) bits.push(`quantidade faturada de ${h(l.quantidadeFatura)} contra ${h(l.quantidadeAprovada)} aprovadas`);
    if (l.valorFatura !== l.valorAprovado) bits.push(`valor faturado de ${eur(l.valorFatura)} contra ${eur(l.valorAprovado)} aprovado`);
    return `${l.perfilId ?? 'perfil não identificado'}${l.recursoId !== undefined ? ` / ${l.recursoId}` : ''}: ${bits.join('; ')}`;
  });
  return `Divergência entre as linhas da fatura e os registos de tempo aprovados do período — ${partes.join(' · ')}.`;
}
