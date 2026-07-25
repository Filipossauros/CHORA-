import { Fragment, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { JobAlertas, ServicoAlertas } from '@chora/api/nucleo';
import { saudeContrato, type Alerta, type Contrato, type OpcaoAlerta, type SeveridadeAlerta } from '@chora/domain';
import { app } from '../porta/aplicacao-local.js';
import { Cabecalho } from '../app/Shell.js';
import { Severidade, eurosParaCent, formatarHoras, formatarMoeda, hoje, mensagemErro, notificarMudanca, useAsync } from '../comum.js';
import { Perguntar } from '../componentes/Perguntar.js';
import { gerarMapaProjecaoXlsx } from '../projecoes.js';

const ROT_VIAB: Record<string, string> = { VIAVEL: 'Viável', CONDICIONADA: 'Condicionada', INVIAVEL: 'Inviável' };

/** Grupo temporal em que a decisão cai, pela sua janela. */
type Grupo = 'Prazo esgotado' | 'Próximos 30 dias' | 'Mais tarde' | 'Sem prazo definido';
function grupoDe(a: Alerta): Grupo {
  const d = a.diasParaLimite;
  if (d === undefined) return 'Sem prazo definido';
  if (d < 0) return 'Prazo esgotado';
  if (d <= 30) return 'Próximos 30 dias';
  return 'Mais tarde';
}
const ORDEM_GRUPOS: Grupo[] = ['Prazo esgotado', 'Próximos 30 dias', 'Mais tarde', 'Sem prazo definido'];

/**
 * HOJE — a fila única de decisões, e a entrada da aplicação.
 *
 * Colapsa Alertas, Previsões e Recomendações: eram três destinos para a mesma
 * pergunta («com o que me devo preocupar e o que faço?»), separados por quem os
 * produzia. Aqui a previsão é evidência dentro do cartão e a recomendação é o
 * estado do cartão. A ordenação é por PRAZO, não por severidade: o que já
 * venceu vem primeiro.
 */
export function Hoje(): ReactNode {
  const podeGerir = app.papeisAtuais().some((p) => p === 'GESTOR_CONTRATO' || p === 'GESTOR_TECNICO');
  const base = useAsync(async () => {
    const servico = new ServicoAlertas(app.ctx);
    const pendentes = await servico.pendentes();
    const contratos = await app.ctx.repos.contratos.todos();
    const todosAlertas = await app.ctx.repos.alertas.todos();
    return { pendentes, contratos, todosAlertas };
  }, []);
  const [erro, setErro] = useState<string>();
  const [aberta, setAberta] = useState<string>();

  async function reconciliar(): Promise<void> {
    setErro(undefined);
    try { await new JobAlertas(app.ctx).reconciliar(); base.recarregar(); notificarMudanca(); }
    catch (e) { setErro(mensagemErro(e)); }
  }

  const pendentes = base.dados?.pendentes ?? [];
  const contratos = base.dados?.contratos ?? [];
  const vencidas = pendentes.filter((a) => (a.diasParaLimite ?? 1) < 0).length;

  // Agrupa por janela e, dentro dela, por contrato.
  const porGrupo = new Map<Grupo, Map<string, Alerta[]>>();
  for (const a of [...pendentes].sort((x, y) => (x.diasParaLimite ?? 9e9) - (y.diasParaLimite ?? 9e9))) {
    const g = grupoDe(a);
    if (!porGrupo.has(g)) porGrupo.set(g, new Map());
    const porContrato = porGrupo.get(g)!;
    if (!porContrato.has(a.contratoId)) porContrato.set(a.contratoId, []);
    porContrato.get(a.contratoId)!.push(a);
  }

  // Contratos sem decisões pendentes — mostram-se no fim, para dar sossego.
  const comDecisoes = new Set(pendentes.map((a) => a.contratoId));
  const tranquilos = contratos.filter((c) => (c.estado === 'EM_VIGOR' || c.estado === 'SUSPENSO') && !comDecisoes.has(c.id));

  return (
    <>
      <Cabecalho
        titulo="Hoje"
        sub={pendentes.length === 0 ? 'Sem decisões pendentes' : `${pendentes.length} decisõe(s) aberta(s)${vencidas > 0 ? ` · ${vencidas} com prazo esgotado` : ''}`}
        acoes={podeGerir ? <button className="btn" onClick={() => void reconciliar()}>Reavaliar</button> : undefined}
      />
      {erro !== undefined && <div className="erro-cx">⚠ {erro}</div>}

      <Perguntar contratos={contratos} />

      {pendentes.length === 0 && (
        <div className="cartao" style={{ marginTop: 16 }}><div className="vazio">Nada a decidir. A execução de todos os contratos está dentro do previsto.</div></div>
      )}

      {ORDEM_GRUPOS.filter((g) => porGrupo.has(g)).map((g) => (
        <Fragment key={g}>
          <LinhaGrupo rotulo={g} />
          {[...porGrupo.get(g)!.entries()].map(([contratoId, decisoes]) => {
            const contrato = contratos.find((c) => c.id === contratoId);
            if (contrato === undefined) return null;
            return (
              <CartaoContrato
                key={`${g}-${contratoId}`}
                contrato={contrato}
                decisoes={decisoes}
                todosAlertas={base.dados?.todosAlertas ?? []}
                podeGerir={podeGerir}
                aberta={aberta}
                onAbrir={(id) => setAberta(aberta === id ? undefined : id)}
                onMudou={() => { base.recarregar(); notificarMudanca(); }}
                onErro={setErro}
              />
            );
          })}
        </Fragment>
      ))}

      {tranquilos.length > 0 && (
        <>
          <LinhaGrupo rotulo="Sem decisões pendentes" />
          <div className="cartao">
            <table><tbody>
              {tranquilos.map((c) => (
                <tr key={c.id}>
                  <td style={{ width: 4, padding: 0 }}><div style={{ width: 4, height: 34, borderRadius: 3, background: 'var(--verde)' }} /></td>
                  <td><b>{c.numero}</b><div className="sec">{c.objeto}</div></td>
                  <td className="num"><span className="pill p-verde">Execução dentro do previsto</span></td>
                </tr>
              ))}
            </tbody></table>
          </div>
        </>
      )}
    </>
  );
}

function LinhaGrupo({ rotulo }: { rotulo: string }): ReactNode {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 11, margin: '18px 0 12px', fontSize: 11, letterSpacing: 1.5, textTransform: 'uppercase', color: 'var(--texto-fraco)', fontWeight: 700 }}>
      {rotulo}<span style={{ flex: 1, height: 1, background: 'var(--linha)' }} />
    </div>
  );
}

const COR_SAUDE: Record<SeveridadeAlerta, string> = { CRITICO: 'var(--vermelho)', AVISO: 'var(--ambar)', INFO: 'var(--azul)' };

function CartaoContrato({ contrato, decisoes, todosAlertas, podeGerir, aberta, onAbrir, onMudou, onErro }: {
  contrato: Contrato; decisoes: Alerta[]; todosAlertas: Alerta[]; podeGerir: boolean;
  aberta: string | undefined; onAbrir: (id: string) => void; onMudou: () => void; onErro: (m?: string) => void;
}): ReactNode {
  const navegar = useNavigate();
  const saude = saudeContrato(todosAlertas.filter((a) => a.contratoId === contrato.id)) ?? 'INFO';
  const criticas = decisoes.filter((d) => d.severidade === 'CRITICO').length;

  return (
    <div className="cartao" style={{ overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 15px', borderBottom: '1px solid var(--linha)', background: 'var(--superficie-2)' }}>
        <div style={{ width: 4, alignSelf: 'stretch', minHeight: 30, borderRadius: 3, background: COR_SAUDE[saude] }} />
        <div>
          <div style={{ fontWeight: 700, fontSize: 13.5, cursor: 'pointer' }} onClick={() => navegar(`/contratos/${contrato.id}`)}>{contrato.numero}</div>
          <div className="sec">{contrato.objeto}</div>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className={`pill ${criticas > 0 ? 'p-verm' : 'p-ambar'}`}>{decisoes.length} decisõe(s)</span>
          <button className="btn sm" onClick={() => navegar(`/contratos/${contrato.id}`)}>Ver contrato</button>
        </div>
      </div>
      {decisoes.map((d) => (
        <Decisao
          key={d.id} alerta={d} contrato={contrato} podeGerir={podeGerir}
          aberta={aberta === d.id} onAbrir={() => onAbrir(d.id)} onMudou={onMudou} onErro={onErro}
        />
      ))}
    </div>
  );
}

function Decisao({ alerta, contrato, podeGerir, aberta, onAbrir, onMudou, onErro }: {
  alerta: Alerta; contrato: Contrato; podeGerir: boolean; aberta: boolean;
  onAbrir: () => void; onMudou: () => void; onErro: (m?: string) => void;
}): ReactNode {
  const [aDispensar, setADispensar] = useState(false);
  const [motivo, setMotivo] = useState('');
  const [dias, setDias] = useState('30');
  const dLim = alerta.diasParaLimite;
  const urgente = dLim !== undefined && dLim < 0;

  async function dispensar(): Promise<void> {
    onErro();
    try {
      await new ServicoAlertas(app.ctx).dispensar(alerta.id, motivo, Number(dias), app.utilizador());
      setADispensar(false); setMotivo(''); onMudou();
    } catch (e) { onErro(mensagemErro(e)); }
  }
  async function marcarEmCurso(): Promise<void> {
    try { await new ServicoAlertas(app.ctx).marcarEmCurso(alerta.id, app.utilizador()); onMudou(); }
    catch (e) { onErro(mensagemErro(e)); }
  }

  return (
    <div style={{ display: 'flex', gap: 12, padding: '13px 15px', borderBottom: '1px solid var(--linha)', alignItems: 'flex-start', background: aberta ? 'var(--superficie-2)' : undefined }}>
      <div style={{ flex: '0 0 96px', textAlign: 'right', paddingTop: 1 }}>
        {alerta.dataLimiteAcao !== undefined ? (
          <>
            <div className="tabnum" style={{ fontSize: 12.5, fontWeight: 700, color: urgente ? 'var(--vermelho)' : undefined }}>{alerta.dataLimiteAcao.slice(8)}/{alerta.dataLimiteAcao.slice(5, 7)}</div>
            <div className="sec" title={alerta.eventoAncora}>{urgente ? `há ${-dLim!} dias` : `em ${dLim} dias`}</div>
          </>
        ) : <div className="sec">sem prazo</div>}
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 650, fontSize: 13.5, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          {alerta.titulo}
          <Severidade v={alerta.severidade} />
          {alerta.estado === 'EM_CURSO' && <span className="pill p-azul">Em curso</span>}
          <code style={{ fontSize: 10.5 }}>{alerta.codigo}</code>
        </div>
        <div className="sec" style={{ marginTop: 4, fontSize: 12.5, color: 'var(--texto-suave)' }}>{alerta.detalhe}</div>

        <div style={{ display: 'flex', gap: 7, marginTop: 10, flexWrap: 'wrap' }}>
          {podeGerir && <AcaoPrincipal alerta={alerta} contrato={contrato} onFeito={onMudou} onErro={onErro} onEmCurso={marcarEmCurso} />}
          {(alerta.opcoes?.length ?? 0) > 0 && (
            <button className="btn sm" onClick={onAbrir}>{aberta ? 'Fechar opções' : `Ver ${alerta.opcoes!.length} opções`}</button>
          )}
          {alerta.impactoMinutos !== undefined && alerta.impactoMinutos > 0 && (
            <button
              className="btn sm"
              onClick={() => gerarMapaProjecaoXlsx({
                contratoNumero: contrato.numero,
                perfilNome: alerta.titulo.replace(/^Perfil\s+/, '').replace(/\s+esgota-se.*$/, ''),
                horasDisponiveis: Math.round(alerta.impactoMinutos! / 60),
                valorDisponivel: alerta.impactoValor ?? 0,
              })}
            >⬇ Mapa de projeção (Excel)</button>
          )}
          {podeGerir && !aDispensar && <button className="btn sm" style={{ borderColor: 'transparent', color: 'var(--texto-suave)' }} onClick={() => setADispensar(true)}>Dispensar</button>}
        </div>

        {aDispensar && (
          <div style={{ border: '1px solid var(--linha-forte)', borderRadius: 9, padding: 11, marginTop: 10 }}>
            <div className="g2">
              <div className="campo"><label>Motivo da dispensa</label><input value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="ex.: tratado fora da aplicação" /></div>
              <div className="campo"><label>Durante (dias)</label><input type="number" min={1} value={dias} onChange={(e) => setDias(e.target.value)} /></div>
            </div>
            <div className="sec" style={{ marginBottom: 8 }}>Reaparece quando o período terminar, ou antes disso se a situação agravar.</div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn sm pri" disabled={motivo.trim() === ''} onClick={() => void dispensar()}>Dispensar</button>
              <button className="btn sm" onClick={() => setADispensar(false)}>Cancelar</button>
            </div>
          </div>
        )}

        {aberta && (alerta.opcoes?.length ?? 0) > 0 && (
          <Escada opcoes={alerta.opcoes!} />
        )}
      </div>

      <div style={{ flex: '0 0 auto', textAlign: 'right', paddingTop: 2 }}>
        <div className="tabnum" style={{ fontSize: 14.5, fontWeight: 700, letterSpacing: '-.2px' }}>
          {alerta.impactoValor !== undefined ? formatarMoeda(alerta.impactoValor) : alerta.impactoMinutos !== undefined ? formatarHoras(alerta.impactoMinutos) : '—'}
        </div>
        {(alerta.impactoValor !== undefined || alerta.impactoMinutos !== undefined) && (
          <div style={{ fontSize: 10, color: 'var(--texto-fraco)', textTransform: 'uppercase', letterSpacing: '.6px', marginTop: 2 }}>impacto</div>
        )}
      </div>
    </div>
  );
}

function Escada({ opcoes }: { opcoes: OpcaoAlerta[] }): ReactNode {
  return (
    <ol style={{ margin: '11px 0 0', padding: 0, listStyle: 'none', border: '1px solid var(--linha)', borderRadius: 8, overflow: 'hidden' }}>
      {opcoes.map((o) => (
        <li key={o.ordem} style={{ display: 'flex', gap: 11, padding: '10px 12px', borderBottom: '1px solid var(--linha)', alignItems: 'flex-start', background: 'var(--superficie)' }}>
          <div style={{ flex: '0 0 20px', height: 20, borderRadius: '50%', background: 'var(--superficie-2)', border: '1px solid var(--linha-forte)', display: 'grid', placeItems: 'center', fontSize: 10.5, fontWeight: 700, color: 'var(--texto-suave)' }}>{o.ordem}</div>
          <div>
            <div style={{ fontSize: 12.5, fontWeight: 650 }}>
              {o.titulo}{' '}
              <span className={`pill ${o.viabilidade === 'VIAVEL' ? 'p-verde' : o.viabilidade === 'CONDICIONADA' ? 'p-ambar' : 'p-verm'}`}>{ROT_VIAB[o.viabilidade] ?? o.viabilidade}</span>
            </div>
            <div style={{ fontSize: 11.5, color: 'var(--texto-suave)', marginTop: 3, lineHeight: 1.45 }}>{o.detalhe}</div>
            {o.fundamento !== undefined && <div style={{ fontSize: 10.5, color: 'var(--texto-fraco)', marginTop: 4, fontFamily: 'ui-monospace,Menlo,monospace' }}>{o.fundamento}</div>}
          </div>
        </li>
      ))}
    </ol>
  );
}

/**
 * AÇÃO NO SÍTIO DO PROBLEMA — o maior ganho do redesenho.
 *
 * A decisão já sabe o contrato, o montante e o prazo: o formulário abre aqui,
 * pré-preenchido, em vez de obrigar a percorrer Contratos → detalhe →
 * Modificações → escolher tipo → preencher.
 */
function AcaoPrincipal({ alerta, contrato, onFeito, onErro, onEmCurso }: {
  alerta: Alerta; contrato: Contrato; onFeito: () => void; onErro: (m?: string) => void; onEmCurso: () => void;
}): ReactNode {
  const navegar = useNavigate();
  const [aberto, setAberto] = useState(false);
  const [f, setF] = useState({
    montante: alerta.impactoValor !== undefined ? String(alerta.impactoValor / 100) : '',
    ate: `${Number(hoje().slice(0, 4)) + 1}-12-31`,
    novaData: contrato.dataTerminoContratual,
    fundamentacao: '',
  });

  function abrir(): void { setAberto(true); onEmCurso(); }

  async function transitar(): Promise<void> {
    onErro();
    try {
      await app.contratos.transitarAnoEconomico(contrato.id, eurosParaCent(f.montante), f.ate, f.fundamentacao, app.utilizador());
      setAberto(false); onFeito();
    } catch (e) { onErro(mensagemErro(e)); }
  }

  // Transição de saldo — o caso do fim do ano económico.
  if (alerta.codigo === 'AL-FIM-ANO-ECONOMICO') {
    if (!aberto) return <button className="btn sm pri" onClick={abrir}>Registar transição</button>;
    return (
      <div style={{ border: '1px solid var(--marca)', borderRadius: 9, padding: 13, marginTop: 4, width: '100%', background: 'var(--superficie)' }}>
        <h4 style={{ margin: '0 0 11px', fontSize: 12.5, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}>
          Transição para o ano económico seguinte <span className="chip">pré-preenchido a partir da decisão</span>
        </h4>
        <div className="g2">
          <div className="campo"><label>Montante a transitar (€)</label><input type="number" inputMode="decimal" min={0} step="0.01" value={f.montante} onChange={(e) => setF({ ...f, montante: e.target.value })} /></div>
          <div className="campo"><label>Executável até</label><input type="date" value={f.ate} onChange={(e) => setF({ ...f, ate: e.target.value })} /></div>
        </div>
        <div className="campo"><label>Fundamentação</label><textarea rows={2} value={f.fundamentacao} onChange={(e) => setF({ ...f, fundamentacao: e.target.value })} /></div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn sm pri" onClick={() => void transitar()}>Confirmar transição</button>
          <button className="btn sm" onClick={() => setAberto(false)}>Cancelar</button>
        </div>
      </div>
    );
  }

  // Restantes: encaminham para o separador certo, já aberto.
  const DESTINO: Record<string, { rot: string; tab: string }> = {
    'AL-FOLGA-SEM-TEMPO': { rot: 'Prorrogar vigência', tab: 'Modificações' },
    'AL-PORTARIA-LIMITA-VIGENCIA': { rot: 'Preparar pedido', tab: 'Modificações' },
    'AL-PORTARIA-REPROGRAMAR': { rot: 'Preparar pedido', tab: 'Modificações' },
    'AL-PERFIL-ESGOTA-ANTES-TERMINO': { rot: 'Gerir afetações', tab: 'Execução' },
    'AL-CAPACIDADE-INSUFICIENTE': { rot: 'Gerir afetações', tab: 'Execução' },
    'AL-PERFIL-80': { rot: 'Gerir afetações', tab: 'Execução' },
    'AL-PERFIL-90': { rot: 'Gerir afetações', tab: 'Execução' },
    'AL-VALOR-DISPONIVEL': { rot: 'Registar complementares', tab: 'Modificações' },
    'AL-NOVO-PROCEDIMENTO': { rot: 'Ver contrato', tab: 'Ficha' },
    'AL-EXECUCAO-FORA-VIGENCIA': { rot: 'Rever registos', tab: 'Execução' },
    'AL-SUSPENSAO-ABERTA': { rot: 'Rever suspensão', tab: 'Modificações' },
    'AL-VISTO-PENDENTE': { rot: 'Registar visto', tab: 'Ficha' },
  };
  const d = DESTINO[alerta.codigo];
  if (d === undefined) return null;
  return (
    <button className="btn sm pri" onClick={() => { onEmCurso(); navegar(`/contratos/${contrato.id}?tab=${encodeURIComponent(d.tab)}`); }}>{d.rot}</button>
  );
}
