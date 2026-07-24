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
    await app.recomendacoes.criar({
      contratoId: al.contratoId, origem: 'ALERTA', codigo: al.codigo,
      titulo: al.titulo, texto: s.texto + (s.nivel2 !== undefined ? ` — ${s.nivel2}` : ''),
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
      <Cabecalho titulo="Alertas" sub="Preocupações de execução do contrato (secção 11)" acoes={podeGerir ? <button className="btn" onClick={() => void executar()}>Executar job de alertas</button> : undefined} />
      <div className="cartao"><table>
        <thead><tr><th>Severidade</th><th>Código</th><th>Título</th><th>Detalhe</th><th></th></tr></thead>
        <tbody>{(base.dados?.alertas ?? []).map((a) => { const s = sugestao[a.id]; return (
          <Fragment key={a.id}>
            <tr>
              <td><Severidade v={a.severidade} /></td>
              <td><code>{a.codigo}</code></td>
              <td className="prim">{a.titulo}</td>
              <td>{a.detalhe}</td>
              <td style={{ whiteSpace: 'nowrap' }}><button className="btn sm" onClick={() => sugerir(a)}>✨ Sugestão (IA)</button></td>
            </tr>
            {aberto === a.id && (
              <tr>
                <td colSpan={5}>
                  <div className="aviso" style={{ margin: 0 }}>
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
        {base.dados?.alertas.length === 0 && <tr><td colSpan={5} className="vazio">Sem alertas.</td></tr>}</tbody>
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
    'AL-COMPLEMENTARES-40': 'Acompanhe o acumulado de trabalhos complementares face ao limite legal de 50% (RN-301).',
    'AL-COMPLEMENTARES-45': 'Está próximo do limite de 50% de trabalhos complementares; evite novos acréscimos sem análise.',
    'AL-VISTO-PENDENTE': 'Confirme a submissão ao Tribunal de Contas; não deve haver execução relevante sem visto (salvo visto tácito).',
    'AL-FATURA-PRAZO': 'Priorize a conferência e o pagamento da fatura para cumprir o prazo.',
  };
  return { texto: MAPA[a.codigo] ?? 'Reveja a situação do contrato e atue conforme o enquadramento aplicável do CCP.' };
}
