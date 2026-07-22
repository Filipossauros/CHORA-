import {
  RN_601, RN_602, RN_602_A, RN_603, RN_604, RN_607, exigir, ViolacaoRegra,
  totalFaturado, dentroDoIntervalo, maquinaFatura,
  type Fatura, type Compromisso, type DataISO, type Cent, type AnoCivil,
  type LinhaConferencia,
} from '@chora/domain';
import type { Contexto } from '../contexto.js';
import type { RelatorioEvidencia } from '../repositorios/memoria/index.js';
import { ErroConflitoEstado, ErroNaoEncontrado } from '../erros/problema.js';
import type { ContextoUtilizador } from '../auth/token-validator.js';

type DocFatura = Fatura['documentos'][number];
type LinhaFatura = Fatura['linhas'][number];

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

  async criarFatura(contratoId: string, dados: Omit<Fatura, 'id' | 'documentos' | 'linhas' | 'estado' | 'criadoEm' | 'criadoPor' | 'atualizadoEm' | 'atualizadoPor' | 'contratoId'>, u: ContextoUtilizador): Promise<Fatura> {
    const agora = this.ctx.relogio.agora();
    const fatura: Fatura = {
      id: this.ctx.ids.novo('fat'), contratoId, documentos: [], linhas: [], estado: 'RECEBIDA',
      ...dados,
      criadoEm: agora, criadoPor: u.utilizadorId, atualizadoEm: agora, atualizadoPor: u.utilizadorId,
    };
    await this.ctx.repos.faturas.guardar(fatura);
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
    exigir(RN_602, { tiposDocumentosPresentes: fatura.documentos.map((d) => d.tipo) });

    const atualizado: Fatura = { ...fatura, estado: 'EM_CONFERENCIA', atualizadoEm: this.ctx.relogio.agora(), atualizadoPor: u.utilizadorId };
    await this.ctx.repos.faturas.guardar(atualizado);
    await this.ctx.auditoria.registar({ utilizadorId: u.utilizadorId, entidade: 'Fatura', entidadeId: faturaId, operacao: 'CONFERENCIA:INICIAR', resultado: 'PERMITIDO' });
    return atualizado;
  }

  /** Conferência determinística (RN-603): linhas da fatura vs registos aprovados. */
  async conferir(faturaId: string): Promise<{ linhas: LinhaConferencia[]; conforme: boolean }> {
    const fatura = await this.carregar(faturaId);
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
    const resultado = RN_603.avaliar({ linhas });
    return { linhas, conforme: resultado.ok };
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

    const { linhas, conforme } = await this.conferir(faturaId);

    if (decisao === 'VALIDADA') {
      // Divergência bloqueia a validação (RN-603).
      if (!conforme) throw new ViolacaoRegra(RN_603, 'Há divergências entre a fatura e os registos aprovados do período.', { divergencias: linhas.filter((l) => l.quantidadeFatura !== l.quantidadeAprovada || l.valorFatura !== l.valorAprovado) });
      const contrato = await this.ctx.repos.contratos.obter(fatura.contratoId);
      const outras = (await this.ctx.repos.faturas.todos((f) => f.contratoId === fatura.contratoId && f.id !== fatura.id));
      exigir(RN_607, { totalFaturado: totalFaturado(outras), novoMontante: fatura.montanteSemIva, precoContratualAtual: contrato?.precoContratualAtual ?? 0 });
    } else if ((motivo ?? '').trim().length === 0) {
      throw new ViolacaoRegra(RN_604, 'A invalidação exige a indicação do motivo.');
    }

    const relatorio: RelatorioEvidencia = {
      id: this.ctx.ids.novo('rev'), faturaId, contratoId: fatura.contratoId, decisao,
      ...(decisao === 'INVALIDADA' && motivo !== undefined ? { motivo } : {}),
      frase: gerarFraseEvidencia({ decisao, numeroFatura: fatura.numero, periodoDe: fatura.periodoDe, periodoAte: fatura.periodoAte, ...(motivo !== undefined ? { motivo } : {}) }),
      linhas: linhas.map((l) => ({ perfil: l.perfilId, recurso: l.recursoId, quantidadeFatura: l.quantidadeFatura, quantidadeAprovada: l.quantidadeAprovada, valorFatura: l.valorFatura, valorAprovado: l.valorAprovado, confere: l.quantidadeFatura === l.quantidadeAprovada && l.valorFatura === l.valorAprovado })),
      geradoEm: this.ctx.relogio.agora(), geradoPor: u.utilizadorId,
    };
    exigir(RN_604, { temRelatorioEvidencia: true });
    await this.ctx.repos.relatoriosEvidencia.guardar(relatorio);

    const agora = this.ctx.relogio.agora();
    const atualizada: Fatura = {
      ...fatura, estado: decisao, relatorioEvidenciaId: relatorio.id,
      dataAprovacao: agora.slice(0, 10),
      ...(decisao === 'VALIDADA' ? { montanteAprovado: fatura.montanteSemIva } : {}),
      atualizadoEm: agora, atualizadoPor: u.utilizadorId,
    };
    await this.ctx.repos.faturas.guardar(atualizada);
    await this.ctx.auditoria.registar({ utilizadorId: u.utilizadorId, entidade: 'Fatura', entidadeId: faturaId, operacao: `DECIDIR:${decisao}`, resultado: 'PERMITIDO', depois: { numero: fatura.numero, relatorioEvidenciaId: relatorio.id } });
    return { fatura: atualizada, relatorio };
  }

  /** Devolve a fatura ao fornecedor (EM_CONFERENCIA → DEVOLVIDA), com motivo. */
  async devolver(faturaId: string, motivo: string, u: ContextoUtilizador): Promise<Fatura> {
    const fatura = await this.carregar(faturaId);
    const t = maquinaFatura.transicaoPermitida(fatura.estado, 'DEVOLVIDA', 'GESTOR_CONTRATO');
    if (!t.permitida) throw new ErroConflitoEstado(t.motivo ?? 'Transição inválida.');
    if (motivo.trim().length === 0) throw new ViolacaoRegra(RN_604, 'A devolução exige a indicação do motivo.');
    const agora = this.ctx.relogio.agora();
    const atualizada: Fatura = { ...fatura, estado: 'DEVOLVIDA', deducoes: [...(fatura.deducoes ?? []), { motivo, montante: 0 }], atualizadoEm: agora, atualizadoPor: u.utilizadorId };
    await this.ctx.repos.faturas.guardar(atualizada);
    await this.ctx.auditoria.registar({ utilizadorId: u.utilizadorId, entidade: 'Fatura', entidadeId: faturaId, operacao: 'DECIDIR:DEVOLVIDA', resultado: 'PERMITIDO', depois: { numero: fatura.numero, motivo } });
    return atualizada;
  }

  private async saldoCompromisso(compromisso: Compromisso, faturaAtualId: string): Promise<Cent> {
    const faturas = await this.ctx.repos.faturas.todos((f) => f.compromissoId === compromisso.id && f.id !== faturaAtualId && (f.estado === 'VALIDADA' || f.estado === 'PAGA'));
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
export function gerarFraseEvidencia(dados: { decisao: 'VALIDADA' | 'INVALIDADA'; numeroFatura: string; periodoDe: DataISO; periodoAte: DataISO; motivo?: string }): string {
  const periodo = `${dados.periodoDe} a ${dados.periodoAte}`;
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
