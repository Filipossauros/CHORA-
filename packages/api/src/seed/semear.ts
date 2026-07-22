import type {
  Afetacao, Alteracao, Compromisso, Contrato, DocumentoHabilitacao,
  Fatura, Lote, PerfilContratual, Procedimento, Recurso, RegistoTempo,
} from '@chora/domain';
import type { Contexto } from '../contexto.js';

/**
 * Seed determinístico (secção 12.1). Popula os repositórios em memória com dados
 * que cobrem os cenários de regra. Nenhuma referência a pessoas reais (secção 15).
 */
export async function semear(ctx: Contexto): Promise<void> {
  const { repos, relogio, ids } = ctx;
  const agora = relogio.agora();
  const audit = { criadoEm: agora, criadoPor: 'oid-gestor-contrato', atualizadoEm: agora, atualizadoPor: 'oid-gestor-contrato' };
  const gestores = [
    { utilizadorId: 'oid-gestor-contrato', principal: true, designadoEm: '2025-12-01', declaracaoConflitoInteressesEm: '2025-12-01', funcoes: 'execução física e financeira' },
  ];

  // Procedimento de concurso público com 3 lotes.
  const proc: Procedimento = { id: ids.novo('proc'), numero: 'CP-2026-001', descricao: 'Serviços de desenvolvimento de software', tipo: 'CONCURSO_PUBLICO', precoBase: 300_000_00, ...audit };
  await repos.procedimentos.guardar(proc);
  const lotes: Lote[] = [];
  for (let i = 1; i <= 3; i += 1) {
    const lote: Lote = { id: ids.novo('lote'), procedimentoId: proc.id, numero: `L${i}`, designacao: `Lote ${i}`, precoBase: 100_000_00, ...audit };
    lotes.push(lote);
    await repos.lotes.guardar(lote);
  }

  // Procedimento ao abrigo de acordo-quadro.
  const procAq: Procedimento = { id: ids.novo('proc'), numero: 'AQ-2026-009', descricao: 'Serviços ao abrigo de acordo-quadro', tipo: 'ACORDO_QUADRO', acordoQuadroId: 'AQ-BASE-1', precoBase: 50_000_00, ...audit };
  await repos.procedimentos.guardar(procAq);
  const loteAq: Lote = { id: ids.novo('lote'), procedimentoId: procAq.id, numero: 'L1', designacao: 'Lote único AQ', ...audit };
  await repos.lotes.guardar(loteAq);

  function contratoBase(over: Partial<Contrato> & Pick<Contrato, 'id' | 'numero'>): Contrato {
    return {
      objeto: 'Prestação de serviços em outsourcing', estado: 'EM_VIGOR',
      tipologia: 'BOLSA_HORAS',
      numeroProcedimento: proc.numero, tipoProcedimento: 'CONCURSO_PUBLICO', numeroLote: 1,
      precoContratualInicial: 100_000_00, precoContratualAtual: 100_000_00,
      prestador: { nome: 'Prestador Alfa, Lda.', nipc: '500000001' },
      dataAssinaturaCA: '2025-12-15', dataInicioVigencia: '2026-01-01',
      dataTerminoContratual: '2027-12-31', dataTerminoOriginal: '2027-12-31',
      vistoTribunalContasNecessario: false,
      gestores, excecoes: [], ...audit, ...over,
    };
  }

  // Contrato A — EM_VIGOR, 2 projetos, com revisão de preços a meio da vigência.
  const contratoA = contratoBase({ id: ids.novo('ctr'), numero: 'C-2026-001', dataVistoTribunalContas: undefined });
  await repos.contratos.guardar(contratoA);

  // Contrato B — visto do TdC pendente (AGUARDA_VISTO).
  const contratoB = contratoBase({ id: ids.novo('ctr'), numero: 'C-2026-002', estado: 'AGUARDA_VISTO', vistoTribunalContasNecessario: true, dataRemessaTribunalContas: '2026-01-10' });
  await repos.contratos.guardar(contratoB);

  // Contrato C — bolsa de valor + serviços complementares a 42%.
  const contratoC = contratoBase({ id: ids.novo('ctr'), numero: 'C-2026-003', precoContratualAtual: 142_000_00 });
  await repos.contratos.guardar(contratoC);
  const altComplementar: Alteracao = {
    id: ids.novo('alt'), contratoId: contratoC.id, tipo: 'SERVICOS_COMPLEMENTARES', dataEfeito: '2026-06-01',
    descricao: 'Serviços complementares', fundamentacao: 'Necessidade superveniente fundamentada.',
    valorAcrescido: 42_000_00, publicitacaoPortalBase: { obrigatoria: true },
    registadoEm: agora, registadoPor: 'oid-gestor-contrato', atualizadoEm: agora, atualizadoPor: 'oid-gestor-contrato',
  };
  await repos.alteracoes.guardar(altComplementar);

  // Contrato ao abrigo de AQ.
  const contratoAq = contratoBase({ id: ids.novo('ctr'), numero: 'C-2026-AQ1', precoContratualInicial: 50_000_00, precoContratualAtual: 50_000_00 });
  await repos.contratos.guardar(contratoAq);

  // Contrato A com suspensão (com efeito no prazo de execução).
  const altSuspensao: Alteracao = {
    id: ids.novo('alt'), contratoId: contratoA.id, tipo: 'SUSPENSAO', dataEfeito: '2026-03-01',
    descricao: 'Suspensão temporária', fundamentacao: 'Suspensão fundamentada.',
    suspensao: { dataInicio: '2026-03-01', dataFim: '2026-03-15', suspendePrazoExecucao: true },
    registadoEm: agora, registadoPor: 'oid-gestor-contrato', atualizadoEm: agora, atualizadoPor: 'oid-gestor-contrato',
  };
  await repos.alteracoes.guardar(altSuspensao);

  // Perfis (contrato A) — um com revisão de preços (ADR-09). Sem dotações.
  const perfilSenior: PerfilContratual = {
    id: ids.novo('perf'), contratoId: contratoA.id, nome: 'Arquiteto de Software Sénior',
    quantidadePrevista: 60_000, consomeBolsaValor: true, consomeTrabalhosComplementares: false, perfilDeGestao: true,
    precos: [
      { valorHora: 5000, vigenteDe: '2026-01-01', vigenteAte: '2026-06-30' },
      { valorHora: 5500, vigenteDe: '2026-07-01' }, // revisão de preços
    ], ...audit,
  };
  const perfilJunior: PerfilContratual = {
    id: ids.novo('perf'), contratoId: contratoA.id, nome: 'Programador Júnior',
    quantidadePrevista: 36_000, consomeBolsaValor: false, consomeTrabalhosComplementares: false, perfilDeGestao: false,
    precos: [{ valorHora: 3000, vigenteDe: '2026-01-01' }], ...audit,
  };
  await repos.perfis.guardar(perfilSenior);
  await repos.perfis.guardar(perfilJunior);

  // Recursos (um de subcontratado).
  const recursos: Recurso[] = [
    { id: 'oid-recurso-01', entidadeExecutanteNipc: '500000001', ativo: true, ...audit },
    { id: 'oid-recurso-02', entidadeExecutanteNipc: '500000001', ativo: true, ...audit },
    { id: 'oid-recurso-03', entidadeExecutanteNipc: '500000777', ativo: true, ...audit }, // subcontratado
  ];
  for (const r of recursos) await repos.recursos.guardar(r);

  // N:N contrato↔projeto: contrato A em 2 projetos; projeto P1 em 2 contratos.
  const P1 = 'proj-P1', P2 = 'proj-P2';
  for (const [contratoId, projetoId] of [[contratoA.id, P1], [contratoA.id, P2], [contratoC.id, P1]] as const) {
    await repos.contratoProjetos.guardar({ id: ids.novo('cp'), contratoId, projetoId });
  }

  // Afetações.
  const afSenior: Afetacao = { id: ids.novo('afe'), contratoId: contratoA.id, perfilId: perfilSenior.id, recursoId: 'oid-recurso-01', projetoIds: [P1, P2], vigenteDe: '2026-01-01', ativa: true, ...audit };
  const afJunior: Afetacao = { id: ids.novo('afe'), contratoId: contratoA.id, perfilId: perfilJunior.id, recursoId: 'oid-recurso-02', projetoIds: [P1], vigenteDe: '2026-01-01', ativa: true, ...audit };
  await repos.afetacoes.guardar(afSenior);
  await repos.afetacoes.guardar(afJunior);

  // Substituição de recurso (RN-701): recurso-03 substitui recurso-02 no perfil júnior.
  const afSubstituida: Afetacao = { ...afJunior, vigenteAte: '2026-06-30', ativa: false };
  await repos.afetacoes.guardar(afSubstituida);
  const afSucessora: Afetacao = { id: ids.novo('afe'), contratoId: contratoA.id, perfilId: perfilJunior.id, recursoId: 'oid-recurso-03', projetoIds: [P1], vigenteDe: '2026-07-01', ativa: true, substituiAfetacaoId: afJunior.id, ...audit };
  await repos.afetacoes.guardar(afSucessora);

  // Registos de tempo em vários estados.
  function reg(over: Partial<RegistoTempo> & Pick<RegistoTempo, 'id' | 'data' | 'estado'>): RegistoTempo {
    return {
      afetacaoId: afSenior.id, contratoId: contratoA.id, perfilId: perfilSenior.id, recursoId: 'oid-recurso-01',
      projetoId: P1, workItemId: 1001, duracao: 480, descricaoAtividade: 'Desenvolvimento',
      tipoDotacaoConsumida: 'HORAS_BASE', valorHoraAplicado: 0, valorImputado: 0,
      submetidoEm: undefined, criadoEm: agora, criadoPor: 'oid-recurso-01', atualizadoEm: agora, atualizadoPor: 'oid-recurso-01', ...over,
    };
  }
  const registos: RegistoTempo[] = [
    reg({ id: ids.novo('rt'), data: '2026-02-02', estado: 'APROVADO', valorHoraAplicado: 5000, valorImputado: 40000, aprovadoPor: 'oid-gestor-contrato', aprovadoEm: agora }),
    reg({ id: ids.novo('rt'), data: '2026-02-03', estado: 'SUBMETIDO', submetidoEm: agora }),
    reg({ id: ids.novo('rt'), data: '2026-02-04', estado: 'RASCUNHO' }),
    reg({ id: ids.novo('rt'), data: '2026-02-05', estado: 'REJEITADO', motivoRejeicao: 'Descrição insuficiente' }),
    reg({ id: ids.novo('rt'), data: '2026-02-06', estado: 'ANULADO', anuladoPor: 'oid-gestor-contrato', anuladoEm: agora, motivoAnulacao: 'Duplicado' }),
    reg({ id: ids.novo('rt'), data: '2026-02-07', estado: 'SUBMETIDO', submetidoEm: agora }), // sábado — aviso RN-404
    reg({ id: ids.novo('rt'), data: '2028-01-01', estado: 'RASCUNHO' }), // fora da vigência
  ];
  for (const r of registos) await repos.registosTempo.guardar(r);

  // Habilitação a expirar (aciona AL-HABILITACAO).
  const doc: DocumentoHabilitacao = { id: ids.novo('doc'), contratoId: contratoA.id, tipo: 'CAUCAO', emitidoEm: '2025-12-01', validoAte: '2026-08-05', ...audit };
  await repos.documentosHabilitacao.guardar(doc);

  // Compromisso e faturas.
  const compromisso: Compromisso = { id: ids.novo('cmp'), contratoId: contratoA.id, numero: 'CMP-2026-1', montante: 100_000_00, ano: 2026, emitidoEm: '2026-01-05', ...audit };
  await repos.compromissos.guardar(compromisso);

  function fatura(over: Partial<Fatura> & Pick<Fatura, 'id' | 'numero'>): Fatura {
    return {
      contratoId: contratoA.id, compromissoId: compromisso.id, documentos: [],
      dataEmissao: '2026-03-01', dataRececao: '2026-03-02', periodoDe: '2026-02-01', periodoAte: '2026-02-28',
      montanteSemIva: 40000, montanteIva: 9200, linhas: [], estado: 'RECEBIDA', ...audit, ...over,
    };
  }
  const docFatura = { tipo: 'FATURA' as const, ficheiroRef: 'arq://f1', nomeOriginal: 'fatura.pdf', hashSha256: 'a'.repeat(64), tamanhoBytes: 1024, recebidoEm: agora, carregadoPor: 'oid-gestor-contrato' };
  const docRelatorio = { tipo: 'RELATORIO_HORAS_FORNECEDOR' as const, ficheiroRef: 'arq://r1', nomeOriginal: 'horas.pdf', hashSha256: 'b'.repeat(64), tamanhoBytes: 2048, recebidoEm: agora, carregadoPor: 'oid-gestor-contrato' };

  // Fatura 1 — completa e conforme.
  await repos.faturas.guardar(fatura({ id: ids.novo('fat'), numero: 'FT-001', documentos: [docFatura, docRelatorio],
    linhas: [{ perfilId: perfilSenior.id, recursoId: 'oid-recurso-01', quantidade: 480, valorHora: 5000, montante: 40000, origem: 'MANUAL' }] }));
  // Fatura 2 — sem relatório de horas (aciona RN-602).
  await repos.faturas.guardar(fatura({ id: ids.novo('fat'), numero: 'FT-002', documentos: [docFatura] }));
  // Fatura 3 — divergência de quantidade (aciona RN-603).
  await repos.faturas.guardar(fatura({ id: ids.novo('fat'), numero: 'FT-003', documentos: [docFatura, docRelatorio],
    linhas: [{ perfilId: perfilSenior.id, recursoId: 'oid-recurso-01', quantidade: 600, valorHora: 5000, montante: 50000, origem: 'MANUAL' }] }));
}

/** Resumo textual do seed, para o comando `pnpm seed`. */
export async function resumoSeed(ctx: Contexto): Promise<Record<string, number>> {
  const r = ctx.repos;
  return {
    procedimentos: (await r.procedimentos.todos()).length,
    contratos: (await r.contratos.todos()).length,
    perfis: (await r.perfis.todos()).length,
    afetacoes: (await r.afetacoes.todos()).length,
    registosTempo: (await r.registosTempo.todos()).length,
    faturas: (await r.faturas.todos()).length,
    alteracoes: (await r.alteracoes.todos()).length,
  };
}
