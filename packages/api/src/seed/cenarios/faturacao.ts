import type { Contexto } from '../../contexto.js';
import { Oficina, DOC_AUTO, DOC_FATURA, DOC_HORAS } from './blocos.js';

/**
 * CENÁRIO — CICLO DE FATURAÇÃO.
 *
 * Três situações, que são as três decisões que a conferência pode dar:
 *
 *  1. **Confere.** Bolsa de horas com registos aprovados que batem certo com a
 *     fatura — valida-se e o relatório de evidência fica arquivado.
 *  2. **Não confere.** Fatura acima do trabalho aprovado no período: o caminho
 *     é a nota de crédito, e fatura e nota decidem-se em conjunto (RN-612).
 *  3. **Não se pode faturar ainda.** Chave-na-mão com um entregável entregue
 *     por faturar e outro por entregar — a entrega é o facto gerador (RN-608)
 *     e o montante tem de ser o do entregável (RN-609).
 *
 * Há sempre alguma coisa por decidir mal se entra no ecrã: uma fatura à espera
 * da nota, e um entregável pronto a faturar. Um cenário de faturação que
 * começa com a caixa vazia não demonstra faturação nenhuma.
 */
export async function cenarioFaturacao(ctx: Contexto): Promise<void> {
  const o = new Oficina(ctx);
  await o.recursos();
  await o.procedimento();
  const projeto = await o.projeto('proj-P1', 'Modernização documental');
  /** Carimba o documento-tipo com a data de receção deste cenário. */
  const doc = <T extends { recebidoEm: string }>(d: T): T => ({ ...d, recebidoEm: o.agora });

  // ── 1 · Bolsa de horas com execução aprovada e histórico de faturação ─────
  const bolsa = await o.contrato({
    numero: 'C-2026-001', objeto: 'Prestação de serviços em outsourcing — desenvolvimento aplicacional',
    precoContratualInicial: 200_000_00, precoContratualAtual: 200_000_00,
  });
  await o.associar(bolsa.id, projeto);
  const senior = await o.perfil(bolsa, 'Arquiteto de Software Sénior', 1600, 65);
  const afSenior = await o.afetar(bolsa, senior, 'oid-recurso-01', [projeto]);
  await o.execucao(afSenior, senior, 30);
  const cmpBolsa = await o.compromisso(bolsa, 200_000_00);

  // Já validada — dá história ao relatório de faturação aprovada e mostra a
  // linha com evidência arquivada.
  await o.fatura(bolsa, {
    numero: 'FT-2026-091', compromissoId: cmpBolsa.id, montanteSemIva: 41_600_00,
    documentos: [doc(DOC_FATURA), doc(DOC_HORAS)],
    linhas: [{ perfilId: senior.id, recursoId: 'oid-recurso-01', quantidade: 3840, valorHora: 6500, montante: 41_600_00, origem: 'EXTRAIDA' }],
    estado: 'VALIDADA', montanteAprovado: 41_600_00, dataAprovacao: o.meses(-2),
    dataEmissao: o.meses(-3), dataRececao: o.meses(-3), periodoDe: o.meses(-4), periodoAte: o.meses(-3),
  });

  // ── 2 · Faturada a mais: à espera da nota de crédito ──────────────────────
  await o.fatura(bolsa, {
    numero: 'FT-2026-118', compromissoId: cmpBolsa.id, montanteSemIva: 26_000_00,
    documentos: [doc(DOC_FATURA), doc(DOC_HORAS)],
    linhas: [{ perfilId: senior.id, recursoId: 'oid-recurso-01', quantidade: 2400, valorHora: 6500, montante: 26_000_00, origem: 'EXTRAIDA' }],
    estado: 'AGUARDA_NOTA_CREDITO',
    notaCredito: { numero: 'por emitir', montante: 6_500_00, motivo: 'Faturadas 10 h acima das horas aprovadas no período.', registadaEm: o.meses(-1) },
  });

  // ── 3 · Chave-na-mão: a entrega é o facto gerador ─────────────────────────
  const chaveNaMao = await o.contrato({
    numero: 'C-2026-CM1', objeto: 'Implementação chave-na-mão de plataforma documental',
    tipologia: 'CHAVE_NA_MAO', precoContratualInicial: 160_000_00, precoContratualAtual: 160_000_00,
    dataInicioVigencia: o.meses(-8), dataTerminoContratual: o.meses(10), dataTerminoOriginal: o.meses(10),
  });
  await o.associar(chaveNaMao.id, projeto);
  const cmpCM = await o.compromisso(chaveNaMao, 160_000_00);

  const e1 = await o.entregavel(chaveNaMao, {
    ordem: 1, designacao: 'E1 · Levantamento e desenho da solução', valor: 30_000_00,
    entregue: true, entregueEm: o.meses(-6), registadoEntreguePor: 'oid-gestor-contrato', dataPrevista: o.meses(-6),
  });
  // E2 entregue e POR FATURAR — é o que se pode faturar já.
  await o.entregavel(chaveNaMao, {
    ordem: 2, designacao: 'E2 · Módulo de gestão documental', valor: 60_000_00,
    entregue: true, entregueEm: o.meses(-1), registadoEntreguePor: 'oid-gestor-contrato', dataPrevista: o.meses(-1),
  });
  // E3 por entregar — tentar faturá-lo esbarra na RN-608.
  await o.entregavel(chaveNaMao, {
    ordem: 3, designacao: 'E3 · Integração com sistemas centrais', valor: 50_000_00, dataPrevista: o.meses(4),
  });

  const fatE1 = await o.fatura(chaveNaMao, {
    numero: 'FT-CM-2026-004', compromissoId: cmpCM.id, tipo: 'ENTREGAVEL', entregavelId: e1.id,
    montanteSemIva: 30_000_00, documentos: [doc(DOC_FATURA), doc(DOC_AUTO)],
    estado: 'VALIDADA', montanteAprovado: 30_000_00, dataAprovacao: o.meses(-5),
    dataEmissao: o.meses(-6), dataRececao: o.meses(-6), periodoDe: o.meses(-8), periodoAte: o.meses(-6),
  });
  await ctx.repos.entregaveis.guardar({ ...e1, faturaId: fatE1.id, faturadoEm: o.meses(-5) });
}
