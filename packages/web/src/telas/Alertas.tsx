import { Fragment, useState, type ReactNode } from 'react';
import { JobAlertas } from '@chora/api/nucleo';
import type { Alerta, Contrato, PerfilContratual, RegistoTempo } from '@chora/domain';
import { app } from '../porta/aplicacao-local.js';
import { Cabecalho } from '../app/Shell.js';
import { Severidade, formatarHoras, formatarMoeda, useAsync } from '../comum.js';
import { perfisIdenticosDisponiveis, SALVAGUARDA_JURIDICA, type PerfilAlternativo } from '../sugestoes.js';
import { calcularProjecao, gerarMapaProjecaoXlsx } from '../projecoes.js';

interface Contexto { contratos: Contrato[]; perfis: PerfilContratual[]; aprovados: RegistoTempo[] }
interface Sugestao { texto: string; alternativa?: PerfilAlternativo; nivel2?: string }

const ROT_VIAB: Record<string, string> = { VIAVEL: 'Viável', CONDICIONADA: 'Condicionada', INVIÁVEL: 'Inviável', INVIAVEL: 'Inviável' };

/**
 * Janela de decisão: mostra a data-limite para agir e quanto falta. Se o prazo
 * já passou, sinaliza-o — é o sinal mais forte que o alerta pode dar.
 */
function Janela({ alerta }: { alerta: Alerta }): ReactNode {
  if (alerta.dataLimiteAcao === undefined) return <span className="sec">—</span>;
  const dias = alerta.diasParaLimite ?? 0;
  const cor = dias < 0 ? 'p-verm' : dias <= 15 ? 'p-verm' : dias <= 45 ? 'p-ambar' : 'p-azul';
  return (
    <span title={alerta.eventoAncora}>
      <span className={`pill ${cor}`}>{alerta.dataLimiteAcao}</span>
      <div className="sec">{dias < 0 ? `há ${-dias} dias` : `faltam ${dias} dias`}</div>
    </span>
  );
}

/** Ordena por urgência: prazo mais apertado primeiro, depois severidade. */
function ordenarPorUrgencia(alertas: Alerta[]): Alerta[] {
  const peso: Record<string, number> = { CRITICO: 0, AVISO: 1, INFO: 2 };
  return [...alertas].sort((a, b) => {
    const da = a.diasParaLimite ?? Number.MAX_SAFE_INTEGER;
    const db = b.diasParaLimite ?? Number.MAX_SAFE_INTEGER;
    if (da !== db) return da - db;
    return (peso[a.severidade] ?? 3) - (peso[b.severidade] ?? 3);
  });
}

export function Alertas(): ReactNode {
  const podeGerir = app.papeisAtuais().some((p) => p === 'GESTOR_CONTRATO' || p === 'GESTOR_TECNICO');
  const base = useAsync(async () => {
    const alertas = await app.ctx.repos.alertas.todos();
    const contratos = await app.ctx.repos.contratos.todos();
    const perfis = await app.ctx.repos.perfis.todos();
    const aprovados = await app.ctx.repos.registosTempo.todos((r) => r.estado === 'APROVADO');
    return { alertas, ctx: { contratos, perfis, aprovados } as Contexto };
  }, []);
  const [aberto, setAberto] = useState<string>();
  const [sugestao, setSugestao] = useState<Record<string, Sugestao>>({});
  const [guardadas, setGuardadas] = useState<Record<string, boolean>>({});

  async function executar(): Promise<void> {
    await new JobAlertas(app.ctx).executar();
    base.recarregar();
  }

  async function guardarRecomendacao(al: Alerta, s: Sugestao): Promise<void> {
    // A recomendação persiste a análise completa: sugestão, projeção e a escada
    // de opções com viabilidade e fundamento, para ficar auditável.
    const escada = (al.opcoes ?? [])
      .map((o) => `${o.ordem}. [${ROT_VIAB[o.viabilidade] ?? o.viabilidade}] ${o.titulo} — ${o.detalhe}${o.fundamento !== undefined ? ` (${o.fundamento})` : ''}`)
      .join('\n');
    const prazo = al.dataLimiteAcao !== undefined ? `Agir até ${al.dataLimiteAcao} (${al.eventoAncora ?? 'janela de decisão'}).` : '';
    await app.recomendacoes.criar({
      contratoId: al.contratoId, origem: 'ALERTA', codigo: al.codigo,
      titulo: al.titulo,
      texto: [s.texto + (s.nivel2 !== undefined ? ` — ${s.nivel2}` : ''), prazo, escada].filter((x) => x !== '').join('\n\n'),
      fundamentacao: al.detalhe, referenciaLegal: undefined, confianca: al.severidade === 'CRITICO' ? 0.9 : 0.75,
    }, app.utilizador());
    setGuardadas((g) => ({ ...g, [al.id]: true }));
  }

  function sugerir(a: Alerta): void {
    setAberto(aberto === a.id ? undefined : a.id);
    if (sugestao[a.id] === undefined && base.dados !== undefined) {
      setSugestao((s) => ({ ...s, [a.id]: sugestaoIA(a, base.dados!.ctx) }));
    }
  }

  return (
    <>
      <Cabecalho titulo="Alertas" sub="Preocupações de execução do contrato, com janela de decisão e opções de atuação (secção 11)" acoes={podeGerir ? <button className="btn" onClick={() => void executar()}>Executar job de alertas</button> : undefined} />
      <div className="cartao"><table>
        <thead><tr><th>Severidade</th><th>Código</th><th>Título</th><th>Detalhe</th><th>Agir até</th><th className="num">Impacto</th><th></th></tr></thead>
        <tbody>{ordenarPorUrgencia(base.dados?.alertas ?? []).map((a) => { const s = sugestao[a.id]; return (
          <Fragment key={a.id}>
            <tr>
              <td><Severidade v={a.severidade} /></td>
              <td><code>{a.codigo}</code></td>
              <td className="prim">{a.titulo}</td>
              <td>{a.detalhe}</td>
              <td className="tabnum" style={{ whiteSpace: 'nowrap' }}><Janela alerta={a} /></td>
              <td className="num" style={{ whiteSpace: 'nowrap' }}>{a.impactoValor !== undefined ? formatarMoeda(a.impactoValor) : a.impactoMinutos !== undefined ? formatarHoras(a.impactoMinutos) : '—'}</td>
              <td style={{ whiteSpace: 'nowrap' }}><button className="btn sm" onClick={() => sugerir(a)}>{(a.opcoes?.length ?? 0) > 0 ? `Opções (${a.opcoes!.length})` : '✨ Sugestão (IA)'}</button></td>
            </tr>
            {aberto === a.id && (
              <tr>
                <td colSpan={7}>
                  <div className="aviso" style={{ margin: 0 }}>
                    {(a.opcoes?.length ?? 0) > 0 && (
                      <div style={{ marginBottom: 10 }}>
                        <b>Opções de atuação</b> <span className="sec">(por atrito jurídico crescente)</span>
                        <ol style={{ margin: '6px 0 0', paddingLeft: 20 }}>
                          {a.opcoes!.map((o) => (
                            <li key={o.ordem} style={{ marginBottom: 6 }}>
                              <span className={`pill ${o.viabilidade === 'VIAVEL' ? 'p-verde' : o.viabilidade === 'CONDICIONADA' ? 'p-ambar' : 'p-verm'}`}>{ROT_VIAB[o.viabilidade]}</span>{' '}
                              <b>{o.titulo}</b>
                              <div>{o.detalhe}</div>
                              {o.fundamento !== undefined && <div className="sec">{o.fundamento}</div>}
                              {o.impactoValor !== undefined && <div className="sec">Impacto: {formatarMoeda(o.impactoValor)}</div>}
                            </li>
                          ))}
                        </ol>
                      </div>
                    )}
                    <b>Sugestão (IA · protótipo):</b> {s?.texto ?? 'A analisar…'}
                    {s?.nivel2 !== undefined && (
                      <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px dashed var(--linha)' }}>
                        <b>2.º nível — projeção:</b> {s.nivel2}
                        {s.alternativa !== undefined && (
                          <div style={{ marginTop: 8 }}>
                            <button className="btn sm" onClick={() => gerarMapaProjecaoXlsx({ contratoNumero: s.alternativa!.contratoNumero, perfilNome: s.alternativa!.perfilNome, horasDisponiveis: s.alternativa!.horasDisponiveis, valorDisponivel: s.alternativa!.valorDisponivel })}>⬇ Gerar mapa de projeção (Excel)</button>
                          </div>
                        )}
                      </div>
                    )}
                    <div className="sec" style={{ marginTop: 8 }}>{SALVAGUARDA_JURIDICA}</div>
                    {podeGerir && s !== undefined && (
                      <div style={{ marginTop: 8 }}>
                        {guardadas[a.id] ? <span className="pill p-verde">Guardada em Recomendações</span> : <button className="btn sm" onClick={() => void guardarRecomendacao(a, s)}>Guardar como recomendação</button>}
                      </div>
                    )}
                  </div>
                </td>
              </tr>
            )}
          </Fragment>
        ); })}
        {base.dados?.alertas.length === 0 && <tr><td colSpan={7} className="vazio">Sem alertas.</td></tr>}</tbody>
      </table></div>
    </>
  );
}

/** Descrição textual do 2.º nível (projeção) para uma alternativa. */
function textoProjecao(alt: PerfilAlternativo): string {
  const linhas = calcularProjecao({ contratoNumero: alt.contratoNumero, perfilNome: alt.perfilNome, horasDisponiveis: alt.horasDisponiveis, valorDisponivel: alt.valorDisponivel });
  const meses = linhas.length;
  return `com 1 pessoa a tempo inteiro (160 h/mês), o saldo do perfil «${alt.perfilNome}» no contrato ${alt.contratoNumero} (${formatarHoras(alt.horasDisponiveis * 60)} · ${formatarMoeda(alt.valorDisponivel)}) dá para cerca de ${meses} ${meses === 1 ? 'mês' : 'meses'} de execução. Descarregue o mapa de projeção mensal (Excel) para partilhar/decidir.`;
}

/**
 * Recurso a IA (stub determinístico, secção 14). Devolve uma sugestão de ação a
 * partir do código do alerta. Para o esgotamento de um perfil, verifica perfis
 * idênticos disponíveis noutros contratos e, quando existem, acrescenta um
 * segundo nível com projeção e exportação para Excel.
 */
function sugestaoIA(a: Alerta, ctx: Contexto): Sugestao {
  // Alertas com escada de opções já trazem a análise no próprio alerta; a
  // sugestão limita-se a remeter para as opções e para o prazo.
  if ((a.opcoes?.length ?? 0) > 0) {
    const viaveis = a.opcoes!.filter((o) => o.viabilidade === 'VIAVEL');
    return {
      texto: viaveis.length > 0
        ? `Há ${viaveis.length} caminho(s) sem atrito jurídico: comece por «${viaveis[0]!.titulo}». As restantes opções exigem autorização ou modificação contratual.`
        : 'Não há caminhos diretos: todas as opções exigem autorização, modificação contratual ou novo procedimento. Atue dentro da janela de decisão indicada.',
    };
  }
  if (a.codigo === 'AL-PERFIL-80' || a.codigo === 'AL-PERFIL-90') {
    const alt = perfisIdenticosDisponiveis(a.contratoId, ctx.contratos, ctx.perfis, ctx.aprovados).flatMap((r) => r.alternativas)[0];
    if (alt !== undefined) {
      return { texto: `O perfil está a esgotar-se. Existe um perfil idêntico disponível no contrato ${alt.contratoNumero} (${formatarHoras(alt.horasDisponiveis * 60)} · ${formatarMoeda(alt.valorDisponivel)} disponíveis) — pondere mobilizar aí a execução.`, alternativa: alt, nivel2: textoProjecao(alt) };
    }
    return { texto: 'O perfil aproxima-se do esgotamento e não há perfil idêntico com disponibilidade noutro contrato. Reequilibre afetações, reveja o planeamento de horas ou pondere reforço/trabalhos complementares dentro do contrato.' };
  }
  if (a.codigo === 'AL-VALOR-DISPONIVEL') {
    const alt = perfisIdenticosDisponiveis(a.contratoId, ctx.contratos, ctx.perfis, ctx.aprovados).flatMap((r) => r.alternativas)[0];
    if (alt !== undefined) {
      return { texto: `O valor disponível está reduzido. Existe um perfil idêntico com saldo no contrato ${alt.contratoNumero} (${formatarMoeda(alt.valorDisponivel)} disponíveis); em alternativa, pondere trabalhos complementares (limite de 50%, RN-301).`, alternativa: alt, nivel2: textoProjecao(alt) };
    }
    return { texto: 'Pondere solicitar trabalhos complementares (dentro do limite de 50% do valor inicial, RN-301), fundamentando a necessidade, antes que o saldo se esgote.' };
  }
  const MAPA: Record<string, string> = {
    'AL-TERMINO-3M': 'Prepare a caducidade ou uma eventual prorrogação/novo procedimento em tempo útil; confirme entregáveis pendentes.',
    'AL-TERMINO-6M': 'Planeie a transição: confirme o saldo de horas e o calendário de execução até ao término.',
    'AL-VIGENCIA-36M': 'Reveja o prazo de vigência e fundamente a exceção ao limite (RN-202) se aplicável.',
    'AL-SUSPENSAO-VIGENCIA': 'As suspensões deslocam a execução e projetam a vigência para além dos 36 meses; registe a exceção fundamentada (RN-204).',
    'AL-PORTARIA-REPROGRAMAR': 'A vigência ultrapassa o último ano coberto pela portaria de extensão de encargos; promova a reprogramação da portaria para manter a execução plurianual.',
    'AL-PORTARIA-LIMITA-VIGENCIA': 'A portaria está a travar a vigência abaixo do máximo legal: reprogramá-la permite levar o contrato até ao limite dos 36 meses, aproveitando o valor contratado.',
    'AL-PORTARIA-ANO-INSUFICIENTE': 'A dotação do ano esgota-se antes do fim do ano; reprograme a repartição anual ou contenha a execução até 31/12.',
    'AL-EXECUCAO-EXCEDE-ANO': 'A execução projetada excede a dotação repartida para o ano: sem reprogramação da portaria haverá execução sem cobertura orçamental.',
    'AL-FIM-ANO-ECONOMICO': 'Instrua o pedido de transição do saldo para o ano seguinte antes do fecho do ano económico (sem portaria, até 50% do valor contratualizado), fundamentando.',
    'AL-FOLGA-SEM-TEMPO': 'Vai sobrar valor por executar no término: reforce o ritmo de execução, prorrogue a vigência com nova data ou transite o saldo — decida dentro da janela indicada.',
    'AL-CAPACIDADE-INSUFICIENTE': 'As horas contratadas não chegam ao término: pondere trabalhos complementares dentro do teto de 50% (RN-301) ou reduza o ritmo de afetação.',
    'AL-NOVO-PROCEDIMENTO': 'Inicie a preparação do novo procedimento: a data-limite já considera a duração do concurso e, se aplicável, o visto prévio do Tribunal de Contas.',
    'AL-SUSPENSAO-ABERTA': 'Delimite o período de suspensão ou levante-a: uma suspensão sem termo é achado frequente em auditoria.',
    'AL-EXECUCAO-FORA-VIGENCIA': 'Há execução registada fora da vigência ou em período suspenso: reveja os registos e corrija, pois não há cobertura contratual para esse tempo.',
    'AL-COMPLEMENTARES-40': 'Acompanhe o acumulado de trabalhos complementares face ao limite legal de 50% (RN-301).',
    'AL-COMPLEMENTARES-45': 'Está próximo do limite de 50% de trabalhos complementares; evite novos acréscimos sem análise.',
    'AL-VISTO-PENDENTE': 'Confirme a submissão ao Tribunal de Contas; não deve haver execução relevante sem visto (salvo visto tácito).',
    'AL-FATURA-PRAZO': 'Priorize a conferência e o pagamento da fatura para cumprir o prazo.',
  };
  return { texto: MAPA[a.codigo] ?? 'Reveja a situação do contrato e atue conforme o enquadramento aplicável do CCP.' };
}
