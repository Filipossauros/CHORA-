import type { Contexto } from '../../contexto.js';
import { Oficina } from './blocos.js';

/**
 * CENÁRIO — DECISÕES DO «HOJE».
 *
 * Uma FAMÍLIA de decisão por contrato, não um alerta por contrato. O catálogo tem 23
 * alertas em 5 famílias e o seed de cobertura dispara-os quase todos ao mesmo
 * tempo: a fila fica longa e deixa de se perceber que está ordenada por
 * urgência, que é justamente o que ela tem para mostrar.
 *
 * Aqui os prazos-limite estão afastados de propósito, para a ordenação ser
 * visível a olho e cada cartão apontar a um ato diferente.
 */
export async function cenarioHoje(ctx: Contexto): Promise<void> {
  const o = new Oficina(ctx);
  await o.recursos();
  await o.procedimento();
  const sustentacao = await o.projeto('proj-P3', 'Sustentação aplicacional');

  // ── FIM DE CICLO · o mais urgente: o prazo do procedimento seguinte ───────
  // Termina daqui a 2 meses e sobra dinheiro: instruir novo procedimento já
  // está em cima da hora, e é o cartão que deve encabeçar a fila.
  const fimDeCiclo = await o.contrato({
    numero: 'C-2026-FC1', objeto: 'Contrato a terminar — serviço fica descoberto se nada for feito',
    precoContratualInicial: 150_000_00, precoContratualAtual: 150_000_00,
    dataInicioVigencia: o.meses(-16), dataTerminoContratual: o.meses(2), dataTerminoOriginal: o.meses(2),
  });
  await o.associar(fimDeCiclo.id, sustentacao);
  const p1 = await o.perfil(fimDeCiclo, 'Consultor Funcional', 1800, 40);
  await o.execucao(await o.afetar(fimDeCiclo, p1, 'oid-recurso-01', [sustentacao]), p1, 20);

  // ── CAPACIDADE · folga financeira sem tempo para a executar ───────────────
  // Muito por executar e poucas pessoas: ao ritmo atual não se consome o valor
  // até ao término. É a decisão de reforçar equipa ou reduzir âmbito.
  const folgaSemTempo = await o.contrato({
    numero: 'C-2026-CAP1', objeto: 'Bolsa de horas com folga que o ritmo atual não consome',
    precoContratualInicial: 300_000_00, precoContratualAtual: 300_000_00,
    dataInicioVigencia: o.meses(-8), dataTerminoContratual: o.meses(6), dataTerminoOriginal: o.meses(6),
  });
  await o.associar(folgaSemTempo.id, sustentacao);
  const p2 = await o.perfil(folgaSemTempo, 'Programador Full-stack', 2400, 45);
  await o.execucao(await o.afetar(folgaSemTempo, p2, 'oid-recurso-02', [sustentacao]), p2, 6);

  // ── COBERTURA ORÇAMENTAL · portaria trava a vigência ──────────────────────
  // A portaria só cobre o ano corrente e o contrato termina a 31/12;
  // reprogramá-la libertaria vigência até ao limite legal dos 36 meses.
  const anoAtual = Number(o.hoje.slice(0, 4));
  const portaria = await o.contrato({
    numero: 'C-2026-PT1', objeto: 'Bolsa de horas travada pela portaria de extensão de encargos',
    precoContratualInicial: 120_000_00, precoContratualAtual: 120_000_00,
    dataInicioVigencia: o.meses(-4), dataTerminoContratual: `${anoAtual}-12-31`, dataTerminoOriginal: `${anoAtual}-12-31`,
    // Sem a portaria no contrato não há decisão de cobertura orçamental — é ela
    // que só reparte encargo para o ano corrente e trava a vigência.
    portariaExtensaoEncargos: {
      numero: `P-${anoAtual}/101`, data: `${anoAtual - 1}-12-20`,
      reparticaoAnual: [{ ano: anoAtual, montante: 120_000_00 }],
    },
  });
  await o.associar(portaria.id, sustentacao);
  const p3 = await o.perfil(portaria, 'Analista de Sistemas', 1200, 42);
  await o.execucao(await o.afetar(portaria, p3, 'oid-recurso-09', [sustentacao]), p3, 14);

  // ── HIGIENE DE EXECUÇÃO · registos fora da vigência ───────────────────────
  // Achado de auditoria: há execução registada depois do término. Não é uma
  // projeção — é um facto já consumado, e a decisão é o que fazer com ele.
  const higiene = await o.contrato({
    numero: 'C-2026-EX1', objeto: 'Contrato com execução registada fora da vigência',
    precoContratualInicial: 80_000_00, precoContratualAtual: 80_000_00,
    dataInicioVigencia: o.meses(-14), dataTerminoContratual: o.meses(-1), dataTerminoOriginal: o.meses(-1),
  });
  await o.associar(higiene.id, sustentacao);
  const p4 = await o.perfil(higiene, 'Técnico de Testes', 900, 35);
  const af4 = await o.afetar(higiene, p4, 'oid-recurso-01', [sustentacao]);
  await o.execucao(af4, p4, 8);
  // Os últimos registos caem depois do término — é o que a regra apanha.
  await ctx.repos.registosTempo.guardar({
    id: `${af4.id}-fora`, afetacaoId: af4.id, contratoId: higiene.id, perfilId: p4.id,
    recursoId: af4.recursoId, projetoId: sustentacao, workItemId: 9001, data: o.dias(-5),
    duracao: 480, descricaoAtividade: 'Execução registada após o término', tipoDotacaoConsumida: 'HORAS_BASE',
    valorHoraAplicado: 3500, valorImputado: 28000, estado: 'APROVADO',
    aprovadoPor: 'oid-gestor-contrato', aprovadoEm: o.agora,
    criadoEm: o.agora, criadoPor: af4.recursoId, atualizadoEm: o.agora, atualizadoPor: af4.recursoId,
  });

  // ── FATURAÇÃO · nota de crédito por emitir ────────────────────────────────
  // A fatura ficou em aberto à espera da nota: fatura e nota decidem-se em
  // conjunto (RN-612), e o tempo de espera é o que aciona a decisão.
  const compromisso = await o.compromisso(fimDeCiclo, 150_000_00);
  await o.fatura(fimDeCiclo, {
    numero: 'FT-2026-114', compromissoId: compromisso.id, montanteSemIva: 50_000_00,
    estado: 'AGUARDA_NOTA_CREDITO', dataRececao: o.meses(-2), dataEmissao: o.meses(-2),
    notaCredito: { numero: 'por emitir', montante: 10_000_00, motivo: 'Faturadas 25 h acima das horas aprovadas no período.', registadaEm: o.meses(-2) },
  });
}
