import type { Contexto } from '../../contexto.js';
import { Oficina } from './blocos.js';

/**
 * CENÁRIO — CAPACIDADES DO ASSISTENTE.
 *
 * Quatro contratos, cada um a servir uma pergunta que a aplicação não sabia
 * responder antes do assistente existir:
 *
 *  1. Dois contratos de outsourcing com o mesmo tipo de objeto — para que
 *     «o contrato de outsourcing» seja ambíguo e o assistente tenha de
 *     perguntar de volta em vez de adivinhar.
 *  2. Folga a 40 €/h em mais do que um contrato, com consumos diferentes —
 *     para a lista valer a pena e o «acrescenta os consumos» mostrar algo.
 *  3. Um contrato a terminar com valor por executar — para «que contratos
 *     estão em risco» e «terminam este ano» terem resposta.
 *  4. Duas pessoas afetas ao mesmo contrato — para a substituição ser
 *     simulável, com regras a avaliar de verdade.
 *
 * Menos do que isto e metade das perguntas responde «não encontrei nada», o
 * que não demonstra nada. Mais e volta o ruído que se queria evitar.
 */
export async function cenarioAssistente(ctx: Contexto): Promise<void> {
  const o = new Oficina(ctx);
  await o.recursos();
  await o.procedimento();

  const modernizacao = await o.projeto('proj-P1', 'Modernização documental');
  const assinatura = await o.projeto('proj-P2', 'Assinatura digital e identidade');

  // ── 1 · Outsourcing com equipa — o contrato dos atos de gestão ────────────
  const equipa = await o.contrato({
    numero: 'C-2026-001', objeto: 'Prestação de serviços em outsourcing — desenvolvimento aplicacional',
    precoContratualInicial: 200_000_00, precoContratualAtual: 200_000_00,
  });
  await o.associar(equipa.id, modernizacao);
  await o.associar(equipa.id, assinatura);

  const arquiteto = await o.perfil(equipa, 'Arquiteto de Software Sénior', 1600, 65);
  const junior = await o.perfil(equipa, 'Programador Júnior', 2000, 32);
  const afArquiteto = await o.afetar(equipa, arquiteto, 'oid-recurso-01', [modernizacao, assinatura]);
  const afJunior = await o.afetar(equipa, junior, 'oid-recurso-02', [modernizacao]);
  await o.execucao(afArquiteto, arquiteto, 24);
  await o.execucao(afJunior, junior, 30);
  // Alguma coisa por aprovar, para «que registos estão por aprovar?» responder.
  await o.execucao(afJunior, junior, 4, 'SUBMETIDO', modernizacao);

  // ── 2 · Outsourcing homónimo — força a desambiguação ──────────────────────
  const homonimo = await o.contrato({
    numero: 'C-2026-002', objeto: 'Prestação de serviços em outsourcing — sustentação e suporte',
    prestador: { nome: 'Prestador Beta, S.A.', nipc: '500000002' },
    precoContratualInicial: 120_000_00, precoContratualAtual: 120_000_00,
  });
  await o.associar(homonimo.id, assinatura);
  const consultor = await o.perfil(homonimo, 'Consultor Funcional', 1400, 40);
  const afConsultor = await o.afetar(homonimo, consultor, 'oid-recurso-09', [assinatura]);
  await o.execucao(afConsultor, consultor, 12);

  // ── 3 · A terminar, com muito por executar — alimenta risco e folga ───────
  const aTerminar = await o.contrato({
    numero: 'C-2026-FC1', objeto: 'Bolsa de horas a terminar — preparar continuidade do serviço',
    precoContratualInicial: 150_000_00, precoContratualAtual: 150_000_00,
    dataInicioVigencia: o.meses(-10), dataTerminoContratual: o.meses(4), dataTerminoOriginal: o.meses(4),
  });
  await o.associar(aTerminar.id, modernizacao);
  const analista = await o.perfil(aTerminar, 'Analista de Sistemas', 1800, 40);
  const afAnalista = await o.afetar(aTerminar, analista, 'oid-recurso-02', [modernizacao]);
  await o.execucao(afAnalista, analista, 10);

  // ── 4 · Sem ninguém afeto — «que perfis estão por preencher» ──────────────
  const porArrancar = await o.contrato({
    numero: 'C-2026-BH2', objeto: 'Bolsa de horas para evolução de plataforma digital',
    precoContratualInicial: 90_000_00, precoContratualAtual: 90_000_00,
    dataInicioVigencia: o.meses(-1), dataTerminoContratual: o.meses(14), dataTerminoOriginal: o.meses(14),
  });
  await o.associar(porArrancar.id, assinatura);
  await o.perfil(porArrancar, 'Arquiteto de Software Sénior', 800, 65);
  await o.perfil(porArrancar, 'Especialista de Testes', 900, 38);
}
