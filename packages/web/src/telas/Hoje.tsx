import { Fragment, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { JobAlertas, ServicoAlertas } from '@chora/api/nucleo';
import { CATALOGO_ALERTAS, FAMILIAS_ALERTAS, diasUteisDeMinutos, formatarDiasUteis, type AcaoOpcao, type Alerta, type Contrato, type OpcaoAlerta } from '@chora/domain';
import { app } from '../porta/aplicacao-local.js';
import { Cabecalho } from '../app/Shell.js';
import { eurosParaCent, formatarMoeda, hoje, mensagemErro, notificarMudanca, useAsync } from '../comum.js';
import { gerarMapaProjecaoXlsx } from '../projecoes.js';
import hero from '../ativos/choramingas-hero.png';

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
 * A FAMÍLIA da decisão — o «tipo de problema». Não vive no alerta guardado: vive
 * no catálogo, indexada pelo código. Serve de filtro, de segunda ordenação e de
 * etiqueta no cartão.
 */
const CLASSE_FAMILIA: Record<string, string> = {
  'Tempo × dinheiro': 'f-tempo',
  'Cobertura orçamental plurianual': 'f-cobertura',
  'Capacidade e perfis': 'f-capacidade',
  'Fim de ciclo': 'f-ciclo',
  'Higiene e risco de auditoria': 'f-higiene',
};
function familiaDe(a: Alerta): string | undefined {
  return CATALOGO_ALERTAS.find((d) => d.codigo === a.codigo)?.familia;
}

/** Por que ordem se lê a fila. O prazo é o padrão: é o que se perde primeiro. */
type Ordem = 'prazo' | 'exposicao' | 'tipo';

/** Ícone de traço, para os ladrilhos do resumo e para a busca. */
function IcS({ d, tam = 18 }: { d: string; tam?: number }): ReactNode {
  return (
    <svg width={tam} height={tam} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={d} /></svg>
  );
}

/** Etiqueta de família, para o cartão de decisão e para os filtros. */
export function EtiquetaFamilia({ familia }: { familia?: string }): ReactNode {
  if (familia === undefined) return null;
  return <span className={`fam ${CLASSE_FAMILIA[familia] ?? ''}`}>{familia}</span>;
}

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
  const [ordem, setOrdem] = useState<Ordem>('prazo');
  const [familia, setFamilia] = useState<string>();
  const [procura, setProcura] = useState('');

  async function reconciliar(): Promise<void> {
    setErro(undefined);
    try { await new JobAlertas(app.ctx).reconciliar(); base.recarregar(); notificarMudanca(); }
    catch (e) { setErro(mensagemErro(e)); }
  }

  const todas = base.dados?.pendentes ?? [];
  const contratos = base.dados?.contratos ?? [];
  const vencidas = todas.filter((a) => (a.diasParaLimite ?? 1) < 0).length;
  const proximas = todas.filter((a) => { const d = a.diasParaLimite; return d !== undefined && d >= 0 && d <= 30; }).length;
  const exposicao = todas.reduce((t, a) => t + (a.impactoValor ?? 0), 0);

  // Quantas decisões por família — a contagem que os filtros mostram.
  const porFamilia = new Map<string, number>();
  for (const a of todas) {
    const f = familiaDe(a);
    if (f !== undefined) porFamilia.set(f, (porFamilia.get(f) ?? 0) + 1);
  }

  /*
   * O filtro corre sobre o que já está carregado: número do contrato, título e
   * código da decisão. Procurar pelo código (`AL-FOLGA-SEM-TEMPO`) é o que
   * permite a quem conhece o catálogo saltar direito ao que quer.
   */
  const termo = procura.trim().toLowerCase();
  const numeroDe = (id: string): string => contratos.find((c) => c.id === id)?.numero ?? '';
  const pendentes = todas.filter((a) => {
    if (familia !== undefined && familiaDe(a) !== familia) return false;
    if (termo === '') return true;
    return `${numeroDe(a.contratoId)} ${a.titulo} ${a.codigo}`.toLowerCase().includes(termo);
  });

  /*
   * Agrupa por janela e, dentro dela, por contrato — salvo quando se pede a
   * leitura por tipo, e aí o grupo passa a ser a família. A ordenação por
   * exposição mantém os grupos temporais e troca só o critério dentro deles: é
   * o que responde a «por onde começo, dentro do que já é urgente».
   */
  const comparar = ordem === 'exposicao'
    ? (x: Alerta, y: Alerta) => (y.impactoValor ?? 0) - (x.impactoValor ?? 0)
    : (x: Alerta, y: Alerta) => (x.diasParaLimite ?? 9e9) - (y.diasParaLimite ?? 9e9);
  const rotuloGrupo = (a: Alerta): string => (ordem === 'tipo' ? familiaDe(a) ?? 'Sem família' : grupoDe(a));
  const ordemDosGrupos: string[] = ordem === 'tipo'
    ? [...FAMILIAS_ALERTAS, 'Sem família']
    : ORDEM_GRUPOS;

  const porGrupo = new Map<string, Map<string, Alerta[]>>();
  for (const a of [...pendentes].sort(comparar)) {
    const g = rotuloGrupo(a);
    if (!porGrupo.has(g)) porGrupo.set(g, new Map());
    const porContrato = porGrupo.get(g)!;
    if (!porContrato.has(a.contratoId)) porContrato.set(a.contratoId, []);
    porContrato.get(a.contratoId)!.push(a);
  }

  // Contratos sem decisões pendentes — mostram-se no fim, para dar sossego.
  const comDecisoes = new Set(todas.map((a) => a.contratoId));
  const tranquilos = contratos.filter((c) => (c.estado === 'EM_VIGOR' || c.estado === 'SUSPENSO') && !comDecisoes.has(c.id));

  return (
    <>
      <Cabecalho
        titulo="Hoje"
        sub={pendentes.length === 0 ? 'Sem decisões pendentes' : `${pendentes.length} decisõe(s) aberta(s)${vencidas > 0 ? ` · ${vencidas} com prazo esgotado` : ''}`}
        acoes={podeGerir ? <button className="btn" onClick={() => void reconciliar()}>Reavaliar</button> : undefined}
      />
      {erro !== undefined && <div className="erro-cx">⚠ {erro}</div>}

      {/*
        RESUMO, não boas-vindas. A saudação ocupava um terço da faixa para dizer
        o que o relógio do sistema já diz; o que interessa é quantas decisões
        perderam o prazo, quantas o perdem este mês e quanto dinheiro está preso
        nelas.
      */}
      {todas.length > 0 && (
        <section className="faixa">
          <div className="ladrilhos">
            <div className={`est ${vencidas > 0 ? 'laranja' : 'verde'}`}>
              <div className="quad"><IcS d={vencidas > 0 ? 'M12 3 2.5 20h19L12 3ZM12 10v4M12 17.2h.01' : 'm5 12.5 4.4 4.4L19 7'} /></div>
              <div><b>{vencidas} com prazo esgotado</b><span>{vencidas > 0 ? 'a opção já se perdeu' : 'nenhuma opção perdida'}</span></div>
            </div>
            <div className="est ambar">
              <div className="quad"><IcS d="M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0ZM12 7v5.2l3.4 2" /></div>
              <div><b>{proximas} nos próximos 30 dias</b><span>exigem ato este mês</span></div>
            </div>
            <div className="est azul">
              <div className="quad"><IcS d="M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0ZM14.6 9.3A3 3 0 1 0 12 15M9.4 11.2h5M9.4 13.4h5" /></div>
              <div><b className="tabnum">{formatarMoeda(exposicao)}</b><span>exposição das {todas.length} decisões</span></div>
            </div>
            <div className="est verde">
              <div className="quad"><IcS d="M6 3h9l4 4v14H6V3Zm3.5 10.5 1.8 1.8 3.4-3.8" /></div>
              <div><b>{CATALOGO_ALERTAS.length} verificações</b><span>automáticas, por contrato</span></div>
            </div>
          </div>
          <div className="fig"><img className="mascote" src={hero} alt="" /></div>
        </section>
      )}

      {/*
        ORDENAR E FILTRAR POR TIPO DE PROBLEMA. O prazo continua a mandar por
        omissão — é o que se perde primeiro. Mas quem quer atacar o dinheiro, ou
        despachar de uma vez tudo o que é da mesma natureza, deixa de ter de
        percorrer a fila inteira a olho.
      */}
      {todas.length > 0 && (
        <>
          <div className="barra-acoes">
            <div className="busca">
              <span className="lupa"><IcS d="M18 11a7 7 0 1 1-14 0 7 7 0 0 1 14 0Zm2 9-3.6-3.6" tam={15} /></span>
              <input value={procura} onChange={(e) => setProcura(e.target.value)}
                placeholder="Procurar por contrato, título ou código…" aria-label="Procurar decisões" />
            </div>
            <span className="dir" style={{ alignItems: 'center' }}>
              <span className="rot-seg">Ordenar por</span>
              <span className="seg">
                <button className={ordem === 'prazo' ? 'ativo' : ''} onClick={() => setOrdem('prazo')}>Prazo</button>
                <button className={ordem === 'exposicao' ? 'ativo' : ''} onClick={() => setOrdem('exposicao')}>Exposição</button>
                <button className={ordem === 'tipo' ? 'ativo' : ''} onClick={() => setOrdem('tipo')}>Tipo de problema</button>
              </span>
            </span>
          </div>
          <div className="barra-acoes">
            <button className={`fchip${familia === undefined ? ' ativo' : ''}`} onClick={() => setFamilia(undefined)}>
              Todos os tipos <span className="n">{todas.length}</span>
            </button>
            {FAMILIAS_ALERTAS.filter((f) => (porFamilia.get(f) ?? 0) > 0).map((f) => (
              <button key={f} className={`fchip${familia === f ? ' ativo' : ''}`} onClick={() => setFamilia(familia === f ? undefined : f)}>
                <span className={`pt ${CLASSE_FAMILIA[f] ?? ''}`} style={{ background: 'currentColor' }} />
                {f} <span className="n">{porFamilia.get(f)}</span>
              </button>
            ))}
          </div>
        </>
      )}

      {todas.length === 0 && (
        <div className="cartao" style={{ marginTop: 16 }}><div className="vazio">Nada a decidir. A execução de todos os contratos está dentro do previsto.</div></div>
      )}
      {todas.length > 0 && pendentes.length === 0 && (
        <div className="cartao"><div className="vazio">Nenhuma decisão corresponde ao que procura. <button className="ligacao" onClick={() => { setProcura(''); setFamilia(undefined); }}>Limpar filtros</button></div></div>
      )}

      {ordemDosGrupos.filter((g) => porGrupo.has(g)).map((g) => (
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
      <div>
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
    <div className="grp" style={{ marginTop: 22 }}>
      <b>{rotulo}</b><span style={{ flex: 1, height: 1, background: 'var(--linha)' }} />
    </div>
  );
}

/**
 * As decisões de um contrato. Já foi um cartão branco a envolvê-las, com o
 * contrato em cabeçalho; agora cada decisão é um cartão seu e o contrato é uma
 * etiqueta dentro dele. O contentor dizia «estas cinco são do mesmo contrato»,
 * que é verdade e não é o que se decide — decide-se uma de cada vez, e o
 * contentor punha uma moldura à volta de cada leitura.
 */
function CartaoContrato({ contrato, decisoes, podeGerir, aberta, onAbrir, onMudou, onErro }: {
  contrato: Contrato; decisoes: Alerta[]; podeGerir: boolean;
  aberta: string | undefined; onAbrir: (id: string) => void; onMudou: () => void; onErro: (m?: string) => void;
}): ReactNode {
  return (
    <>
      {decisoes.map((d) => (
        <Decisao
          key={d.id} alerta={d} contrato={contrato} podeGerir={podeGerir} mostrarContrato
          aberta={aberta === d.id} onAbrir={() => onAbrir(d.id)} onMudou={onMudou} onErro={onErro}
        />
      ))}
    </>
  );
}

/** Ícone da família, para o quadrado do cartão de decisão. */
const IC_FAMILIA: Record<string, string> = {
  'Tempo × dinheiro': 'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0ZM14.6 9.3A3 3 0 1 0 12 15M9.4 11.2h5M9.4 13.4h5',
  'Cobertura orçamental plurianual': 'M3 7.5A2.5 2.5 0 0 1 5.5 5h13A2.5 2.5 0 0 1 21 7.5v11a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 3 18.5v-11ZM3 10h18M8 3v4M16 3v4',
  'Capacidade e perfis': 'M12.4 8a3.4 3.4 0 1 1-6.8 0 3.4 3.4 0 0 1 6.8 0ZM2.8 20c0-3.4 2.8-5.2 6.2-5.2s6.2 1.8 6.2 5.2M16.4 5.6a3.4 3.4 0 0 1 0 5M21.2 20c0-2.7-1.1-4.2-2.8-4.8',
  'Fim de ciclo': 'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0ZM12 7v5.2l3.4 2',
  'Higiene e risco de auditoria': 'M7 3h10a2 2 0 0 1 2 2v16l-7-3.4L5 21V5a2 2 0 0 1 2-2Z',
};
const CLASSE_URGENCIA: Record<Urgencia, string> = {
  ESGOTADO: 'u-esgotado', PROXIMO: 'u-proximo', FOLGA: 'u-folga', SEM_PRAZO: '',
};

function Decisao({ alerta, contrato, podeGerir, aberta, mostrarContrato, onAbrir, onMudou, onErro }: {
  alerta: Alerta; contrato: Contrato; podeGerir: boolean; aberta: boolean; mostrarContrato?: boolean;
  onAbrir: () => void; onMudou: () => void; onErro: (m?: string) => void;
}): ReactNode {
  const navegar = useNavigate();
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

  const fam = familiaDe(alerta);
  return (
    <article className={`dec ${CLASSE_URGENCIA[urgencia]}`} style={aberta ? { background: 'var(--superficie-2)' } : undefined}>
      <div className="rail" title={rotuloPrazo(alerta)} />
      <div className="quad"><IcS d={IC_FAMILIA[fam ?? ''] ?? 'M12 3 2.5 20h19L12 3ZM12 10v4M12 17.2h.01'} tam={24} /></div>

      <div className="miolo">
        <div className="cab">
          <h3>{alerta.titulo}</h3>
          {mostrarContrato === true && (
            <button className="chip" style={{ border: 'none', cursor: 'pointer' }} onClick={() => navegar(`/contratos/${contrato.id}`)}>{contrato.numero}</button>
          )}
          {alerta.estado === 'EM_CURSO' && <span className="pill p-azul">Em curso</span>}
          <EtiquetaFamilia familia={fam} />
          <code style={{ fontSize: 10.5 }}>{alerta.codigo}</code>
        </div>
        <p className="txt">{alerta.detalhe}</p>

        <div style={{ display: 'flex', gap: 7, marginTop: 11, flexWrap: 'wrap' }}>
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

        {aberta && temEscada && <Escada opcoes={alerta.opcoes!} contratoId={contrato.id} numeroContrato={contrato.numero} onEmCurso={marcarEmCurso} />}
      </div>

      {temImpacto(alerta) && <div className="lado"><Impacto alerta={alerta} /></div>}
    </article>
  );
}

/**
 * IMPACTO — o tempo mede-se em DIAS ÚTEIS, não em horas. «Restam 340 h» obriga a
 * fazer contas; «restam 2 meses e 3 dias» diz de imediato se há tempo para
 * instruir o ato antes de a capacidade acabar.
 */
function diasDoImpacto(a: Alerta): number | undefined {
  return a.diasUteisRestantes ?? (a.impactoMinutos !== undefined ? diasUteisDeMinutos(a.impactoMinutos) : undefined);
}
/** Sem impacto não há coluna: uma coluna vazia é um buraco de 216 px. */
function temImpacto(a: Alerta): boolean {
  return a.impactoValor !== undefined || diasDoImpacto(a) !== undefined;
}

function Impacto({ alerta }: { alerta: Alerta }): ReactNode {
  const dias = diasDoImpacto(alerta);
  const temValor = alerta.impactoValor !== undefined;
  if (!temValor && dias === undefined) return null;
  return (
    <div className="valor" title={temValor ? 'Impacto financeiro' : 'Dias úteis restantes'}>
      <div className="v tabnum">{temValor ? formatarMoeda(alerta.impactoValor!) : formatarDiasUteis(dias!)}</div>
      <div className="r">{temValor ? 'Impacto financeiro' : 'dias úteis restantes'}</div>
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
function Escada({ opcoes, contratoId, numeroContrato, onEmCurso }: {
  opcoes: OpcaoAlerta[]; contratoId: string; numeroContrato: string; onEmCurso: () => void;
}): ReactNode {
  const navegar = useNavigate();
  const [verPerdidas, setVerPerdidas] = useState(false);
  // Uma opção cujo prazo passou já não é uma escolha: sai da escada. Fica
  // acessível porque é o que explica o prazo da decisão e conta para auditoria.
  const disponiveis = opcoes.filter((o) => (o.diasParaLimite ?? 0) >= 0);
  const perdidas = opcoes.filter((o) => (o.diasParaLimite ?? 0) < 0);

  function seguir(acao: AcaoOpcao): void {
    onEmCurso();
    navegar(rotaDaAcao(acao, contratoId, numeroContrato));
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
function rotaDaAcao(acao: AcaoOpcao, contratoIdOmissao: string, numeroContrato?: string): string {
  const id = acao.contratoId ?? contratoIdOmissao;
  if (acao.destino === 'MODIFICACOES') {
    const tipo = acao.tipoModificacao !== undefined ? `&modificacao=${encodeURIComponent(acao.tipoModificacao)}` : '';
    return `/contratos/${id}?tab=${encodeURIComponent('Modificações')}${tipo}`;
  }
  if (acao.destino === 'FICHA') return `/contratos/${id}?tab=Ficha`;
  if (acao.destino === 'REGISTOS') return `/registos?contrato=${id}`;
  // A faturação identifica-se pelo NÚMERO do contrato, que é o que vem na
  // fatura — não pelo identificador interno.
  if (acao.destino === 'FATURACAO') return `/faturacao?contrato=${encodeURIComponent(numeroContrato ?? '')}`;
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
      onClick={() => { onEmCurso(); navegar(rotaDaAcao({ destino: d.destino, rotulo: d.rot, ...(d.tipoModificacao !== undefined ? { tipoModificacao: d.tipoModificacao } : {}) }, contrato.id, contrato.numero)); }}
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
  'AL-NOTA-CREDITO-PENDENTE': { rot: 'Registar nota de crédito', destino: 'FATURACAO' },
};
