import { Fragment, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { JobAlertas, ServicoAlertas } from '@chora/api/nucleo';
import { CATALOGO_ALERTAS, FAMILIAS_ALERTAS, diasUteisDeMinutos, formatarDiasUteis, type AcaoOpcao, type Alerta, type Contrato, type OpcaoAlerta } from '@chora/domain';
import { app } from '../porta/aplicacao-local.js';
import { Cabecalho } from '../app/Shell.js';
import { eurosParaCent, formatarMoeda, hoje, mensagemErro, notificarMudanca, useAsync } from '../comum.js';
import { Perguntar } from '../componentes/Perguntar.js';
import { gerarMapaProjecaoXlsx } from '../projecoes.js';

const ROT_VIAB: Record<string, string> = { VIAVEL: 'Viável', CONDICIONADA: 'Condicionada', INVIAVEL: 'Inviável' };

/**
 * URGÊNCIA PELO PRAZO, não pela severidade. Com metade das decisões marcadas
 * como críticas, a severidade não separava nada: o que separa é quanto tempo
 * falta. É esta a única codificação de cor da fila.
 */
type Urgencia = 'ESGOTADO' | 'PROXIMO' | 'FOLGA' | 'SEM_PRAZO';
function urgenciaDe(dias: number | undefined): Urgencia {
  if (dias === undefined) return 'SEM_PRAZO';
  if (dias < 0) return 'ESGOTADO';
  return dias <= 30 ? 'PROXIMO' : 'FOLGA';
}
const PESO_URGENCIA: Record<Urgencia, number> = { ESGOTADO: 3, PROXIMO: 2, FOLGA: 1, SEM_PRAZO: 0 };
const COR_URGENCIA: Record<Urgencia, string> = {
  ESGOTADO: 'var(--vermelho)', PROXIMO: 'var(--ambar)', FOLGA: 'var(--azul)', SEM_PRAZO: 'var(--linha-forte)',
};
const PILL_URGENCIA: Record<Urgencia, string> = {
  ESGOTADO: 'p-verm', PROXIMO: 'p-ambar', FOLGA: 'p-azul', SEM_PRAZO: 'p-ard',
};
/** A urgência de um conjunto de decisões é a da mais apertada. */
function urgenciaMaior(decisoes: ReadonlyArray<Alerta>): Urgencia {
  return decisoes.reduce<Urgencia>((pior, d) => {
    const u = urgenciaDe(d.diasParaLimite);
    return PESO_URGENCIA[u] > PESO_URGENCIA[pior] ? u : pior;
  }, 'SEM_PRAZO');
}

/**
 * Prazo em linguagem corrente, para a barra de urgência da decisão. O prazo por
 * extenso vive no descritivo: a fila só precisa de sinalizar quão apertado está.
 */
function rotuloPrazo(a: Alerta): string {
  const d = a.diasParaLimite;
  if (d === undefined || a.dataLimiteAcao === undefined) return 'Sem prazo definido';
  if (d < 0) return `Prazo esgotado há ${-d} dias (era ${a.dataLimiteAcao})`;
  return `Faltam ${d} dias (até ${a.dataLimiteAcao})`;
}

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
    const dispensadas = await servico.dispensadas();
    const contratos = await app.ctx.repos.contratos.todos();
    return { pendentes, dispensadas, contratos };
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
        <div className="sec" style={{ marginTop: 16, fontSize: 11.5 }}>
          {tranquilos.length} contrato(s) sem decisões pendentes: {tranquilos.slice(0, 8).map((c) => c.numero).join(', ')}{tranquilos.length > 8 ? '…' : ''}
        </div>
      )}

      <Dispensadas
        alertas={base.dados?.dispensadas ?? []}
        contratos={contratos}
        podeGerir={podeGerir}
        onMudou={() => { base.recarregar(); notificarMudanca(); }}
        onErro={setErro}
      />

      <AdvertenciaJuridica />

      {/*
        O «Perguntar» fecha a página em vez de a abrir: quem chega ao «Hoje» vem
        ver o que tem de decidir, não fazer uma pergunta. Fica colado ao fundo do
        ecrã para continuar ao alcance sem disputar o topo com a fila.

        A faixa é OPACA e tem linha própria: em cima de um fundo transparente o
        conteúdo passava por trás da caixa e lia-se sobreposto. O espaço abaixo
        do último cartão é reservado à altura da faixa, para nada ficar escondido.
      */}
      <div style={{ height: 30 }} />
      <div style={{
        position: 'sticky', bottom: 0, zIndex: 6, marginTop: 'auto',
        paddingTop: 15, paddingBottom: 24,
        background: 'var(--fundo)', borderTop: '1px solid var(--linha)',
        boxShadow: '0 -10px 18px -12px rgba(0,0,0,.28)',
      }}>
        <Perguntar contratos={contratos} />
      </div>
    </>
  );
}

/**
 * As decisões de UM contrato, com a mesma leitura e as mesmas ações da fila do
 * «Hoje». Serve o separador «Ações» do detalhe do contrato: quem está dentro de
 * um contrato não deve ter de voltar ao «Hoje» para agir sobre ele.
 */
export function DecisoesDoContrato({ contrato, decisoes, podeGerir, onMudou, onErro }: {
  contrato: Contrato; decisoes: Alerta[]; podeGerir: boolean; onMudou: () => void; onErro: (m?: string) => void;
}): ReactNode {
  const [aberta, setAberta] = useState<string>();
  const ordenadas = [...decisoes].sort((x, y) => (x.diasParaLimite ?? 9e9) - (y.diasParaLimite ?? 9e9));

  return (
    <>
      <div className="cartao" style={{ overflow: 'hidden' }}>
        {ordenadas.map((d) => (
          <Decisao
            key={d.id} alerta={d} contrato={contrato} podeGerir={podeGerir}
            aberta={aberta === d.id} onAbrir={() => setAberta(aberta === d.id ? undefined : d.id)}
            onMudou={onMudou} onErro={onErro}
          />
        ))}
        {ordenadas.length === 0 && <div className="vazio">Sem decisões pendentes neste contrato.</div>}
      </div>
      <AdvertenciaJuridica />
    </>
  );
}

/**
 * Decisões postas de lado, no fim da fila e fechadas por omissão: continuam a
 * existir, mas não competem com o que é preciso decidir hoje. Terminada a
 * vigência do contrato saem daqui — ficam só na auditoria.
 */
function Dispensadas({ alertas, contratos, podeGerir, onMudou, onErro }: {
  alertas: Alerta[]; contratos: Contrato[]; podeGerir: boolean; onMudou: () => void; onErro: (m?: string) => void;
}): ReactNode {
  async function reabrir(id: string): Promise<void> {
    onErro();
    try { await new ServicoAlertas(app.ctx).reabrir(id, app.utilizador()); onMudou(); }
    catch (e) { onErro(mensagemErro(e)); }
  }

  return (
    <details style={{ marginTop: 22 }}>
      <summary style={{ cursor: 'pointer', fontSize: 11, letterSpacing: 1.5, textTransform: 'uppercase', color: 'var(--texto-fraco)', fontWeight: 700, padding: '6px 0' }}>
        Decisões dispensadas ({alertas.length})
      </summary>
      <div className="cartao" style={{ marginTop: 10 }}>
        <div className="aviso" style={{ margin: 12 }}>
          Dispensadas por decisão do gestor. Reaparecem quando o período terminar ou se a situação agravar; terminada a vigência do contrato, deixam de constar aqui e ficam apenas no registo de auditoria.
        </div>
        <table>
          <thead><tr><th>Contrato</th><th>Decisão</th><th>Motivo</th><th>Até</th>{podeGerir && <th></th>}</tr></thead>
          <tbody>
            {alertas.map((a) => {
              const c = contratos.find((x) => x.id === a.contratoId);
              return (
                <tr key={a.id}>
                  <td className="prim">{c?.numero ?? a.contratoId}<div className="sec">{c?.objeto ?? ''}</div></td>
                  <td>{a.titulo}<div className="sec"><code style={{ fontSize: 10.5 }}>{a.codigo}</code></div></td>
                  <td className="sec">{a.motivoDispensa ?? '—'}</td>
                  <td className="tabnum">{a.dispensadaAte ?? '—'}</td>
                  {podeGerir && <td style={{ whiteSpace: 'nowrap' }}><button className="btn sm" onClick={() => void reabrir(a.id)}>Reabrir</button></td>}
                </tr>
              );
            })}
            {alertas.length === 0 && <tr><td colSpan={podeGerir ? 5 : 4} className="vazio">Nenhuma decisão dispensada.</td></tr>}
          </tbody>
        </table>
      </div>
    </details>
  );
}

function LinhaGrupo({ rotulo }: { rotulo: string }): ReactNode {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 11, margin: '18px 0 12px', fontSize: 11, letterSpacing: 1.5, textTransform: 'uppercase', color: 'var(--texto-fraco)', fontWeight: 700 }}>
      {rotulo}<span style={{ flex: 1, height: 1, background: 'var(--linha)' }} />
    </div>
  );
}

function CartaoContrato({ contrato, decisoes, podeGerir, aberta, onAbrir, onMudou, onErro }: {
  contrato: Contrato; decisoes: Alerta[]; podeGerir: boolean;
  aberta: string | undefined; onAbrir: (id: string) => void; onMudou: () => void; onErro: (m?: string) => void;
}): ReactNode {
  const navegar = useNavigate();
  const urgencia = urgenciaMaior(decisoes);

  return (
    <div className="cartao" style={{ overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', borderBottom: '1px solid var(--linha)', background: 'var(--superficie-2)' }}>
        <div style={{ width: 3, alignSelf: 'stretch', minHeight: 26, borderRadius: 3, background: COR_URGENCIA[urgencia] }} />
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 13, cursor: 'pointer' }} onClick={() => navegar(`/contratos/${contrato.id}`)}>{contrato.numero}</div>
          <div className="sec" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{contrato.objeto}</div>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className={`pill ${PILL_URGENCIA[urgencia]}`}>{decisoes.length} decisõe(s)</span>
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
  const urgencia = urgenciaDe(alerta.diasParaLimite);

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

  // Havendo escada, nenhuma opção é promovida a botão de topo: destacar um
  // degrau seria decidir pelo gestor uma escolha que a escada existe para pôr.
  const temEscada = (alerta.opcoes?.length ?? 0) > 0;

  // Só as opções dentro do prazo contam para o rótulo: as perdidas já não são
  // escolhas, e ficam recolhidas dentro da escada.
  const disponiveis = (alerta.opcoes ?? []).filter((o) => (o.diasParaLimite ?? 0) >= 0).length;

  return (
    <div style={{ display: 'flex', gap: 12, padding: '12px 14px', borderBottom: '1px solid var(--linha)', alignItems: 'flex-start', background: aberta ? 'var(--superficie-2)' : undefined }}>
      <div style={{ flex: '0 0 3px', alignSelf: 'stretch', borderRadius: 3, background: COR_URGENCIA[urgencia] }} title={rotuloPrazo(alerta)} />

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 650, fontSize: 13.5, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          {alerta.titulo}
          {alerta.estado === 'EM_CURSO' && <span className="pill p-azul">Em curso</span>}
          <code style={{ fontSize: 10.5 }}>{alerta.codigo}</code>
        </div>
        <div className="sec" style={{ marginTop: 4, fontSize: 12.5, color: 'var(--texto-suave)', lineHeight: 1.5 }}>{alerta.detalhe}</div>

        <div style={{ display: 'flex', gap: 7, marginTop: 9, flexWrap: 'wrap' }}>
          {podeGerir && !temEscada && <AcaoPrincipal alerta={alerta} contrato={contrato} onFeito={onMudou} onErro={onErro} onEmCurso={marcarEmCurso} />}
          {temEscada && (
            <button className="btn sm" onClick={onAbrir}>{aberta ? 'Fechar ações' : disponiveis === 0 ? 'Ver ações' : `Ver ${disponiveis} ${disponiveis === 1 ? 'ação' : 'ações'}`}</button>
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

        {aberta && temEscada && <Escada opcoes={alerta.opcoes!} contratoId={contrato.id} onEmCurso={marcarEmCurso} />}
      </div>

      <Impacto alerta={alerta} />
    </div>
  );
}

/**
 * IMPACTO — o tempo mede-se em DIAS ÚTEIS, não em horas. «Restam 340 h» obriga a
 * fazer contas; «restam 2 meses e 3 dias» diz de imediato se há tempo para
 * instruir o ato antes de a capacidade acabar.
 */
function Impacto({ alerta }: { alerta: Alerta }): ReactNode {
  const dias = alerta.diasUteisRestantes ?? (alerta.impactoMinutos !== undefined ? diasUteisDeMinutos(alerta.impactoMinutos) : undefined);
  const temValor = alerta.impactoValor !== undefined;
  if (!temValor && dias === undefined) return <div style={{ flex: '0 0 108px' }} />;
  return (
    <div
      style={{ flex: '0 0 108px', textAlign: 'right' }}
      title={temValor ? 'Impacto financeiro' : 'Dias úteis restantes'}
    >
      <div className="tabnum" style={{ fontSize: 13, fontWeight: 700, letterSpacing: '-.2px' }}>
        {temValor ? formatarMoeda(alerta.impactoValor!) : formatarDiasUteis(dias!)}
      </div>
      {!temValor && <div className="sec">dias úteis</div>}
    </div>
  );
}

/**
 * ADVERTÊNCIA JURÍDICA — rodapé da fila, fechado por omissão.
 *
 * Está aqui por uma razão de fundo: a aplicação torna fácil praticar o ato, e a
 * facilidade não pode ser lida como dispensa das formalidades nem como
 * transferência da responsabilidade do gestor do contrato para a ferramenta. Por
 * isso é abrangente — cobre TODOS os cenários do catálogo, e não só os que
 * estiverem hoje na fila — e fica sempre acessível no mesmo sítio.
 */
function AdvertenciaJuridica(): ReactNode {
  const [aberta, setAberta] = useState(false);
  const comNota = CATALOGO_ALERTAS.filter((a) => a.notaJuridica !== undefined);

  return (
    <div style={{ marginTop: 26, borderTop: '1px solid var(--linha)', paddingTop: 10 }}>
      <button
        onClick={() => setAberta(!aberta)}
        style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', font: 'inherit', fontSize: 11.5, color: 'var(--texto-fraco)', display: 'flex', alignItems: 'center', gap: 7 }}
      >
        <span style={{ fontWeight: 700 }}>§</span>
        Advertência jurídica — o que estas ações não dispensam
        <span style={{ fontSize: 9 }}>{aberta ? '▼' : '▶'}</span>
      </button>

      {aberta && (
        <div style={{ marginTop: 10, padding: '13px 15px', border: '1px solid var(--linha)', borderRadius: 9, background: 'var(--superficie-2)', fontSize: 11.5, color: 'var(--texto-suave)', lineHeight: 1.55 }}>
          <p style={{ margin: '0 0 10px' }}>
            A aplicação apoia a decisão de gestão: sinaliza prazos, quantifica impactos e enumera vias
            possíveis a partir de regras determinísticas e de projeções do ritmo de execução recente.
            <b> Não substitui o juízo jurídico, a instrução do procedimento nem a decisão do órgão competente</b>,
            e a sua utilização <b>não transfere nem atenua a responsabilidade do gestor do contrato</b> pelos
            atos que pratica ou deixa de praticar.
          </p>
          <p style={{ margin: '0 0 10px' }}>
            As datas-limite resultam de prazos de instrução parametrizados na base legal versionada e podem
            não corresponder ao prazo aplicável ao caso concreto. As projeções assumem a continuação do ritmo
            recente e não são previsões certas. A ausência de alerta não atesta a conformidade da execução.
          </p>
          <p style={{ margin: '0 0 12px' }}>
            Em especial, e por tipo de situação:
          </p>

          {FAMILIAS_ALERTAS.map((familia) => {
            const daFamilia = comNota.filter((a) => a.familia === familia);
            if (daFamilia.length === 0) return null;
            return (
              <div key={familia} style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 10.5, textTransform: 'uppercase', letterSpacing: 1, fontWeight: 700, color: 'var(--texto-fraco)', marginBottom: 5 }}>{familia}</div>
                {daFamilia.map((a) => {
                  const { intro, itens, fecho } = partirNota(a.notaJuridica!);
                  return (
                    <div key={a.codigo} style={{ marginBottom: 8, paddingLeft: 11, borderLeft: '2px solid var(--linha)' }}>
                      <div style={{ fontWeight: 650, color: 'var(--texto)' }}>{a.titulo} <code style={{ fontSize: 10 }}>{a.codigo}</code></div>
                      <div style={{ marginTop: 2 }}>{intro}</div>
                      {itens.length > 0 && (
                        <ul style={{ margin: '3px 0 0', paddingLeft: 17 }}>
                          {itens.map((i) => <li key={i} style={{ marginBottom: 1 }}>{i}</li>)}
                        </ul>
                      )}
                      {fecho !== undefined && <div style={{ marginTop: 3 }}>{fecho}</div>}
                    </div>
                  );
                })}
              </div>
            );
          })}

          <p style={{ margin: '12px 0 0', color: 'var(--texto-fraco)' }}>
            O catálogo completo das regras de negócio e dos alertas, com a respetiva base legal, está em
            «Regras e alertas».
          </p>
        </div>
      )}
    </div>
  );
}

/**
 * Parte a nota jurídica em intróito, alíneas e remate. As notas do catálogo são
 * escritas como «X não dispensa: a; b; c.», por vezes com uma frase final —
 * lidas em lista, dizem o mesmo em metade do tempo.
 */
function partirNota(texto: string): { intro: string; itens: string[]; fecho?: string } {
  const corte = texto.indexOf(':');
  if (corte < 0) return { intro: texto, itens: [] };
  const partes = texto.slice(corte + 1).split(';').map((s) => s.trim()).filter((s) => s !== '');
  const ultima = partes.pop();
  let fecho: string | undefined;
  if (ultima !== undefined) {
    // A última alínea pode arrastar a frase de remate: separa-a.
    const fim = ultima.search(/\.\s+[A-ZÀ-Ú]/);
    if (fim >= 0) { partes.push(ultima.slice(0, fim + 1)); fecho = ultima.slice(fim + 1).trim(); }
    else partes.push(ultima);
  }
  return { intro: texto.slice(0, corte + 1), itens: partes, ...(fecho !== undefined ? { fecho } : {}) };
}

/** Prazo próprio de uma opção — depois dele, deixa de estar disponível. */
function PrazoOpcao({ o }: { o: OpcaoAlerta }): ReactNode {
  if (o.dataLimite === undefined) return null;
  const d = o.diasParaLimite ?? 0;
  const perdida = d < 0;
  return (
    <span
      className={`pill ${perdida ? 'p-verm' : d <= 30 ? 'p-ambar' : 'p-ard'}`}
      title={perdida ? 'O prazo desta opção terminou' : 'Prazo próprio desta opção'}
    >{perdida ? `prazo terminou em ${o.dataLimite}` : `até ${o.dataLimite} · ${d} dias`}</span>
  );
}

/**
 * ESCADA DE OPÇÕES — cada degrau tem o SEU prazo e o SEU destino. O botão leva
 * ao sítio onde o ato se pratica, já no contrato certo e, nas modificações, com
 * o tipo pré-selecionado: a opção deixa de ser um conselho e passa a ser um
 * caminho.
 */
function Escada({ opcoes, contratoId, onEmCurso }: {
  opcoes: OpcaoAlerta[]; contratoId: string; onEmCurso: () => void;
}): ReactNode {
  const navegar = useNavigate();
  const [verPerdidas, setVerPerdidas] = useState(false);
  // Uma opção cujo prazo passou já não é uma escolha: sai da escada. Fica
  // acessível porque é o que explica o prazo da decisão e conta para auditoria.
  const disponiveis = opcoes.filter((o) => (o.diasParaLimite ?? 0) >= 0);
  const perdidas = opcoes.filter((o) => (o.diasParaLimite ?? 0) < 0);

  function seguir(acao: AcaoOpcao): void {
    onEmCurso();
    navegar(rotaDaAcao(acao, contratoId));
  }

  function linha(o: OpcaoAlerta, perdida: boolean): ReactNode {
    return (
      <li key={o.ordem} style={{ display: 'flex', gap: 10, padding: '9px 12px', borderTop: '1px solid var(--linha)', alignItems: 'flex-start', opacity: perdida ? 0.6 : 1 }}>
        <div style={{ flex: '0 0 19px', height: 19, borderRadius: '50%', background: 'var(--superficie-2)', border: '1px solid var(--linha-forte)', display: 'grid', placeItems: 'center', fontSize: 10, fontWeight: 700, color: 'var(--texto-suave)' }}>{o.ordem}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 12.5, fontWeight: 650, display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>
            {o.titulo}
            {o.viabilidade !== 'VIAVEL' && <span className={`pill ${o.viabilidade === 'CONDICIONADA' ? 'p-ambar' : 'p-verm'}`}>{ROT_VIAB[o.viabilidade] ?? o.viabilidade}</span>}
            <PrazoOpcao o={o} />
          </div>
          <div style={{ fontSize: 11.5, color: 'var(--texto-suave)', marginTop: 3, lineHeight: 1.45 }}>{o.detalhe}</div>
          {o.fundamento !== undefined && <div style={{ fontSize: 10.5, color: 'var(--texto-fraco)', marginTop: 4, fontFamily: 'ui-monospace,Menlo,monospace' }}>{o.fundamento}</div>}
          {!perdida && o.acao !== undefined && (
            <button className="btn sm" style={{ marginTop: 8 }} onClick={() => seguir(o.acao!)}>{o.acao.rotulo} →</button>
          )}
        </div>
      </li>
    );
  }

  return (
    <div style={{ marginTop: 10, border: '1px solid var(--linha)', borderRadius: 8, overflow: 'hidden' }}>
      <ol style={{ margin: 0, padding: 0, listStyle: 'none' }}>
        {disponiveis.map((o) => linha(o, false))}
        {disponiveis.length === 0 && (
          <li style={{ padding: '10px 12px', fontSize: 12, color: 'var(--texto-suave)' }}>
            Já não há opções dentro do prazo. Resta decidir com o atraso assumido e fundamentado.
          </li>
        )}
      </ol>
      {perdidas.length > 0 && (
        <>
          <button
            onClick={() => setVerPerdidas(!verPerdidas)}
            style={{ width: '100%', textAlign: 'left', background: 'var(--superficie-2)', border: 'none', borderTop: '1px solid var(--linha)', padding: '7px 12px', cursor: 'pointer', font: 'inherit', fontSize: 11.5, color: 'var(--texto-fraco)' }}
          >
            {verPerdidas ? '▼' : '▶'} {perdidas.length === 1 ? '1 opção já indisponível' : `${perdidas.length} opções já indisponíveis`}
          </button>
          {verPerdidas && <ol style={{ margin: 0, padding: 0, listStyle: 'none' }}>{perdidas.map((o) => linha(o, true))}</ol>}
        </>
      )}
    </div>
  );
}

/**
 * Rota do destino de uma ação. As afetações vivem no separador Execução do
 * contrato; as modificações no separador Modificações, que aceita o tipo a
 * pré-selecionar.
 */
function rotaDaAcao(acao: AcaoOpcao, contratoIdOmissao: string): string {
  const id = acao.contratoId ?? contratoIdOmissao;
  if (acao.destino === 'MODIFICACOES') {
    const tipo = acao.tipoModificacao !== undefined ? `&modificacao=${encodeURIComponent(acao.tipoModificacao)}` : '';
    return `/contratos/${id}?tab=${encodeURIComponent('Modificações')}${tipo}`;
  }
  if (acao.destino === 'FICHA') return `/contratos/${id}?tab=Ficha`;
  if (acao.destino === 'REGISTOS') return `/registos?contrato=${id}`;
  return `/contratos/${id}?tab=${encodeURIComponent('Afetações')}`;
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

  // Restantes: encaminham para o separador certo, já aberto e — nas
  // modificações — com o tipo de ato pré-selecionado.
  const d = DESTINO_ACAO[alerta.codigo];
  if (d === undefined) return null;
  return (
    <button
      className="btn sm pri"
      onClick={() => { onEmCurso(); navegar(rotaDaAcao({ destino: d.destino, rotulo: d.rot, ...(d.tipoModificacao !== undefined ? { tipoModificacao: d.tipoModificacao } : {}) }, contrato.id)); }}
    >{d.rot}</button>
  );
}

/**
 * Destino da ação principal de cada decisão. Onde há um ato de modificação
 * concreto, leva o tipo — o formulário abre já nesse tipo, sem obrigar a
 * procurá-lo na lista.
 *
 * Só constam decisões com um ATO a praticar. As que apenas remetiam para a
 * ficha do contrato não têm ação própria: «Ver contrato» já está no cabeçalho
 * do cartão, e repeti-lo por decisão é ruído sem escolha nenhuma.
 */
const DESTINO_ACAO: Record<string, { rot: string; destino: AcaoOpcao['destino']; tipoModificacao?: string }> = {
  'AL-FOLGA-SEM-TEMPO': { rot: 'Prorrogar vigência', destino: 'MODIFICACOES', tipoModificacao: 'PRORROGACAO' },
  'AL-PORTARIA-LIMITA-VIGENCIA': { rot: 'Prorrogar vigência', destino: 'MODIFICACOES', tipoModificacao: 'PRORROGACAO' },
  'AL-PORTARIA-REPROGRAMAR': { rot: 'Prorrogar vigência', destino: 'MODIFICACOES', tipoModificacao: 'PRORROGACAO' },
  'AL-EXECUCAO-EXCEDE-ANO': { rot: 'Registar transição', destino: 'MODIFICACOES', tipoModificacao: 'TRANSICAO_ANO_ECONOMICO' },
  'AL-PORTARIA-ANO-INSUFICIENTE': { rot: 'Registar transição', destino: 'MODIFICACOES', tipoModificacao: 'TRANSICAO_ANO_ECONOMICO' },
  'AL-PERFIL-ESGOTA-ANTES-TERMINO': { rot: 'Gerir afetações', destino: 'AFETACOES' },
  'AL-CAPACIDADE-INSUFICIENTE': { rot: 'Gerir afetações', destino: 'AFETACOES' },
  'AL-PERFIL-80': { rot: 'Gerir afetações', destino: 'AFETACOES' },
  'AL-PERFIL-90': { rot: 'Gerir afetações', destino: 'AFETACOES' },
  'AL-VALOR-DISPONIVEL': { rot: 'Registar complementares', destino: 'MODIFICACOES', tipoModificacao: 'SERVICOS_COMPLEMENTARES' },
  'AL-COMPLEMENTARES-40': { rot: 'Ver modificações', destino: 'MODIFICACOES', tipoModificacao: 'SERVICOS_COMPLEMENTARES' },
  'AL-COMPLEMENTARES-45': { rot: 'Ver modificações', destino: 'MODIFICACOES', tipoModificacao: 'SERVICOS_COMPLEMENTARES' },
  'AL-TERMINO-3M': { rot: 'Prorrogar vigência', destino: 'MODIFICACOES', tipoModificacao: 'PRORROGACAO' },
  'AL-TERMINO-6M': { rot: 'Prorrogar vigência', destino: 'MODIFICACOES', tipoModificacao: 'PRORROGACAO' },
  'AL-EXECUCAO-FORA-VIGENCIA': { rot: 'Rever registos', destino: 'AFETACOES' },
  'AL-SUSPENSAO-ABERTA': { rot: 'Rever suspensão', destino: 'MODIFICACOES', tipoModificacao: 'SUSPENSAO' },
  'AL-SUSPENSAO-VIGENCIA': { rot: 'Rever suspensão', destino: 'MODIFICACOES', tipoModificacao: 'SUSPENSAO' },
  'AL-VISTO-PENDENTE': { rot: 'Registar visto', destino: 'FICHA' },
};
