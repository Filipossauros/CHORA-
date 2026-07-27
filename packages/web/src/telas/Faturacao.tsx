import { useRef, useState, type ReactNode } from 'react';
import { jsPDF } from 'jspdf';
import { estadoEntregavel, type Contrato, type Entregavel, type TipoFaturacao } from '@chora/domain';
import { app, nomeAzure } from '../porta/aplicacao-local.js';
import { Cabecalho } from '../app/Shell.js';
import { Estado, eurosParaCent, formatarHoras, formatarMoeda, hoje, mensagemErro, useAsync } from '../comum.js';

interface LinhaConf { perfilId?: string; recursoId?: string; quantidadeFatura: number; quantidadeAprovada: number; valorFatura: number; valorAprovado: number }
interface Conferencia {
  linhas: LinhaConf[];
  conforme: boolean;
  entregavel?: { designacao: string; valor: number; entregue: boolean; entregueEm?: string };
  licenciamento?: { precoContratual: number; vigencia?: { de: string; ate: string } };
  motivo?: string;
}
interface Relatorio { decisao: string; motivo?: string; frase: string; geradoEm: string }
type TipoDoc = 'FATURA' | 'RELATORIO_HORAS_FORNECEDOR' | 'FATURA_COM_RELATORIO' | 'AUTO_ENTREGA';

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

/**
 * CONFERÊNCIA DE FATURAS em três passos, e cada um decide alguma coisa:
 * receber (com os documentos), ver o resultado da conferência determinística e
 * decidir, encerrar com a evidência. A receção corre a extração, a passagem a
 * conferência e a própria conferência numa transição — não havia decisão pelo
 * meio que justificasse os três cliques que isto era.
 */
export function Faturacao(): ReactNode {
  const podeGerir = app.papeisAtuais().includes('GESTOR_CONTRATO');
  const [contratoId, setContratoId] = useState('');
  const [faturaId, setFaturaId] = useState('');
  const [conf, setConf] = useState<Conferencia>();
  const [relatorio, setRelatorio] = useState<Relatorio>();
  const [motivo, setMotivo] = useState('');
  const [erro, setErro] = useState<string>();
  const [nova, setNova] = useState({ numero: '', periodoDe: '', periodoAte: '', montanteSemIva: '', montanteIva: '', tipo: undefined as TipoFaturacao | undefined, entregavelId: '', ficheiroUnico: true });
  const [pend, setPend] = useState<Partial<Record<TipoDoc, File>>>({});
  const refs = useRef<Record<string, HTMLInputElement | null>>({});

  const base = useAsync(async () => {
    const contratos = await app.ctx.repos.contratos.todos();
    const cid = contratoId || contratos[0]?.id || '';
    const contrato = cid !== '' ? await app.ctx.repos.contratos.obter(cid) : null;
    const faturas = await app.ctx.repos.faturas.todos((f) => f.contratoId === cid);
    const fatura = faturaId !== '' ? await app.ctx.repos.faturas.obter(faturaId) : null;
    const entregaveis = contrato?.tipologia === 'CHAVE_NA_MAO' ? await app.entregaveis.listar(cid) : [];
    return { contratos, cid, contrato, faturas, fatura, entregaveis };
  }, [contratoId, faturaId, relatorio, conf]);

  if (base.dados === undefined) return <p className="vazio">A carregar…</p>;
  const { contratos, cid, contrato, faturas, fatura, entregaveis } = base.dados;
  const faturaveis = entregaveis.filter((e: Entregavel) => estadoEntregavel(e) === 'ENTREGUE');
  const tipo = nova.tipo ?? tipoSugerido(contrato, faturaveis);
  const entregavelSel = faturaveis.find((e: Entregavel) => e.id === nova.entregavelId);
  const docs = documentosExigidos(tipo, nova.ficheiroUnico);

  function limpar(novoContrato?: string): void {
    const alvo = contratos.find((c) => c.id === (novoContrato ?? cid));
    setFaturaId(''); setPend({}); setConf(undefined); setRelatorio(undefined); setMotivo(''); setErro(undefined);
    setNova({
      numero: '', periodoDe: '', periodoAte: '',
      montanteSemIva: alvo?.tipologia === 'LICENCIAMENTO' ? String(alvo.precoContratualAtual / 100) : '',
      montanteIva: '', tipo: undefined, entregavelId: '', ficheiroUnico: true,
    });
  }

  /** Recebe a fatura e confere-a: um clique, um resultado. */
  async function receberEConferir(): Promise<void> {
    setErro(undefined);
    const semIva = eurosParaCent(nova.montanteSemIva); const iva = eurosParaCent(nova.montanteIva);
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

  /** Reabre a conferência de uma fatura já recebida (retomar do histórico). */
  async function reconferir(id: string): Promise<void> {
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

  function descarregarPdf(): void {
    if (relatorio === undefined || fatura === null) return;
    const doc = new jsPDF();
    doc.setFontSize(15); doc.text('CHORA+ · Relatório de evidência de conferência', 15, 20);
    doc.setFontSize(11);
    doc.text(`Fatura: ${fatura.numero}`, 15, 32);
    doc.text(`Contrato: ${contratos.find((c) => c.id === cid)?.numero ?? cid}`, 15, 39);
    doc.text(`Tipo de faturação: ${ROT_TIPO[fatura.tipo]}`, 15, 46);
    doc.text(`Período: ${fatura.periodoDe} a ${fatura.periodoAte}`, 15, 53);
    doc.text(`Decisão: ${relatorio.decisao}`, 15, 60);
    if (relatorio.motivo !== undefined) doc.text(doc.splitTextToSize(`Motivo: ${relatorio.motivo}`, 180), 15, 67);
    doc.setFontSize(10);
    doc.text(doc.splitTextToSize(relatorio.frase, 180), 15, 85);
    doc.setFontSize(8); doc.text(`Gerado em ${relatorio.geradoEm}`, 15, 285);
    doc.save(`relatorio-evidencia-${fatura.numero}.pdf`);
  }

  const decidida = fatura !== null && ['VALIDADA', 'INVALIDADA'].includes(fatura.estado);
  const passo = fatura === null ? 1 : decidida ? 3 : 2;
  const porDecidir = faturas.filter((f) => f.estado === 'RECEBIDA' || f.estado === 'EM_CONFERENCIA');
  const decididas = faturas.filter((f) => f.estado === 'VALIDADA' || f.estado === 'INVALIDADA' || f.estado === 'DEVOLVIDA');

  return (
    <>
      <Cabecalho titulo="Conferência de faturas" sub="Receber · conferir · decidir" acoes={
        <>
          {fatura !== null && <button className="btn" onClick={() => limpar()}>+ Nova fatura</button>}
          <select value={cid} onChange={(e) => { setContratoId(e.target.value); limpar(e.target.value); }}>
            {contratos.map((c) => <option key={c.id} value={c.id}>{c.numero}</option>)}
          </select>
        </>
      } />
      {erro !== undefined && <div className="erro-cx">⚠ {erro}</div>}

      <div className="stepper">
        {['Receção', 'Conferência e decisão', 'Encerramento'].map((t, i) => (
          <div key={t} className={`passo${passo === i + 1 ? ' ativo' : passo > i + 1 ? ' feito' : ''}`}><span className="n">{passo > i + 1 ? '✓' : i + 1}</span>{t}</div>
        ))}
      </div>

      {/* ── 1 · RECEÇÃO ─────────────────────────────────────────────────── */}
      {fatura === null && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: 16 }}>
          <div className="cartao"><h3>Nova fatura<span className="pill p-azul" style={{ marginLeft: 8 }}>{ROT_TIPO[tipo]}</span></h3><div className="corpo">
            {!podeGerir && <div className="aviso">Só o gestor de contrato confere faturas.</div>}

            <div className="aviso" style={{ marginBottom: 12 }}>
              O tipo é determinado pelo contrato ({contrato?.tipologia === 'CHAVE_NA_MAO' ? 'chave-na-mão' : contrato?.tipologia === 'LICENCIAMENTO' ? 'licenciamento' : 'bolsa de horas'}
              {tipo === 'ENTREGAVEL' ? ', com entregáveis por faturar' : ''}). Retifique-o se este caso for exceção.
              {' '}
              <select value={tipo} onChange={(e) => setNova({ ...nova, tipo: e.target.value as TipoFaturacao, entregavelId: '' })} style={{ marginTop: 6 }}>
                {(['BOLSA_HORAS', 'ENTREGAVEL', 'LICENCIAMENTO'] as TipoFaturacao[]).map((t) => <option key={t} value={t}>{ROT_TIPO[t]}</option>)}
              </select>
            </div>

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
              </div>
            )}

            <div className="g3">
              <div className="campo"><label>Nº da fatura *</label><input value={nova.numero} onChange={(e) => setNova({ ...nova, numero: e.target.value })} placeholder="FT-2026-010" /></div>
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
                <div key={t}>
                  <div className="campo" style={{ margin: 0 }}><label>{rot}</label></div>
                  <div className={`dropzone${pend[t] !== undefined ? ' ok' : ''}`} onClick={() => podeGerir && refs.current[t]?.click()} style={{ cursor: podeGerir ? 'pointer' : 'default' }}>
                    {pend[t] !== undefined ? <b>✓ {pend[t]?.name}</b> : <>Arraste ou clique para carregar o PDF</>}
                  </div>
                  <input ref={(el) => { refs.current[t] = el; }} type="file" accept="application/pdf" style={{ display: 'none' }} onChange={(e) => { const f = e.target.files?.[0]; if (f !== undefined) setPend((s) => ({ ...s, [t]: f })); e.target.value = ''; }} />
                </div>
              ))}
            </div>

            <div className="aviso" style={{ margin: '10px 0 12px' }}>Os PDF são selados pelo hash SHA-256 <code>RN-602-A</code>. Ao receber, a aplicação extrai as linhas dos registos aprovados do período e confere de imediato.</div>
            <button className="btn pri" disabled={!podeGerir} onClick={() => void receberEConferir()}>Receber e conferir →</button>
          </div></div>

          <div className="cartao"><h3>Faturas do contrato</h3><table>
            <tbody>
              {porDecidir.length > 0 && <tr><td colSpan={2} className="sec" style={{ fontWeight: 600 }}>Por decidir</td></tr>}
              {porDecidir.map((f) => <tr key={f.id} className="click" onClick={() => void reconferir(f.id)}><td className="prim">{f.numero}<div className="sec">{ROT_TIPO[f.tipo]} · {formatarMoeda(f.montanteSemIva)}</div></td><td><Estado v={f.estado} /></td></tr>)}
              {decididas.length > 0 && <tr><td colSpan={2} className="sec" style={{ fontWeight: 600, paddingTop: 10 }}>Decididas</td></tr>}
              {decididas.map((f) => <tr key={f.id} className="click" onClick={() => { setFaturaId(f.id); setConf(undefined); setRelatorio(undefined); }}><td className="prim">{f.numero}<div className="sec">{ROT_TIPO[f.tipo]} · {formatarMoeda(f.montanteAprovado ?? f.montanteSemIva)}</div></td><td><Estado v={f.estado} /></td></tr>)}
              {faturas.length === 0 && <tr><td colSpan={2} className="vazio">Sem faturas neste contrato.</td></tr>}
            </tbody>
          </table></div>
        </div>
      )}

      {/* ── 2 · CONFERÊNCIA E DECISÃO ───────────────────────────────────── */}
      {fatura !== null && (
        <>
          <div className="cartao" style={{ marginBottom: 16 }}>
            <h3>
              {fatura.numero}
              <span className="pill p-azul" style={{ marginLeft: 8 }}>{ROT_TIPO[fatura.tipo]}</span>
              <span className="sec" style={{ marginLeft: 8, fontWeight: 400 }}>{fatura.periodoDe} a {fatura.periodoAte}</span>
              <span style={{ marginLeft: 'auto' }}><Estado v={fatura.estado} /></span>
            </h3>
            <div className="corpo" style={{ fontSize: 12.5, color: 'var(--texto-suave)' }}>
              Montante s/ IVA {formatarMoeda(fatura.montanteSemIva)} · IVA {formatarMoeda(fatura.montanteIva)} ·
              documentos: {fatura.documentos.map((d) => d.nomeOriginal).join(', ') || '—'}
            </div>
          </div>

          {!decidida && conf === undefined && (
            <div className="cartao"><div className="corpo">
              <p className="sec" style={{ marginTop: 0 }}>Fatura recebida e por conferir.</p>
              <button className="btn pri" onClick={() => void reconferir(fatura.id)}>Conferir</button>
            </div></div>
          )}

          {!decidida && conf !== undefined && (
            <div className="cartao"><h3>Conferência determinística <code>{fatura.tipo === 'ENTREGAVEL' ? 'RN-608 · RN-609' : fatura.tipo === 'LICENCIAMENTO' ? 'RN-611' : 'RN-603'}</code></h3><div className="corpo">
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

              {conf.conforme
                ? <div className="aviso" style={{ margin: '10px 0' }}>Sem divergências: a fatura pode ser validada.</div>
                : <div className="erro-cx" style={{ margin: '10px 0' }}>{conf.motivo ?? 'Há divergências que obstam à validação.'}</div>}

              <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--linha)' }}>
                <div className="campo"><label>Motivo da invalidação {conf.conforme ? '(preencha se invalidar)' : '(redigido a partir da divergência — reveja antes de decidir)'}</label>
                  <textarea rows={3} value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Motivo da invalidação…" />
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="btn pri" disabled={!conf.conforme || !podeGerir} onClick={() => void decidir('VALIDADA')}>Validar</button>
                  <button className="btn" style={{ borderColor: 'var(--vermelho)', color: 'var(--vermelho)' }} disabled={motivo.trim() === '' || !podeGerir} onClick={() => void decidir('INVALIDADA')}>Invalidar</button>
                </div>
              </div>
            </div></div>
          )}

          {/* ── 3 · ENCERRAMENTO ────────────────────────────────────────── */}
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
