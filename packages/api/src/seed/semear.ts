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
    { utilizadorId: 'oid-gestor-contrato', principal: true, designadoEm: '2025-12-01' },
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
    valorAcrescido: 42_000_00,
    registadoEm: agora, registadoPor: 'oid-gestor-contrato', atualizadoEm: agora, atualizadoPor: 'oid-gestor-contrato',
  };
  await repos.alteracoes.guardar(altComplementar);

  // Contrato ao abrigo de AQ.
  const contratoAq = contratoBase({ id: ids.novo('ctr'), numero: 'C-2026-AQ1', precoContratualInicial: 50_000_00, precoContratualAtual: 50_000_00 });
  await repos.contratos.guardar(contratoAq);

  // Contrato D — BOLSA DE HORAS, para validar o separador Capacidade. Os perfis
  // contratuais (horas + valor/hora) pertencem à bolsa de horas. Datas relativas
  // a "hoje" (momento do seed) para garantir uma janela de execução com dias
  // úteis por consumir.
  const hojeSeed = new Date(agora);
  const isoMeses = (meses: number): string => { const d = new Date(hojeSeed); d.setMonth(d.getMonth() + meses); return d.toISOString().slice(0, 10); };
  const contratoBH = contratoBase({
    id: ids.novo('ctr'), numero: 'C-2026-BH2', tipologia: 'BOLSA_HORAS',
    objeto: 'Bolsa de horas para evolução de plataforma digital',
    precoContratualInicial: 300_000_00, precoContratualAtual: 300_000_00, numeroLote: 2,
    dataInicioVigencia: isoMeses(-2), dataTerminoContratual: isoMeses(10), dataTerminoOriginal: isoMeses(10),
  });
  await repos.contratos.guardar(contratoBH);
  const bhPerfis: PerfilContratual[] = [
    { id: ids.novo('perf'), contratoId: contratoBH.id, nome: 'Consultor Funcional', quantidadePrevista: 105_600, consomeBolsaValor: false, consomeTrabalhosComplementares: false, perfilDeGestao: false, precos: [{ valorHora: 4000, vigenteDe: isoMeses(-2) }], ...audit }, // 1760 h
    { id: ids.novo('perf'), contratoId: contratoBH.id, nome: 'Programador Full-stack', quantidadePrevista: 211_200, consomeBolsaValor: false, consomeTrabalhosComplementares: false, perfilDeGestao: false, precos: [{ valorHora: 3500, vigenteDe: isoMeses(-2) }], ...audit }, // 3520 h
    { id: ids.novo('perf'), contratoId: contratoBH.id, nome: 'Gestor de Projeto', quantidadePrevista: 52_800, consomeBolsaValor: false, consomeTrabalhosComplementares: false, perfilDeGestao: true, precos: [{ valorHora: 6000, vigenteDe: isoMeses(-2) }], ...audit }, // 880 h
  ];
  for (const pf of bhPerfis) await repos.perfis.guardar(pf);
  // Só uma pessoa afeta (ao Consultor Funcional): os restantes perfis ficam por
  // preencher, para o dashboard mostrar "pessoas em falta".
  const bhConsultor = bhPerfis[0];
  if (bhConsultor !== undefined) {
    const afBH: Afetacao = { id: ids.novo('afe'), contratoId: contratoBH.id, perfilId: bhConsultor.id, recursoId: 'oid-recurso-09', projetoIds: [], vigenteDe: isoMeses(-2), ativa: true, ...audit };
    await repos.afetacoes.guardar(afBH);
  }

  // Contrato E — CHAVE-NA-MÃO: paga-se o resultado, não as horas. O preço
  // reparte-se por ENTREGÁVEIS (160 000 €) e por uma BOLSA DE HORAS reservada a
  // trabalhos não previstos (30 000 €), sobrando 10 000 € por atribuir. Um
  // entregável já entregue e faturado, outro entregue por faturar (é o que se
  // pode faturar já) e dois previstos.
  const contratoCM = contratoBase({
    id: ids.novo('ctr'), numero: 'C-2026-CM1', tipologia: 'CHAVE_NA_MAO',
    objeto: 'Empreitada chave-na-mão de plataforma digital',
    precoContratualInicial: 200_000_00, precoContratualAtual: 200_000_00, numeroLote: 3,
    bolsaHorasValor: 30_000_00,
    dataInicioVigencia: isoMeses(-8), dataTerminoContratual: isoMeses(11), dataTerminoOriginal: isoMeses(11),
  });
  await repos.contratos.guardar(contratoCM);

  const entregaveisCM: Array<{ designacao: string; valor: number; entregue: boolean; entregueEm?: string; dataPrevista: string }> = [
    { designacao: 'E1 · Levantamento e desenho da solução', valor: 30_000_00, entregue: true, entregueEm: isoMeses(-6), dataPrevista: isoMeses(-6) },
    { designacao: 'E2 · Módulo de gestão documental', valor: 60_000_00, entregue: true, entregueEm: isoMeses(-1), dataPrevista: isoMeses(-1) },
    { designacao: 'E3 · Integração com sistemas centrais', valor: 50_000_00, entregue: false, dataPrevista: isoMeses(4) },
    { designacao: 'E4 · Formação e transferência de conhecimento', valor: 20_000_00, entregue: false, dataPrevista: isoMeses(9) },
  ];
  const idsEntregaveis: string[] = [];
  for (const [i, e] of entregaveisCM.entries()) {
    const id = ids.novo('ent');
    idsEntregaveis.push(id);
    await repos.entregaveis.guardar({
      id, contratoId: contratoCM.id, ordem: i + 1, designacao: e.designacao,
      valor: e.valor, percentagemContrato: e.valor / contratoCM.precoContratualAtual,
      dataPrevista: e.dataPrevista, entregue: e.entregue,
      ...(e.entregueEm !== undefined ? { entregueEm: e.entregueEm, registadoEntreguePor: 'oid-gestor-contrato' } : {}),
      ...audit,
    });
  }

  // Perfis e afetação da componente BOLSA DE HORAS do chave-na-mão: existem
  // para os trabalhos não previstos, pelo que não é obrigatório preenchê-los.
  const perfilCMBolsa: PerfilContratual = {
    id: ids.novo('perf'), contratoId: contratoCM.id, nome: 'Programador Full-stack',
    quantidadePrevista: 30_000, consomeBolsaValor: true, consomeTrabalhosComplementares: false, perfilDeGestao: false,
    precos: [{ valorHora: 4500, vigenteDe: isoMeses(-8) }], ...audit, // 500 h
  };
  await repos.perfis.guardar(perfilCMBolsa);
  const afCM: Afetacao = { id: ids.novo('afe'), contratoId: contratoCM.id, perfilId: perfilCMBolsa.id, recursoId: 'oid-recurso-02', projetoIds: [], vigenteDe: isoMeses(-8), ativa: true, ...audit };
  await repos.afetacoes.guardar(afCM);
  await repos.registosTempo.guardar({
    id: ids.novo('rt'), afetacaoId: afCM.id, contratoId: contratoCM.id, perfilId: perfilCMBolsa.id, recursoId: 'oid-recurso-02',
    projetoId: 'azure-devops', workItemId: 5001, data: isoMeses(-2), duracao: 4_800, // 80 h
    descricaoAtividade: 'Trabalhos não previstos — ajustes pedidos em sede de aceitação',
    tipoDotacaoConsumida: 'BOLSA_VALOR', valorHoraAplicado: 4500, valorImputado: 80 * 4500,
    estado: 'APROVADO', aprovadoPor: 'oid-gestor-contrato', aprovadoEm: agora,
    criadoEm: agora, criadoPor: 'oid-recurso-02', atualizadoEm: agora, atualizadoPor: 'oid-recurso-02',
  });

  // Contrato F — BOLSA DE HORAS com um perfil quase esgotado (~95 %), para
  // acionar o alerta AL-PERFIL-90 e demonstrar a sugestão de IA: existe um
  // perfil idêntico ("Consultor Funcional") com disponibilidade no C-2026-BH2.
  const contratoBH3 = contratoBase({
    id: ids.novo('ctr'), numero: 'C-2026-BH3', tipologia: 'BOLSA_HORAS',
    objeto: 'Bolsa de horas para manutenção aplicacional',
    precoContratualInicial: 200_000_00, precoContratualAtual: 200_000_00, numeroLote: 4,
    dataInicioVigencia: isoMeses(-6), dataTerminoContratual: isoMeses(9), dataTerminoOriginal: isoMeses(9),
  });
  await repos.contratos.guardar(contratoBH3);
  const perfilQuaseEsgotado: PerfilContratual = {
    id: ids.novo('perf'), contratoId: contratoBH3.id, nome: 'Consultor Funcional',
    quantidadePrevista: 12_000, consomeBolsaValor: false, consomeTrabalhosComplementares: false, perfilDeGestao: false,
    precos: [{ valorHora: 4000, vigenteDe: isoMeses(-6) }], ...audit, // 200 h contratadas
  };
  await repos.perfis.guardar(perfilQuaseEsgotado);
  const afBH3: Afetacao = { id: ids.novo('afe'), contratoId: contratoBH3.id, perfilId: perfilQuaseEsgotado.id, recursoId: 'oid-recurso-09', projetoIds: [], vigenteDe: isoMeses(-6), ativa: true, ...audit };
  await repos.afetacoes.guardar(afBH3);
  // Registo aprovado que consome ~95 % das horas (190 h de 200 h).
  await repos.registosTempo.guardar({
    id: ids.novo('rt'), afetacaoId: afBH3.id, contratoId: contratoBH3.id, perfilId: perfilQuaseEsgotado.id, recursoId: 'oid-recurso-09',
    projetoId: 'azure-devops', workItemId: 2001, data: isoMeses(-1), duracao: 11_400, descricaoAtividade: 'Manutenção aplicacional',
    tipoDotacaoConsumida: 'HORAS_BASE', valorHoraAplicado: 4000, valorImputado: Math.round((11_400 / 60) * 4000),
    estado: 'APROVADO', aprovadoPor: 'oid-gestor-contrato', aprovadoEm: agora,
    criadoEm: agora, criadoPor: 'oid-recurso-09', atualizadoEm: agora, atualizadoPor: 'oid-recurso-09',
  });

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
    { id: 'oid-recurso-09', entidadeExecutanteNipc: '500000001', ativo: true, ...audit }, // afeto ao contrato de bolsa de horas
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
      montanteSemIva: 40000, montanteIva: 9200, linhas: [], estado: 'RECEBIDA',
      tipo: 'BOLSA_HORAS', ...audit, ...over,
    };
  }
  const docFatura = { tipo: 'FATURA' as const, ficheiroRef: 'arq://f1', nomeOriginal: 'fatura.pdf', hashSha256: 'a'.repeat(64), tamanhoBytes: 1024, recebidoEm: agora, carregadoPor: 'oid-gestor-contrato' };
  const docRelatorio = { tipo: 'RELATORIO_HORAS_FORNECEDOR' as const, ficheiroRef: 'arq://r1', nomeOriginal: 'horas.pdf', hashSha256: 'b'.repeat(64), tamanhoBytes: 2048, recebidoEm: agora, carregadoPor: 'oid-gestor-contrato' };
  const docAuto = { tipo: 'AUTO_ENTREGA' as const, ficheiroRef: 'arq://a1', nomeOriginal: 'auto-entrega.pdf', hashSha256: 'c'.repeat(64), tamanhoBytes: 1536, recebidoEm: agora, carregadoPor: 'oid-gestor-contrato' };

  const docCombinado = { tipo: 'FATURA_COM_RELATORIO' as const, ficheiroRef: 'arq://fc1', nomeOriginal: 'fatura-e-horas.pdf', hashSha256: 'e'.repeat(64), tamanhoBytes: 3072, recebidoEm: agora, carregadoPor: 'oid-gestor-contrato' };

  // Fatura 1 — bolsa de horas conforme, com fatura e relatório em separado.
  await repos.faturas.guardar(fatura({ id: ids.novo('fat'), numero: 'FT-001', documentos: [docFatura, docRelatorio],
    linhas: [{ perfilId: perfilSenior.id, recursoId: 'oid-recurso-01', quantidade: 480, valorHora: 5000, montante: 40000, origem: 'MANUAL' }] }));
  // Fatura 2 — sem relatório de horas (aciona RN-602).
  await repos.faturas.guardar(fatura({ id: ids.novo('fat'), numero: 'FT-002', documentos: [docFatura] }));
  // Fatura 3 — divergência de quantidade (aciona RN-603).
  await repos.faturas.guardar(fatura({ id: ids.novo('fat'), numero: 'FT-003', documentos: [docFatura, docRelatorio],
    linhas: [{ perfilId: perfilSenior.id, recursoId: 'oid-recurso-01', quantidade: 600, valorHora: 5000, montante: 50000, origem: 'MANUAL' }] }));
  // Fatura 4 — bolsa de horas com a fatura e o relatório NO MESMO ficheiro, já
  // decidida: dá história ao relatório de faturação aprovada.
  await repos.faturas.guardar(fatura({
    id: ids.novo('fat'), numero: 'FT-004', documentos: [docCombinado],
    linhas: [{ perfilId: perfilSenior.id, recursoId: 'oid-recurso-01', quantidade: 240, valorHora: 5000, montante: 20000, origem: 'EXTRAIDA' }],
    dataEmissao: '2026-04-01', dataRececao: '2026-04-02', periodoDe: '2026-03-01', periodoAte: '2026-03-31',
    montanteSemIva: 20000, montanteIva: 4600, estado: 'VALIDADA', montanteAprovado: 20000, dataAprovacao: '2026-04-05',
  }));

  // Faturação do contrato chave-na-mão: o E1 (entregue) já foi liquidado por
  // uma fatura do tipo ENTREGAVEL, pelo montante exato do entregável (RN-609).
  // O E2 está entregue mas por faturar — é o que se pode faturar já.
  const cmpCM: Compromisso = { id: ids.novo('cmp'), contratoId: contratoCM.id, numero: 'CMP-2026-CM', montante: 200_000_00, ano: Number(agora.slice(0, 4)), emitidoEm: isoMeses(-8), ...audit };
  await repos.compromissos.guardar(cmpCM);
  const idE1 = idsEntregaveis[0];
  if (idE1 !== undefined) {
    const fatE1 = ids.novo('fat');
    await repos.faturas.guardar({
      id: fatE1, contratoId: contratoCM.id, compromissoId: cmpCM.id, numero: 'FT-CM-001',
      tipo: 'ENTREGAVEL', entregavelId: idE1,
      documentos: [docFatura, docAuto], linhas: [],
      dataEmissao: isoMeses(-6), dataRececao: isoMeses(-6), periodoDe: isoMeses(-8), periodoAte: isoMeses(-6),
      montanteSemIva: 30_000_00, montanteIva: 6_900_00, estado: 'VALIDADA',
      montanteAprovado: 30_000_00, ...audit,
    });
    const e1 = await repos.entregaveis.obter(idE1);
    if (e1 !== null) await repos.entregaveis.guardar({ ...e1, faturaId: fatE1, faturadoEm: agora });
  }

  await semearCenariosDeAlerta(ctx, { agora, audit, gestores, isoMeses, procNumero: proc.numero });
}

interface ContextoCenarios {
  agora: string;
  audit: { criadoEm: string; criadoPor: string; atualizadoEm: string; atualizadoPor: string };
  gestores: Contrato['gestores'];
  isoMeses: (meses: number) => string;
  procNumero: string;
}

/**
 * Cenários dedicados a exercitar TODAS as regras de alerta do catálogo.
 *
 * Cada contrato aqui existe para demonstrar uma família de decisões na fila
 * «Hoje» — cobertura orçamental plurianual, fim de ciclo, higiene de execução.
 * Os números são escolhidos para o alerta disparar de forma óbvia, e o objeto de
 * cada contrato descreve o cenário que representa.
 */
async function semearCenariosDeAlerta(ctx: Contexto, c: ContextoCenarios): Promise<void> {
  const { repos, ids } = ctx;
  const { agora, audit, gestores, isoMeses, procNumero } = c;
  const anoAtual = Number(agora.slice(0, 4));
  const carimbo = { registadoEm: agora, registadoPor: 'oid-gestor-contrato', atualizadoEm: agora, atualizadoPor: 'oid-gestor-contrato' };

  function base(over: Partial<Contrato> & Pick<Contrato, 'id' | 'numero' | 'objeto'>): Contrato {
    return {
      estado: 'EM_VIGOR', tipologia: 'BOLSA_HORAS',
      numeroProcedimento: procNumero, tipoProcedimento: 'CONCURSO_PUBLICO',
      precoContratualInicial: 100_000_00, precoContratualAtual: 100_000_00,
      prestador: { nome: 'Prestador Alfa, Lda.', nipc: '500000001' },
      dataAssinaturaCA: '2025-12-15', dataInicioVigencia: isoMeses(-6),
      dataTerminoContratual: isoMeses(18), dataTerminoOriginal: isoMeses(18),
      vistoTribunalContasNecessario: false, gestores, excecoes: [], ...audit, ...over,
    };
  }

  /** Cria perfil + afetação + registo aprovado, para gerar execução real. */
  async function comExecucao(contrato: Contrato, nome: string, horas: number, valorHora: number, horasConsumidas: number, dataRegisto: string): Promise<void> {
    const perfil: PerfilContratual = {
      id: ids.novo('perf'), contratoId: contrato.id, nome, quantidadePrevista: horas * 60,
      consomeBolsaValor: false, consomeTrabalhosComplementares: false, perfilDeGestao: false,
      precos: [{ valorHora, vigenteDe: contrato.dataInicioVigencia }], ...audit,
    };
    await repos.perfis.guardar(perfil);
    const af: Afetacao = { id: ids.novo('afe'), contratoId: contrato.id, perfilId: perfil.id, recursoId: 'oid-recurso-02', projetoIds: [], vigenteDe: contrato.dataInicioVigencia, ativa: true, ...audit };
    await repos.afetacoes.guardar(af);
    if (horasConsumidas > 0) {
      await repos.registosTempo.guardar({
        id: ids.novo('rt'), afetacaoId: af.id, contratoId: contrato.id, perfilId: perfil.id, recursoId: 'oid-recurso-02',
        projetoId: 'azure-devops', workItemId: 3000 + Math.round(horasConsumidas), data: dataRegisto,
        duracao: horasConsumidas * 60, descricaoAtividade: 'Execução contratada',
        tipoDotacaoConsumida: 'HORAS_BASE', valorHoraAplicado: valorHora, valorImputado: horasConsumidas * valorHora,
        estado: 'APROVADO', aprovadoPor: 'oid-gestor-contrato', aprovadoEm: agora,
        criadoEm: agora, criadoPor: 'oid-recurso-02', atualizadoEm: agora, atualizadoPor: 'oid-recurso-02',
      });
    }
  }

  // ── G · Portaria trava a vigência abaixo do máximo legal ──────────────────
  // A portaria só reparte encargos para o ano corrente e o contrato termina a
  // 31/12; reprogramá-la libertaria ~34 meses até ao limite de 36.
  const gPortariaCurta = base({
    id: ids.novo('ctr'), numero: 'C-2026-PT1',
    objeto: 'Bolsa de horas travada pela portaria de extensão de encargos',
    dataInicioVigencia: isoMeses(-1), dataTerminoContratual: `${anoAtual}-12-31`, dataTerminoOriginal: `${anoAtual}-12-31`,
    portariaExtensaoEncargos: { numero: `P-${anoAtual}/101`, data: `${anoAtual - 1}-12-20`, reparticaoAnual: [{ ano: anoAtual, montante: 100_000_00 }] },
  });
  await repos.contratos.guardar(gPortariaCurta);
  await comExecucao(gPortariaCurta, 'Analista de Sistemas', 1000, 4500, 60, isoMeses(-1));

  // ── H · Portaria por reprogramar (vigência já ultrapassa o ano coberto) ───
  const hPortariaVencida = base({
    id: ids.novo('ctr'), numero: 'C-2026-PT2',
    objeto: 'Contrato plurianual sem cobertura orçamental para o período remanescente',
    dataInicioVigencia: isoMeses(-8), dataTerminoContratual: `${anoAtual + 1}-10-31`, dataTerminoOriginal: `${anoAtual + 1}-10-31`,
    portariaExtensaoEncargos: { numero: `P-${anoAtual}/102`, data: `${anoAtual - 1}-12-20`, reparticaoAnual: [{ ano: anoAtual, montante: 80_000_00 }] },
  });
  await repos.contratos.guardar(hPortariaVencida);
  await comExecucao(hPortariaVencida, 'Programador Sénior', 1200, 5000, 100, isoMeses(-2));

  // ── I · Execução projetada excede a dotação do ano ────────────────────────
  // Ritmo recente alto contra uma dotação anual pequena.
  const iExcedeAno = base({
    id: ids.novo('ctr'), numero: 'C-2026-PT3',
    objeto: 'Execução acima da dotação repartida para o ano corrente',
    precoContratualInicial: 300_000_00, precoContratualAtual: 300_000_00,
    dataInicioVigencia: isoMeses(-4), dataTerminoContratual: isoMeses(20), dataTerminoOriginal: isoMeses(20),
    portariaExtensaoEncargos: { numero: `P-${anoAtual}/103`, data: `${anoAtual - 1}-12-20`, reparticaoAnual: [{ ano: anoAtual, montante: 30_000_00 }, { ano: anoAtual + 1, montante: 120_000_00 }] },
  });
  await repos.contratos.guardar(iExcedeAno);
  await comExecucao(iExcedeAno, 'Programador Full-stack', 4000, 5000, 500, isoMeses(-1)); // 25 000 € já executados, ritmo elevado

  // ── I2 · Dotação do ano quase esgotada (sem a exceder) ────────────────────
  // 46 000 € executados de 50 000 € repartidos para o ano (92%). O registo é
  // antigo, pelo que o ritmo recente é nulo e a projeção não ultrapassa a
  // dotação — é o aviso, não a rutura.
  const i2DotacaoNoLimite = base({
    id: ids.novo('ctr'), numero: 'C-2026-PT4',
    objeto: 'Dotação anual quase esgotada antes do fim do ano económico',
    precoContratualInicial: 150_000_00, precoContratualAtual: 150_000_00,
    dataInicioVigencia: isoMeses(-9), dataTerminoContratual: isoMeses(15), dataTerminoOriginal: isoMeses(15),
    portariaExtensaoEncargos: { numero: `P-${anoAtual}/104`, data: `${anoAtual - 1}-12-20`, reparticaoAnual: [{ ano: anoAtual, montante: 50_000_00 }, { ano: anoAtual + 1, montante: 100_000_00 }] },
  });
  await repos.contratos.guardar(i2DotacaoNoLimite);
  await comExecucao(i2DotacaoNoLimite, 'Consultor de Dados', 1000, 5000, 920, isoMeses(-3));

  // ── J · Valor disponível reduzido + perfil a 80% + complementares a 46% ───
  const jQuaseEsgotado = base({
    id: ids.novo('ctr'), numero: 'C-2026-EX1',
    objeto: 'Contrato com saldo reduzido e complementares perto do teto',
    precoContratualInicial: 100_000_00, precoContratualAtual: 146_000_00,
    dataInicioVigencia: isoMeses(-10), dataTerminoContratual: isoMeses(14), dataTerminoOriginal: isoMeses(14),
  });
  await repos.contratos.guardar(jQuaseEsgotado);
  await repos.alteracoes.guardar({
    id: ids.novo('alt'), contratoId: jQuaseEsgotado.id, tipo: 'SERVICOS_COMPLEMENTARES', dataEfeito: isoMeses(-3),
    descricao: 'Trabalhos complementares', fundamentacao: 'Necessidade superveniente fundamentada.',
    valorAcrescido: 46_000_00, novaDataTermino: isoMeses(14), ...carimbo,
  });
  // Dois perfis muito consumidos: 83% e 87% (AL-PERFIL-80) e, no conjunto,
  // 118 000 € executados de 146 000 € — sobram 19% (AL-VALOR-DISPONIVEL).
  await comExecucao(jQuaseEsgotado, 'Consultor Funcional Sénior', 2000, 5000, 1660, isoMeses(-1));
  await comExecucao(jQuaseEsgotado, 'Programador Sénior', 800, 5000, 700, isoMeses(-1));

  // ── K · Fim de ciclo: término a menos de 3 meses ──────────────────────────
  const kTermino3 = base({
    id: ids.novo('ctr'), numero: 'C-2026-FC1',
    objeto: 'Contrato a terminar — preparar continuidade do serviço',
    dataInicioVigencia: isoMeses(-20), dataTerminoContratual: isoMeses(2), dataTerminoOriginal: isoMeses(2),
    vistoTribunalContasNecessario: true, dataVistoTribunalContas: isoMeses(-19),
  });
  await repos.contratos.guardar(kTermino3);
  await comExecucao(kTermino3, 'Gestor de Projeto', 800, 6000, 700, isoMeses(-1));

  // ── L · Fim de ciclo: término a menos de 6 meses ──────────────────────────
  const lTermino6 = base({
    id: ids.novo('ctr'), numero: 'C-2026-FC2',
    objeto: 'Contrato a caminho do termo — planear a transição',
    dataInicioVigencia: isoMeses(-18), dataTerminoContratual: isoMeses(5), dataTerminoOriginal: isoMeses(5),
  });
  await repos.contratos.guardar(lTermino6);
  await comExecucao(lTermino6, 'Técnico de Testes', 900, 3800, 400, isoMeses(-1));

  // ── M · Vigência acima dos 36 meses ───────────────────────────────────────
  const mVigencia = base({
    id: ids.novo('ctr'), numero: 'C-2026-VG1',
    objeto: 'Contrato com vigência acima do limite legal de 36 meses',
    dataInicioVigencia: isoMeses(-30), dataTerminoContratual: isoMeses(12), dataTerminoOriginal: isoMeses(12),
  });
  await repos.contratos.guardar(mVigencia);
  await comExecucao(mVigencia, 'Arquiteto de Software', 1500, 8200, 300, isoMeses(-1));

  // ── N · Suspensão em aberto que empurra a vigência além dos 36 meses ──────
  const nSuspensao = base({
    id: ids.novo('ctr'), numero: 'C-2026-SU1', estado: 'SUSPENSO',
    objeto: 'Contrato com suspensão em aberto há vários meses',
    dataInicioVigencia: isoMeses(-24), dataTerminoContratual: isoMeses(11), dataTerminoOriginal: isoMeses(11),
  });
  await repos.contratos.guardar(nSuspensao);
  await repos.alteracoes.guardar({
    id: ids.novo('alt'), contratoId: nSuspensao.id, tipo: 'SUSPENSAO', dataEfeito: isoMeses(-8),
    descricao: 'Suspensão da execução', fundamentacao: 'Aguarda decisão de arquitetura do cliente.',
    suspensao: { dataInicio: isoMeses(-8), suspendePrazoExecucao: true }, // sem data de fim
    ...carimbo,
  });
  await comExecucao(nSuspensao, 'Analista Funcional', 700, 4200, 150, isoMeses(-10));

  // ── O · Execução registada fora da vigência (achado de auditoria) ─────────
  const oForaVigencia = base({
    id: ids.novo('ctr'), numero: 'C-2026-AU1',
    objeto: 'Contrato com registos de tempo fora do período de vigência',
    dataInicioVigencia: isoMeses(-5), dataTerminoContratual: isoMeses(15), dataTerminoOriginal: isoMeses(15),
  });
  await repos.contratos.guardar(oForaVigencia);
  await comExecucao(oForaVigencia, 'Programador Júnior', 1000, 3000, 200, isoMeses(-2));
  const perfilFora = (await repos.perfis.todos((p) => p.contratoId === oForaVigencia.id))[0];
  const afFora = (await repos.afetacoes.todos((a) => a.contratoId === oForaVigencia.id))[0];
  if (perfilFora !== undefined && afFora !== undefined) {
    await repos.registosTempo.guardar({
      id: ids.novo('rt'), afetacaoId: afFora.id, contratoId: oForaVigencia.id, perfilId: perfilFora.id, recursoId: 'oid-recurso-02',
      projetoId: 'azure-devops', workItemId: 4100, data: isoMeses(-9), // ANTES do início de vigência
      duracao: 480, descricaoAtividade: 'Trabalho anterior ao início de vigência',
      tipoDotacaoConsumida: 'HORAS_BASE', valorHoraAplicado: 3000, valorImputado: 24000,
      estado: 'APROVADO', aprovadoPor: 'oid-gestor-contrato', aprovadoEm: agora,
      criadoEm: agora, criadoPor: 'oid-recurso-02', atualizadoEm: agora, atualizadoPor: 'oid-recurso-02',
    });
  }

  // ── P · Em vigor sem visto do TdC assegurado (risco grave) ────────────────
  const pSemVisto = base({
    id: ids.novo('ctr'), numero: 'C-2026-TC1',
    objeto: 'Contrato em execução com visto do Tribunal de Contas por obter',
    precoContratualInicial: 900_000_00, precoContratualAtual: 900_000_00,
    dataInicioVigencia: isoMeses(-3), dataTerminoContratual: isoMeses(21), dataTerminoOriginal: isoMeses(21),
    vistoTribunalContasNecessario: true, dataRemessaTribunalContas: isoMeses(-4),
  });
  await repos.contratos.guardar(pSemVisto);
  await comExecucao(pSemVisto, 'Consultor Funcional', 3000, 4000, 200, isoMeses(-1));

  // ── Q · LICENCIAMENTO com a licença a expirar ─────────────────────────────
  // Uma licença anual a três meses do fim: o procedimento de renovação demora
  // mais do que isso, pelo que o prazo já vai apertado (AL-LICENCA-A-EXPIRAR).
  const qLicenca = base({
    id: ids.novo('ctr'), numero: 'C-2026-LIC1', tipologia: 'LICENCIAMENTO',
    objeto: 'Licenciamento anual de software de gestão documental',
    precoContratualInicial: 48_000_00, precoContratualAtual: 48_000_00,
    dataInicioVigencia: isoMeses(-9), dataTerminoContratual: isoMeses(15), dataTerminoOriginal: isoMeses(15),
    vigenciaLicenciamento: { de: isoMeses(-9), ate: isoMeses(3) },
  });
  await repos.contratos.guardar(qLicenca);
  const cmpQ: Compromisso = { id: ids.novo('cmp'), contratoId: qLicenca.id, numero: 'CMP-2026-9', montante: 48_000_00, ano: anoAtual, emitidoEm: isoMeses(-9), ...audit };
  await repos.compromissos.guardar(cmpQ);
  // Já faturada pela totalidade: é assim que um licenciamento se fatura (RN-611).
  await repos.faturas.guardar({
    id: ids.novo('fat'), contratoId: qLicenca.id, compromissoId: cmpQ.id, numero: 'FT-2026/0910',
    documentos: [{ tipo: 'FATURA' as const, ficheiroRef: 'arq://lic1', nomeOriginal: 'fatura-licenca.pdf', hashSha256: 'd'.repeat(64), tamanhoBytes: 1024, recebidoEm: agora, carregadoPor: 'oid-gestor-contrato' }],
    linhas: [], dataEmissao: isoMeses(-9), dataRececao: isoMeses(-9),
    periodoDe: isoMeses(-9), periodoAte: isoMeses(3),
    montanteSemIva: 48_000_00, montanteIva: 11_040_00,
    dataAprovacao: isoMeses(-8), montanteAprovado: 48_000_00,
    estado: 'VALIDADA', tipo: 'LICENCIAMENTO', ...audit,
  });

  // ── R · LICENCIAMENTO por faturar, para exercitar o fluxo de faturação ─────
  const rLicenca = base({
    id: ids.novo('ctr'), numero: 'C-2026-LIC2', tipologia: 'LICENCIAMENTO',
    objeto: 'Licenciamento trienal de plataforma de assinatura digital',
    precoContratualInicial: 90_000_00, precoContratualAtual: 90_000_00,
    dataInicioVigencia: isoMeses(-1), dataTerminoContratual: isoMeses(35), dataTerminoOriginal: isoMeses(35),
    vigenciaLicenciamento: { de: isoMeses(-1), ate: isoMeses(35) },
  });
  await repos.contratos.guardar(rLicenca);
  await repos.compromissos.guardar({ id: ids.novo('cmp'), contratoId: rLicenca.id, numero: 'CMP-2026-10', montante: 90_000_00, ano: anoAtual, emitidoEm: isoMeses(-1), ...audit });
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
