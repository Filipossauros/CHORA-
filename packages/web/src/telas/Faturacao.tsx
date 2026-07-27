import { useRef, useState, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import { jsPDF } from 'jspdf';
import { estadoEntregavel, type Contrato, type Entregavel, type Fatura, type TipoFaturacao } from '@chora/domain';
import { app, nomeAzure } from '../porta/aplicacao-local.js';
import { Cabecalho } from '../app/Shell.js';
import { Estado, eurosParaCent, formatarHoras, formatarMoeda, hoje, mensagemErro, useAsync } from '../comum.js';

interface LinhaConf { perfilId?: string; recursoId?: string; quantidadeFatura: number; quantidadeAprovada: number; valorFatura: number; valorAprovado: number }
interface Conferencia {
  linhas: LinhaConf[];
  conforme: boolean;
  montanteConferido: number;
  montanteLiquido: number;
  entregavel?: { designacao: string; valor: number; entregue: boolean; entregueEm?: string };
  licenciamento?: { precoContratual: number; vigencia?: { de: string; ate: string } };
  motivo?: string;
}
interface Relatorio { decisao: string; motivo?: string; frase: string; geradoEm: string }
type TipoDoc = 'FATURA' | 'RELATORIO_HORAS_FORNECEDOR' | 'FATURA_COM_RELATORIO' | 'AUTO_ENTREGA' | 'NOTA_CREDITO';

const ROT_TIPO: Record<TipoFaturacao, string> = {
  BOLSA_HORAS: 'Bolsa de horas', ENTREGAVEL: 'Entregável', LICENCIAMENTO: 'Licenciamento',
};

/**
 * O que o contrato determina que se está a faturar. É o contrato que sabe: num
 * licenciamento só há um tipo, e num chave-na-mão fatura-se o entregável que
 * está entregue por liquidar — sobrando a bolsa de horas para o resto.
 */
function tipoSugerido(contrato: Contrato | null, faturaveis: Entregavel[]): TipoFaturacao {
  if (contrato?.tipologia === 'LICENCIAMENTO') return 'LICENCIAMENTO';
  if (contrato?.tipologia === 'CHAVE_NA_MAO' && faturaveis.length > 0) return 'ENTREGAVEL';
  return 'BOLSA_HORAS';
}

/**
 * Documentos que a conferência exige (RN-602). A fatura e o relatório de horas
 * podem vir no mesmo ficheiro — é como chegam muitas vezes —, e então basta um.
 */
function documentosExigidos(tipo: TipoFaturacao, ficheiroUnico: boolean): Array<{ tipo: TipoDoc; rot: string }> {
  if (tipo === 'LICENCIAMENTO') return [{ tipo: 'FATURA', rot: 'Fatura (PDF)' }];
  if (tipo === 'ENTREGAVEL') {
    return [{ tipo: 'FATURA', rot: 'Fatura (PDF)' }, { tipo: 'AUTO_ENTREGA', rot: 'Auto de entrega (PDF)' }];
  }
  return ficheiroUnico
    ? [{ tipo: 'FATURA_COM_RELATORIO', rot: 'Fatura e relatório de horas (PDF único)' }]
    : [{ tipo: 'FATURA', rot: 'Fatura (PDF)' }, { tipo: 'RELATORIO_HORAS_FORNECEDOR', rot: 'Relatório de horas (PDF)' }];
}

async function sha256(file: File): Promise<string> {
  const hash = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Carregador de PDF, reutilizado pelo formulário e pela nota de crédito. */
function Dropzone({ id, rot, ficheiro, onFicheiro, ativo }: {
  id: string; rot: string; ficheiro?: File; onFicheiro: (f: File) => void; ativo: boolean;
}): ReactNode {
  const ref = useRef<HTMLInputElement | null>(null);
  return (
    <div>
      <div className="campo" style={{ margin: 0 }}><label>{rot}</label></div>
      <div className={`dropzone${ficheiro !== undefined ? ' ok' : ''}`} onClick={() => ativo && ref.current?.click()} style={{ cursor: ativo ? 'pointer' : 'default' }} data-doc={id}>
        {ficheiro !== undefined ? <b>✓ {ficheiro.name}</b> : <>Arraste ou clique para carregar o PDF</>}
      </div>
      <input ref={ref} type="file" accept="application/pdf" style={{ display: 'none' }} onChange={(e) => { const f = e.target.files?.[0]; if (f !== undefined) onFicheiro(f); e.target.value = ''; }} />
    </div>
  );
}

/**
 * CONFERÊNCIA DE FATURAS.
 *
 * As faturas entram à mão, uma de cada vez — a aplicação não tem acesso ao
 * sistema de faturação da empresa —, pelo que o ecrã abre no FORMULÁRIO e não
 * numa fila: registar é a única coisa que se pode fazer sem uma fatura em mão.
 * Registar corre a conferência determinística e apresenta o veredito no mesmo
 * ecrã: não há passo intermédio, porque não há decisão pelo meio.
 *
 * A única coisa que fica mesmo pendente é a fatura errada à espera de nota de
 * crédito — e essa aparece em destaque no topo, porque é a que exige uma
 * diligência junto do fornecedor.
 */
export function Faturacao({ inicial, embebido = false }: {
  /** Valores iniciais do formulário — usado quando o ecrã é montado no chat. */
  inicial?: Partial<{ numero: string; numeroContrato: string; nifPrestador: string; montanteSemIva: string }>;
  /**
   * Montado dentro da conversa: sem cabeçalho próprio e sem o histórico
   * lateral. É o MESMO componente, não uma cópia — é isso que impede o fluxo do
   * chat de divergir do fluxo do ecrã.
   */
  embebido?: boolean;
} = {}): ReactNode {
  const podeGerir = app.papeisAtuais().includes('GESTOR_CONTRATO');
  const [params] = useSearchParams();
  const [faturaId, setFaturaId] = useState('');
  const [conf, setConf] = useState<Conferencia>();
  const [relatorio, setRelatorio] = useState<Relatorio>();
  const [motivo, setMotivo] = useState('');
  const [erro, setErro] = useState<string>();
  const [nova, setNova] = useState({
    numero: inicial?.numero ?? '',
    numeroContrato: inicial?.numeroContrato ?? params.get('contrato') ?? '',
    nifPrestador: inicial?.nifPrestador ?? '',
    periodoDe: '', periodoAte: '',
    montanteSemIva: inicial?.montanteSemIva ?? '', montanteIva: '',
    tipo: undefined as TipoFaturacao | undefined, entregavelId: '', ficheiroUnico: true,
  });
  const [pend, setPend] = useState<Partial<Record<TipoDoc, File>>>({});

  const base = useAsync(async () => {
    const contratos = await app.ctx.repos.contratos.todos();
    // O contrato vem do DOCUMENTO, não de um seletor: é a fatura que diz a que
    // contrato pertence. Enquanto o número não resolver, não há contrato.
    const contrato = await app.faturas.contratoPorNumero(nova.numeroContrato);
    const cid = contrato?.id ?? '';
    const faturas = await app.ctx.repos.faturas.todos();
    const fatura = faturaId !== '' ? await app.ctx.repos.faturas.obter(faturaId) : null;
    const entregaveis = contrato?.tipologia === 'CHAVE_NA_MAO' ? await app.entregaveis.listar(cid) : [];
    return { contratos, cid, contrato, faturas, fatura, entregaveis };
  }, [nova.numeroContrato, faturaId, relatorio, conf]);

  if (base.dados === undefined) return <p className="vazio">A carregar…</p>;
  const { contratos, cid, contrato, faturas, fatura, entregaveis } = base.dados;
  const numeroContrato = (id: string): string => contratos.find((c) => c.id === id)?.numero ?? id;
  const nifConfere = contrato !== null && nova.nifPrestador.trim() === contrato.prestador.nipc;
  const faturaveis = entregaveis.filter((e: Entregavel) => estadoEntregavel(e) === 'ENTREGUE');
  const tipo = nova.tipo ?? tipoSugerido(contrato, faturaveis);
  const entregavelSel = faturaveis.find((e: Entregavel) => e.id === nova.entregavelId);
  const docs = documentosExigidos(tipo, nova.ficheiroUnico);
  const aguardam = faturas.filter((f) => f.estado === 'AGUARDA_NOTA_CREDITO');

  function limpar(): void {
    setFaturaId(''); setPend({}); setConf(undefined); setRelatorio(undefined); setMotivo(''); setErro(undefined);
    setNova({
      numero: '', numeroContrato: '', nifPrestador: '', periodoDe: '', periodoAte: '',
      montanteSemIva: '', montanteIva: '', tipo: undefined, entregavelId: '', ficheiroUnico: true,
    });
  }

  /** Regista a fatura e confere-a: um clique, um veredito. */
  async function registarEConferir(): Promise<void> {
    setErro(undefined);
    const semIva = eurosParaCent(nova.montanteSemIva); const iva = eurosParaCent(nova.montanteIva);
    if (contrato === null) {
      setErro('Indique um nº de contrato que exista: é o contrato que a fatura liquida (RN-613).'); return;
    }
    if (!nifConfere) {
      setErro(`O NIF indicado não é o do adjudicatário deste contrato (${contrato.prestador.nipc}) — verifique se a fatura é mesmo deste contrato (RN-613).`); return;
    }
    if (nova.numero.trim() === '' || nova.periodoDe === '' || nova.periodoAte === '' || semIva === 0) {
      setErro('Indique o nº da fatura, o período e o montante s/ IVA.'); return;
    }
    if (tipo === 'ENTREGAVEL' && nova.entregavelId === '') {
      setErro('Uma fatura de entregável tem de identificar o entregável que liquida (RN-608).'); return;
    }
    const emFalta = docs.filter((d) => pend[d.tipo] === undefined);
    if (emFalta.length > 0) { setErro(`Falta carregar: ${emFalta.map((d) => d.rot).join(', ')}.`); return; }

    try {
      const u = app.utilizador();
      const ano = Number(hoje().slice(0, 4));
      // Auto-compromisso a cobrir a fatura (LCPA / RN-601), para prototipagem.
      const comp = await app.faturas.criarCompromisso(cid, `CMP-${nova.numero}`, Math.abs(semIva), ano, hoje(), u);
      const documentos = [];
      for (const d of docs) {
        const file = pend[d.tipo]!;
        documentos.push({
          tipo: d.tipo, ficheiroRef: `arq://${nova.numero}/${d.tipo}`, nomeOriginal: file.name,
          hashSha256: await sha256(file), tamanhoBytes: file.size,
          recebidoEm: app.ctx.relogio.agora(), carregadoPor: u.utilizadorId,
        });
      }
      const r = await app.faturas.receberEConferir(cid, {
        compromissoId: comp.id, numero: nova.numero.trim(),
        numeroContratoIndicado: nova.numeroContrato.trim(), nifPrestadorIndicado: nova.nifPrestador.trim(),
        dataEmissao: hoje(), dataRececao: hoje(), periodoDe: nova.periodoDe, periodoAte: nova.periodoAte,
        montanteSemIva: semIva, montanteIva: Number.isFinite(iva) ? iva : 0,
        tipo, ...(tipo === 'ENTREGAVEL' ? { entregavelId: nova.entregavelId } : {}),
        documentos,
      }, u);
      setFaturaId(r.fatura.id);
      setConf(r.conferencia as Conferencia);
      setMotivo(r.conferencia.motivo ?? '');
      base.recarregar();
    } catch (e) { setErro(mensagemErro(e)); }
  }

  /** Abre uma fatura já registada, correndo logo a conferência. */
  async function abrir(id: string): Promise<void> {
    setErro(undefined); setFaturaId(id); setRelatorio(undefined);
    try {
      const r = await app.faturas.conferir(id) as Conferencia;
      setConf(r); setMotivo(r.motivo ?? '');
    } catch (e) { setErro(mensagemErro(e)); setConf(undefined); }
  }

  async function decidir(decisao: 'VALIDADA' | 'INVALIDADA'): Promise<void> {
    if (fatura === null) return;
    setErro(undefined);
    try {
      const r = await app.faturas.decidir(fatura.id, decisao, decisao === 'INVALIDADA' ? motivo : undefined, app.utilizador()) as { relatorio: Relatorio };
      setRelatorio(r.relatorio);
    } catch (e) { setErro(mensagemErro(e)); }
  }

  async function aguardarNota(): Promise<void> {
    if (fatura === null) return;
    setErro(undefined);
    try {
      await app.faturas.aguardarNotaCredito(fatura.id, motivo.trim().length > 0 ? motivo : 'Montante faturado acima do apurado na conferência.', app.utilizador());
      setConf(undefined); setFaturaId(''); base.recarregar();
    } catch (e) { setErro(mensagemErro(e)); }
  }

  function descarregarPdf(): void {
    if (relatorio === undefined || fatura === null) return;
    const doc = new jsPDF();
    doc.setFontSize(15); doc.text('CHORA+ · Relatório de evidência de conferência', 15, 20);
    doc.setFontSize(11);
    doc.text(`Fatura: ${fatura.numero}`, 15, 32);
    doc.text(`Contrato: ${numeroContrato(fatura.contratoId)}`, 15, 39);
    doc.text(`Tipo de faturação: ${ROT_TIPO[fatura.tipo]}`, 15, 46);
    doc.text(`Período: ${fatura.periodoDe} a ${fatura.periodoAte}`, 15, 53);
    doc.text(`Decisão: ${relatorio.decisao}`, 15, 60);
    let y = 67;
    if (fatura.notaCredito !== undefined) {
      doc.text(`Nota de crédito: ${fatura.notaCredito.numero} · ${formatarMoeda(fatura.notaCredito.montante)}`, 15, y); y += 7;
    }
    if (relatorio.motivo !== undefined) { doc.text(doc.splitTextToSize(`Motivo: ${relatorio.motivo}`, 180), 15, y); y += 14; }
    doc.setFontSize(10);
    doc.text(doc.splitTextToSize(relatorio.frase, 180), 15, y + 12);
    doc.setFontSize(8); doc.text(`Gerado em ${relatorio.geradoEm}`, 15, 285);
    doc.save(`relatorio-evidencia-${fatura.numero}.pdf`);
  }

  const decidida = fatura !== null && ['VALIDADA', 'INVALIDADA'].includes(fatura.estado);

  return (
    <>
      {!embebido && (
        <Cabecalho titulo="Conferência de faturas" sub="Registar · conferir · decidir" acoes={
          fatura !== null ? <button className="btn" onClick={limpar}>+ Nova fatura</button> : undefined
        } />
      )}
      {erro !== undefined && <div className="erro-cx">⚠ {erro}</div>}

      {/* Único pendente possível: a fatura errada à espera da nota de crédito. */}
      {!embebido && fatura === null && aguardam.length > 0 && (
        <div className="cartao" style={{ marginBottom: 16, borderLeft: '3px solid var(--ambar)' }}>
          <h3>A aguardar nota de crédito<span className="sec" style={{ marginLeft: 8, fontWeight: 400 }}>{aguardam.length} fatura(s) por conferir</span></h3>
          <table><tbody>
            {aguardam.map((f) => (
              <tr key={f.id}>
                <td className="prim">{f.numero}<div className="sec">{f.notaCredito?.motivo ?? 'em espera'}</div></td>
                <td>{numeroContrato(f.contratoId)}</td>
                <td className="num tabnum">faturado {formatarMoeda(f.montanteSemIva)}</td>
                <td className="num tabnum">nota esperada {formatarMoeda(f.notaCredito?.montante ?? 0)}</td>
                <td className="sec">em espera desde {f.notaCredito?.registadaEm ?? f.dataRececao}</td>
                <td style={{ textAlign: 'right' }}><button className="btn sm pri" disabled={!podeGerir} onClick={() => void abrir(f.id)}>Registar nota de crédito</button></td>
              </tr>
            ))}
          </tbody></table>
        </div>
      )}

      {/* ── REGISTO MANUAL ─────────────────────────────────────────────────── */}
      {fatura === null && (
        <div style={{ display: 'grid', gridTemplateColumns: embebido ? '1fr' : '1fr 300px', gap: 16 }}>
          <div className="cartao"><h3>Registar fatura{contrato !== null && <span className="pill p-azul" style={{ marginLeft: 8 }}>{ROT_TIPO[tipo]}</span>}</h3><div className="corpo">
            {!podeGerir && <div className="aviso">Só o gestor de contrato confere faturas.</div>}

            {/* IDENTIFICAÇÃO — o que vem no documento. É daqui que sai o contrato. */}
            <div className="g3">
              <div className="campo"><label>Nº da fatura *</label><input value={nova.numero} onChange={(e) => setNova({ ...nova, numero: e.target.value })} placeholder="FT-2026-010" /></div>
              <div className="campo"><label>Nº do contrato *</label><input value={nova.numeroContrato} onChange={(e) => setNova({ ...nova, numeroContrato: e.target.value, tipo: undefined, entregavelId: '' })} placeholder="C-2026-001" /></div>
              <div className="campo"><label>NIF do prestador *</label><input value={nova.nifPrestador} onChange={(e) => setNova({ ...nova, nifPrestador: e.target.value })} placeholder="500000001" /></div>
            </div>
            <Identificacao contrato={contrato} numeroIndicado={nova.numeroContrato} nifConfere={nifConfere} nifIndicado={nova.nifPrestador} tipo={tipo} />

            {contrato !== null && (
            <div className="aviso" style={{ marginBottom: 12 }}>
              O tipo é determinado pelo contrato ({contrato.tipologia === 'CHAVE_NA_MAO' ? 'chave-na-mão' : contrato.tipologia === 'LICENCIAMENTO' ? 'licenciamento' : 'bolsa de horas'}
              {tipo === 'ENTREGAVEL' ? ', com entregáveis por faturar' : ''}). Retifique-o se este caso for exceção.
              {' '}
              <select value={tipo} onChange={(e) => setNova({ ...nova, tipo: e.target.value as TipoFaturacao, entregavelId: '' })} style={{ marginTop: 6 }}>
                {(['BOLSA_HORAS', 'ENTREGAVEL', 'LICENCIAMENTO'] as TipoFaturacao[]).map((t) => <option key={t} value={t}>{ROT_TIPO[t]}</option>)}
              </select>
            </div>
            )}

            {tipo === 'ENTREGAVEL' && (
              faturaveis.length === 0
                ? <div className="erro-cx" style={{ marginBottom: 10 }}>Não há entregáveis assinalados como entregues e por faturar. A entrega é o facto gerador da faturação <code>RN-608</code>.</div>
                : (
                  <div className="campo"><label>Entregável a liquidar *</label>
                    <select value={nova.entregavelId} onChange={(e) => { const sel = faturaveis.find((x: Entregavel) => x.id === e.target.value); setNova({ ...nova, entregavelId: e.target.value, ...(sel !== undefined ? { montanteSemIva: String(sel.valor / 100) } : {}) }); }}>
                      <option value="">— selecionar —</option>
                      {faturaveis.map((e: Entregavel) => <option key={e.id} value={e.id}>{e.designacao} · {formatarMoeda(e.valor)}</option>)}
                    </select>
                    {entregavelSel !== undefined && <div className="sec" style={{ marginTop: 4 }}>Entregue em {entregavelSel.entregueEm ?? '—'}. O montante tem de ser exatamente {formatarMoeda(entregavelSel.valor)} <code>RN-609</code>.</div>}
                  </div>
                )
            )}
            {tipo === 'LICENCIAMENTO' && (
              <div className="aviso" style={{ marginBottom: 10 }}>
                O licenciamento tem uma só fatura, pela totalidade do contrato: <b>{formatarMoeda(contrato?.precoContratualAtual ?? 0)}</b> <code>RN-610</code> <code>RN-611</code>.
                {' '}<button className="ligacao" onClick={() => setNova({ ...nova, montanteSemIva: String((contrato?.precoContratualAtual ?? 0) / 100) })}>usar este valor</button>
              </div>
            )}

            <div className="g2">
              <div className="campo"><label>Período de *</label><input type="date" value={nova.periodoDe} onChange={(e) => setNova({ ...nova, periodoDe: e.target.value })} /></div>
              <div className="campo"><label>Período até *</label><input type="date" value={nova.periodoAte} onChange={(e) => setNova({ ...nova, periodoAte: e.target.value })} /></div>
            </div>
            <div className="g2">
              <div className="campo"><label>Montante s/ IVA (€) *</label><input type="number" step="0.01" value={nova.montanteSemIva} onChange={(e) => setNova({ ...nova, montanteSemIva: e.target.value })} /></div>
              <div className="campo"><label>IVA (€)</label><input type="number" min={0} step="0.01" value={nova.montanteIva} onChange={(e) => setNova({ ...nova, montanteIva: e.target.value })} /></div>
            </div>

            {tipo === 'BOLSA_HORAS' && (
              <label className="check" style={{ display: 'flex', gap: 8, alignItems: 'center', margin: '0 0 10px' }}>
                <input type="checkbox" checked={nova.ficheiroUnico} onChange={(e) => { setNova({ ...nova, ficheiroUnico: e.target.checked }); setPend({}); }} />
                A fatura e o relatório de horas vêm no mesmo ficheiro
              </label>
            )}

            <div className={docs.length > 1 ? 'g2' : ''}>
              {docs.map(({ tipo: t, rot }) => (
                <Dropzone key={t} id={t} rot={rot} ficheiro={pend[t]} ativo={podeGerir} onFicheiro={(f) => setPend((s) => ({ ...s, [t]: f }))} />
              ))}
            </div>

            <div className="aviso" style={{ margin: '10px 0 12px' }}>Os PDF são selados pelo hash SHA-256 <code>RN-602-A</code>. Ao registar, a aplicação confere de imediato contra os elementos de execução aprovados e apresenta o veredito.</div>
            <button className="btn pri" disabled={!podeGerir || contrato === null} onClick={() => void registarEConferir()}>Registar e conferir →</button>
          </div></div>

          {!embebido && <HistoricoFaturas faturas={faturas} numeroContrato={numeroContrato} onAbrir={(id) => void abrir(id)} />}
        </div>
      )}

      {/* ── CONFERÊNCIA E DECISÃO ──────────────────────────────────────────── */}
      {fatura !== null && (
        <>
          <div className="cartao" style={{ marginBottom: 16 }}>
            <h3>
              {fatura.numero}
              <span className="pill p-azul" style={{ marginLeft: 8 }}>{ROT_TIPO[fatura.tipo]}</span>
              <span className="sec" style={{ marginLeft: 8, fontWeight: 400 }}>{numeroContrato(fatura.contratoId)} · {fatura.periodoDe} a {fatura.periodoAte}</span>
              <span style={{ marginLeft: 'auto' }}><Estado v={fatura.estado} /></span>
            </h3>
            <div className="corpo"><Documentos fatura={fatura} /></div>
          </div>

          {fatura.estado === 'AGUARDA_NOTA_CREDITO' && (
            <NotaCredito fatura={fatura} podeGerir={podeGerir} onErro={setErro} onFeito={(id) => { void abrir(id); base.recarregar(); }} />
          )}

          {!decidida && fatura.estado !== 'AGUARDA_NOTA_CREDITO' && conf !== undefined && (
            <div className="cartao"><h3>Conferência <code>{fatura.tipo === 'ENTREGAVEL' ? 'RN-608 · RN-609' : fatura.tipo === 'LICENCIAMENTO' ? 'RN-611' : 'RN-603'}</code>{fatura.notaCredito !== undefined && <code style={{ marginLeft: 6 }}>RN-612</code>}</h3><div className="corpo">
              <Veredito fatura={fatura} conf={conf} />

              {fatura.tipo === 'BOLSA_HORAS' && (
                <table>
                  <thead><tr><th>Perfil · Recurso</th><th className="num">Qt. fatura</th><th className="num">Qt. aprovada</th><th className="num">€ fatura</th><th className="num">€ aprovado</th><th>Resultado</th></tr></thead>
                  <tbody>{conf.linhas.map((l, i) => { const ok = l.quantidadeFatura === l.quantidadeAprovada && l.valorFatura === l.valorAprovado; return (
                    <tr key={i} style={{ background: ok ? undefined : 'var(--vermelho-b)' }}>
                      <td className="prim">{l.perfilId ?? '—'}<div className="sec">{nomeAzure(l.recursoId ?? '')}</div></td>
                      <td className="num">{formatarHoras(l.quantidadeFatura)}</td><td className="num">{formatarHoras(l.quantidadeAprovada)}</td>
                      <td className="num">{formatarMoeda(l.valorFatura)}</td><td className="num">{formatarMoeda(l.valorAprovado)}</td>
                      <td>{ok ? <span className="pill p-verde">Confere</span> : <span className="pill p-verm">Diverge</span>}</td>
                    </tr>
                  ); })}{conf.linhas.length === 0 && <tr><td colSpan={6} className="vazio">Sem registos aprovados no período: nada a comparar.</td></tr>}</tbody>
                </table>
              )}
              {fatura.tipo === 'ENTREGAVEL' && (
                <table>
                  <thead><tr><th>Entregável</th><th>Entregue</th><th className="num">Valor do entregável</th><th className="num">Montante faturado</th><th>Resultado</th></tr></thead>
                  <tbody><tr style={{ background: conf.conforme ? undefined : 'var(--vermelho-b)' }}>
                    <td className="prim">{conf.entregavel?.designacao ?? '—'}</td>
                    <td>{conf.entregavel?.entregue === true ? conf.entregavel.entregueEm ?? 'sim' : 'não'}</td>
                    <td className="num">{formatarMoeda(conf.entregavel?.valor ?? 0)}</td>
                    <td className="num">{formatarMoeda(fatura.montanteSemIva)}</td>
                    <td>{conf.conforme ? <span className="pill p-verde">Confere</span> : <span className="pill p-verm">Diverge</span>}</td>
                  </tr></tbody>
                </table>
              )}
              {fatura.tipo === 'LICENCIAMENTO' && (
                <table>
                  <thead><tr><th>Vigência do licenciamento</th><th className="num">Preço contratual</th><th className="num">Montante faturado</th><th>Resultado</th></tr></thead>
                  <tbody><tr style={{ background: conf.conforme ? undefined : 'var(--vermelho-b)' }}>
                    <td className="tabnum">{conf.licenciamento?.vigencia !== undefined ? `${conf.licenciamento.vigencia.de} a ${conf.licenciamento.vigencia.ate}` : '—'}</td>
                    <td className="num">{formatarMoeda(conf.licenciamento?.precoContratual ?? 0)}</td>
                    <td className="num">{formatarMoeda(fatura.montanteSemIva)}</td>
                    <td>{conf.conforme ? <span className="pill p-verde">Confere</span> : <span className="pill p-verm">Diverge</span>}</td>
                  </tr></tbody>
                </table>
              )}

              <Decisao
                conforme={conf.conforme} podeGerir={podeGerir} motivo={motivo} onMotivo={setMotivo}
                temNotaCredito={fatura.notaCredito !== undefined}
                onValidar={() => void decidir('VALIDADA')}
                onInvalidar={() => void decidir('INVALIDADA')}
                onAguardar={() => void aguardarNota()}
              />
            </div></div>
          )}

          {/* ── ENCERRAMENTO ─────────────────────────────────────────────── */}
          {decidida && (
            relatorio !== undefined ? (
              <div className="cartao"><h3>Encerramento · {relatorio.decisao} <code>RN-604</code></h3><div className="corpo">
                <p className="sec" style={{ marginTop: 0 }}>Nº da fatura registado: <b>{fatura.numero}</b>. A frase abaixo e o PDF do relatório são o produto da conferência — é o que segue para o sistema de faturação da empresa.</p>
                {relatorio.motivo !== undefined && <div className="campo" style={{ margin: '0 0 10px' }}><label>Motivo da invalidação</label><div style={{ fontSize: 13 }}>{relatorio.motivo}</div></div>}
                <div className="frase-legal">{relatorio.frase}</div>
                <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                  <button className="btn" onClick={() => void navigator.clipboard?.writeText(relatorio.frase)}>Copiar frase</button>
                  <button className="btn pri" onClick={descarregarPdf}>Descarregar PDF do relatório</button>
                </div>
              </div></div>
            ) : (
              <div className="cartao"><div className="corpo">
                Fatura <b>{fatura.estado.toLowerCase()}</b> em {fatura.dataAprovacao ?? '—'}, no montante aprovado de <b>{formatarMoeda(fatura.montanteAprovado ?? 0)}</b>.
                {fatura.relatorioEvidenciaId !== undefined && <div className="sec" style={{ marginTop: 6 }}>O relatório de evidência foi arquivado na decisão.</div>}
              </div></div>
            )
          )}
        </>
      )}
    </>
  );
}

/**
 * CONFIRMAÇÃO DA IDENTIFICAÇÃO.
 *
 * Resolvido o número, mostra-se o que a base sabe daquele contrato: objeto,
 * prestador, valor por faturar. Não é decoração — é a confirmação de que quem
 * regista está no contrato certo, feita antes de escrever montantes. E o NIF
 * confronta-se aqui, porque uma fatura do fornecedor certo no contrato errado
 * passa despercebida quando só se olha para o número.
 */
function Identificacao({ contrato, numeroIndicado, nifIndicado, nifConfere, tipo }: {
  contrato: Contrato | null; numeroIndicado: string; nifIndicado: string; nifConfere: boolean; tipo: TipoFaturacao;
}): ReactNode {
  if (numeroIndicado.trim() === '') {
    return (
      <div className="aviso" style={{ marginBottom: 12 }}>
        Comece pelo número do contrato que vem na fatura: é ele que determina o contrato, o tipo de faturação e os
        documentos exigidos <code>RN-613</code>.
      </div>
    );
  }
  if (contrato === null) {
    return <div className="erro-cx" style={{ marginBottom: 12 }}>Não há nenhum contrato com o número <b>{numeroIndicado}</b>. Verifique o documento.</div>;
  }
  const cor = nifConfere ? 'var(--verde)' : nifIndicado.trim() === '' ? 'var(--linha-forte)' : 'var(--vermelho)';
  return (
    <div style={{ border: `1px solid ${cor}`, borderLeft: `3px solid ${cor}`, borderRadius: 9, padding: '10px 13px', marginBottom: 12, background: 'var(--superficie)', fontSize: 12.5 }}>
      <div className="prim" style={{ fontSize: 13 }}>{contrato.numero} · {contrato.objeto}</div>
      <div className="sec" style={{ marginTop: 3 }}>
        {contrato.prestador.nome} · NIF {contrato.prestador.nipc}
        {nifIndicado.trim() === ''
          ? ''
          : nifConfere
            ? ' — ✓ confere com a fatura'
            : ` — ⚠ a fatura indica ${nifIndicado}: não é o adjudicatário deste contrato`}
      </div>
      <div className="sec" style={{ marginTop: 3 }}>
        {ROT_TIPO[tipo]} · valor contratual {formatarMoeda(contrato.precoContratualAtual)} · vigência até {contrato.dataTerminoContratual}
      </div>
    </div>
  );
}

/**
 * VEREDITO em números, antes da tabela. Quem confere quer saber primeiro se bate
 * certo e por quanto; o detalhe linha a linha serve para perceber ONDE — não é
 * por onde se começa a ler.
 */
function Veredito({ fatura, conf }: { fatura: Fatura; conf: Conferencia }): ReactNode {
  const nc = fatura.notaCredito;
  const diferenca = conf.montanteLiquido - conf.montanteConferido;
  const cor = conf.conforme ? 'var(--verde)' : 'var(--vermelho)';
  return (
    <div style={{ border: `1px solid ${cor}`, borderLeft: `3px solid ${cor}`, borderRadius: 9, padding: '11px 13px', marginBottom: 14, background: 'var(--superficie)' }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 22, alignItems: 'baseline' }}>
        <Total rot="Faturado" v={fatura.montanteSemIva} />
        {nc !== undefined && <Total rot={`Nota de crédito ${nc.numero}`} v={-nc.montante} />}
        {nc !== undefined && <Total rot="Líquido" v={conf.montanteLiquido} forte />}
        <Total rot="Apurado na conferência" v={conf.montanteConferido} forte />
        <div style={{ marginLeft: 'auto', fontWeight: 700, fontSize: 13, color: cor }}>
          {conf.conforme ? '✓ Confere' : `Diferença de ${formatarMoeda(Math.abs(diferenca))} ${diferenca > 0 ? 'a mais' : 'a menos'}`}
        </div>
      </div>
      {!conf.conforme && conf.motivo !== undefined && (
        <div className="sec" style={{ marginTop: 8, fontSize: 12.5 }}>{conf.motivo}</div>
      )}
    </div>
  );
}

function Total({ rot, v, forte }: { rot: string; v: number; forte?: boolean }): ReactNode {
  return (
    <div>
      <div className="sec" style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '.03em' }}>{rot}</div>
      <div className="tabnum" style={{ fontSize: 15, fontWeight: forte === true ? 700 : 500 }}>{formatarMoeda(v)}</div>
    </div>
  );
}

/**
 * DECISÃO. Quando confere, o caminho é um só e o motivo fica colapsado — pedir
 * um motivo de invalidação a quem vai validar é ruído. Quando diverge, há três
 * saídas, e a que interessa quase sempre é a do meio: a fatura está errada, mas
 * vai ser corrigida por nota de crédito em vez de invalidada.
 */
function Decisao({ conforme, podeGerir, motivo, onMotivo, temNotaCredito, onValidar, onInvalidar, onAguardar }: {
  conforme: boolean; podeGerir: boolean; motivo: string; onMotivo: (m: string) => void; temNotaCredito: boolean;
  onValidar: () => void; onInvalidar: () => void; onAguardar: () => void;
}): ReactNode {
  const [abertoMotivo, setAbertoMotivo] = useState(!conforme);
  return (
    <div style={{ marginTop: 14, paddingTop: 13, borderTop: '1px solid var(--linha)' }}>
      {conforme && !abertoMotivo && (
        <button className="btn sm" style={{ marginBottom: 10 }} onClick={() => setAbertoMotivo(true)}>Invalidar mesmo assim…</button>
      )}
      {abertoMotivo && (
        <div className="campo"><label>Motivo {conforme ? 'da invalidação' : '— redigido a partir da divergência; reveja antes de decidir'}</label>
          <textarea rows={3} value={motivo} onChange={(e) => onMotivo(e.target.value)} placeholder="Motivo…" />
        </div>
      )}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <button className="btn pri" disabled={!conforme || !podeGerir} onClick={onValidar}>
          {temNotaCredito ? 'Validar fatura e nota de crédito' : 'Validar'}
        </button>
        {!conforme && !temNotaCredito && (
          <button className="btn" disabled={!podeGerir} onClick={onAguardar}>Aguardar nota de crédito</button>
        )}
        {abertoMotivo && (
          <button className="btn" style={{ borderColor: 'var(--vermelho)', color: 'var(--vermelho)' }} disabled={motivo.trim() === '' || !podeGerir} onClick={onInvalidar}>Invalidar</button>
        )}
      </div>
      {!conforme && !temNotaCredito && (
        <div className="sec" style={{ marginTop: 9, fontSize: 12.5 }}>
          A validação está bloqueada enquanto houver divergência. Se o fornecedor vai corrigir por nota de crédito,
          ponha a fatura em espera: quando a nota chegar, decide-se tudo de uma vez <code>RN-612</code>.
        </div>
      )}
    </div>
  );
}

/**
 * REGISTO DA NOTA DE CRÉDITO. A fatura ficou por conferir à espera dela; ao
 * registá-la (com o PDF), a fatura volta à conferência para que ambas sejam
 * decididas em simultâneo.
 */
function NotaCredito({ fatura, podeGerir, onErro, onFeito }: {
  fatura: Fatura; podeGerir: boolean; onErro: (m?: string) => void; onFeito: (id: string) => void;
}): ReactNode {
  const esperado = fatura.notaCredito?.montante ?? 0;
  const [f, setF] = useState({ numero: '', montante: String(esperado / 100), motivo: fatura.notaCredito?.motivo ?? '' });
  const [pdf, setPdf] = useState<File>();

  async function registar(): Promise<void> {
    onErro();
    if (f.numero.trim() === '') { onErro('Indique o número da nota de crédito.'); return; }
    if (pdf === undefined) { onErro('Carregue o PDF da nota de crédito: sem ele a decisão não fica documentada (RN-612).'); return; }
    try {
      const u = app.utilizador();
      await app.faturas.registarNotaCredito(fatura.id, {
        numero: f.numero.trim(), montante: eurosParaCent(f.montante), motivo: f.motivo,
        documento: {
          tipo: 'NOTA_CREDITO', ficheiroRef: `arq://${fatura.numero}/NOTA_CREDITO`, nomeOriginal: pdf.name,
          hashSha256: await sha256(pdf), tamanhoBytes: pdf.size,
          recebidoEm: app.ctx.relogio.agora(), carregadoPor: u.utilizadorId,
        },
      }, u);
      onFeito(fatura.id);
    } catch (e) { onErro(mensagemErro(e)); }
  }

  return (
    <div className="cartao"><h3>Nota de crédito <code>RN-612</code></h3><div className="corpo">
      <div className="aviso" style={{ marginBottom: 12 }}>
        Esta fatura está por conferir desde {fatura.notaCredito?.registadaEm ?? fatura.dataRececao}: {fatura.notaCredito?.motivo}
        {' '}Registe a nota de crédito recebida — a fatura volta à conferência e ambas são decididas de uma só vez.
      </div>
      <div className="g3">
        <div className="campo"><label>Nº da nota de crédito *</label><input value={f.numero} onChange={(e) => setF({ ...f, numero: e.target.value })} placeholder="NC-2026-004" /></div>
        <div className="campo"><label>Montante (€) *</label><input type="number" step="0.01" value={f.montante} onChange={(e) => setF({ ...f, montante: e.target.value })} /></div>
        <div className="campo"><label>Motivo</label><input value={f.motivo} onChange={(e) => setF({ ...f, motivo: e.target.value })} /></div>
      </div>
      <Dropzone id="NOTA_CREDITO" rot="Nota de crédito (PDF) *" ficheiro={pdf} ativo={podeGerir} onFicheiro={setPdf} />
      <div className="sec" style={{ margin: '8px 0 12px', fontSize: 12.5 }}>
        Esperada uma nota de {formatarMoeda(esperado)}, para que o líquido corresponda ao apurado na conferência.
      </div>
      <button className="btn pri" disabled={!podeGerir} onClick={() => void registar()}>Registar nota de crédito e conferir →</button>
    </div></div>
  );
}

/** Documentos da fatura, colapsados: só interessam quando se duvida do arquivo. */
function Documentos({ fatura }: { fatura: Fatura }): ReactNode {
  const [aberto, setAberto] = useState(false);
  return (
    <div style={{ fontSize: 12.5, color: 'var(--texto-suave)' }}>
      Montante s/ IVA {formatarMoeda(fatura.montanteSemIva)} · IVA {formatarMoeda(fatura.montanteIva)}
      {fatura.notaCredito !== undefined && <> · nota de crédito {formatarMoeda(fatura.notaCredito.montante)}</>}
      {' · '}
      <button className="ligacao" onClick={() => setAberto(!aberto)}>{aberto ? '▾' : '▸'} {fatura.documentos.length} documento(s)</button>
      {aberto && (
        <table style={{ marginTop: 8 }}><tbody>
          {fatura.documentos.map((d) => (
            <tr key={d.tipo}>
              <td className="prim">{d.nomeOriginal}<div className="sec">{d.tipo.toLowerCase().replace(/_/g, ' ')}</div></td>
              <td className="sec tabnum" style={{ fontSize: 11 }}>sha256 {d.hashSha256.slice(0, 16)}…</td>
              <td className="sec num">{Math.round(d.tamanhoBytes / 1024)} kB</td>
            </tr>
          ))}
          {fatura.documentos.length === 0 && <tr><td className="vazio">Sem documentos.</td></tr>}
        </tbody></table>
      )}
    </div>
  );
}

/** Faturas já registadas — histórico transversal, não fila de trabalho. */
function HistoricoFaturas({ faturas, numeroContrato, onAbrir }: { faturas: Fatura[]; numeroContrato: (id: string) => string; onAbrir: (id: string) => void }): ReactNode {
  const ordenadas = [...faturas].sort((a, b) => ((a.dataAprovacao ?? a.dataRececao) < (b.dataAprovacao ?? b.dataRececao) ? 1 : -1));
  return (
    <div className="cartao"><h3>Faturas registadas<span className="sec" style={{ marginLeft: 8, fontWeight: 400 }}>{faturas.length}</span></h3><table>
      <tbody>
        {ordenadas.map((f) => (
          <tr key={f.id} className="click" onClick={() => onAbrir(f.id)}>
            <td className="prim">{f.numero}<div className="sec">{numeroContrato(f.contratoId)} · {formatarMoeda(f.montanteAprovado ?? f.montanteSemIva)}</div></td>
            <td><Estado v={f.estado} /></td>
          </tr>
        ))}
        {faturas.length === 0 && <tr><td colSpan={2} className="vazio">Ainda não há faturas registadas.</td></tr>}
      </tbody>
    </table></div>
  );
}
