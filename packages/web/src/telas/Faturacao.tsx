import { useRef, useState, type ReactNode } from 'react';
import { jsPDF } from 'jspdf';
import { app, nomeAzure } from '../porta/aplicacao-local.js';
import { Cabecalho } from '../app/Shell.js';
import { Estado, eurosParaCent, formatarHoras, formatarMoeda, horasParaMin, hoje, mensagemErro, useAsync } from '../comum.js';

interface LinhaConf { perfilId?: string; recursoId?: string; quantidadeFatura: number; quantidadeAprovada: number; valorFatura: number; valorAprovado: number }
interface Relatorio { decisao: string; motivo?: string; frase: string; geradoEm: string }
interface OcrLinha { perfilId?: string; recursoId?: string; horas: number; valorHora: number; conf: number }
interface OcrResultado { numero: string; numeroConf: number; linhas: OcrLinha[] }
type TipoDoc = 'FATURA' | 'RELATORIO_HORAS_FORNECEDOR';

const TIPOS_DOC: Array<{ tipo: TipoDoc; rot: string }> = [
  { tipo: 'FATURA', rot: 'Fatura (PDF)' },
  { tipo: 'RELATORIO_HORAS_FORNECEDOR', rot: 'Relatório de horas do fornecedor (PDF)' },
];

async function sha256(file: File): Promise<string> {
  const hash = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
function confDe(chave: string): number {
  let h = 0; for (const c of chave) h = (h * 31 + c.charCodeAt(0)) % 1000;
  return 0.86 + (h % 13) / 100;
}
function Conf({ v }: { v: number }): ReactNode {
  const c = v >= 0.9 ? 'alta' : v >= 0.75 ? 'media' : 'baixa';
  return <span className={`confbadge ${c}`}>OCR {Math.round(v * 100)}%</span>;
}

/** Proposta determinística do motivo de invalidação, a partir das divergências. */
function motivoInvalidacaoIA(linhas: LinhaConf[]): string {
  const div = linhas.filter((l) => l.quantidadeFatura !== l.quantidadeAprovada || l.valorFatura !== l.valorAprovado);
  if (div.length === 0) {
    return 'Fatura não conforme com os elementos de execução aprovados no período (sem correspondência integral verificável).';
  }
  const partes = div.map((l) => {
    const bits: string[] = [];
    if (l.quantidadeFatura !== l.quantidadeAprovada) bits.push(`quantidade faturada ${formatarHoras(l.quantidadeFatura)} vs. ${formatarHoras(l.quantidadeAprovada)} aprovadas`);
    if (l.valorFatura !== l.valorAprovado) bits.push(`valor faturado ${formatarMoeda(l.valorFatura)} vs. ${formatarMoeda(l.valorAprovado)} aprovado`);
    return `${l.perfilId ?? 'perfil'} (${nomeAzure(l.recursoId ?? '')}): ${bits.join('; ')}`;
  });
  return `Divergência entre as linhas da fatura e os registos de tempo aprovados do período — ${partes.join(' · ')}.`;
}

export function Faturacao(): ReactNode {
  const podeGerir = app.papeisAtuais().includes('GESTOR_CONTRATO');
  const [contratoId, setContratoId] = useState('');
  const [faturaId, setFaturaId] = useState('');
  const [conf, setConf] = useState<{ linhas: LinhaConf[]; conforme: boolean }>();
  const [ocr, setOcr] = useState<OcrResultado>();
  const [relatorio, setRelatorio] = useState<Relatorio>();
  const [motivoInval, setMotivoInval] = useState('');
  const [erro, setErro] = useState<string>();
  // Nova conferência (entrada por upload / carregamento manual).
  const [nova, setNova] = useState({ numero: '', periodoDe: '', periodoAte: '', montanteSemIva: '', montanteIva: '' });
  const [pend, setPend] = useState<Partial<Record<TipoDoc, File>>>({});
  const refs = useRef<Record<string, HTMLInputElement | null>>({});

  const base = useAsync(async () => {
    const contratos = await app.ctx.repos.contratos.todos();
    const cid = contratoId || contratos[0]?.id || '';
    const faturas = await app.ctx.repos.faturas.todos((f) => f.contratoId === cid);
    const fatura = faturaId !== '' ? await app.ctx.repos.faturas.obter(faturaId) : null;
    return { contratos, cid, faturas, fatura };
  }, [contratoId, faturaId, relatorio, ocr]);

  if (base.dados === undefined) return <p className="vazio">A carregar…</p>;
  const { contratos, cid, faturas, fatura } = base.dados;

  function reset(): void { setConf(undefined); setOcr(undefined); setRelatorio(undefined); setMotivoInval(''); setErro(undefined); }
  function novaConferencia(): void { setFaturaId(''); setPend({}); setNova({ numero: '', periodoDe: '', periodoAte: '', montanteSemIva: '', montanteIva: '' }); reset(); }

  async function criarConferencia(): Promise<void> {
    setErro(undefined);
    const semIva = eurosParaCent(nova.montanteSemIva); const iva = eurosParaCent(nova.montanteIva);
    if (nova.numero.trim() === '' || nova.periodoDe === '' || nova.periodoAte === '' || semIva <= 0) {
      setErro('Indique o nº da fatura, o período e o montante s/ IVA (€ > 0).'); return;
    }
    try {
      const u = app.utilizador();
      const ano = Number(hoje().slice(0, 4));
      // Auto-compromisso a cobrir a fatura (LCPA / RN-601), para prototipagem.
      const comp = await app.faturas.criarCompromisso(cid, `CMP-${nova.numero}`, semIva, ano, hoje(), u);
      const criada = await app.faturas.criarFatura(cid, {
        compromissoId: comp.id, numero: nova.numero.trim(),
        dataEmissao: hoje(), dataRececao: hoje(), periodoDe: nova.periodoDe, periodoAte: nova.periodoAte,
        montanteSemIva: semIva, montanteIva: Number.isFinite(iva) && iva > 0 ? iva : 0,
      }, u);
      for (const { tipo } of TIPOS_DOC) {
        const file = pend[tipo];
        if (file !== undefined) {
          const hash = await sha256(file);
          await app.faturas.anexarDocumento(criada.id, { tipo, ficheiroRef: `arq://${criada.id}/${tipo}`, nomeOriginal: file.name, hashSha256: hash, tamanhoBytes: file.size, recebidoEm: app.ctx.relogio.agora(), carregadoPor: u.utilizadorId }, u);
        }
      }
      setPend({});
      setFaturaId(criada.id);
      reset();
      base.recarregar();
    } catch (e) { setErro(mensagemErro(e)); }
  }

  async function carregarPdf(tipo: TipoDoc, file: File): Promise<void> {
    if (fatura === null) return;
    setErro(undefined);
    try {
      const hash = await sha256(file);
      await app.faturas.anexarDocumento(fatura.id, { tipo, ficheiroRef: `arq://${fatura.id}/${tipo}`, nomeOriginal: file.name, hashSha256: hash, tamanhoBytes: file.size, recebidoEm: app.ctx.relogio.agora(), carregadoPor: app.utilizador().utilizadorId }, app.utilizador());
      base.recarregar();
    } catch (e) { setErro(mensagemErro(e)); }
  }

  async function extrairOcr(): Promise<void> {
    if (fatura === null) return;
    setErro(undefined);
    try {
      let linhas: OcrLinha[];
      if (fatura.linhas.length > 0) {
        linhas = fatura.linhas.map((l) => ({ perfilId: l.perfilId, recursoId: l.recursoId, horas: Math.round(l.quantidade / 60), valorHora: l.valorHora, conf: confDe(`${l.perfilId}${l.recursoId}`) }));
      } else {
        const aprovados = await app.ctx.repos.registosTempo.todos((r) => r.contratoId === cid && r.estado === 'APROVADO' && r.data >= fatura.periodoDe && r.data <= fatura.periodoAte);
        const grupos = new Map<string, { perfilId: string; recursoId: string; min: number; vh: number }>();
        for (const r of aprovados) { const k = `${r.perfilId}|${r.recursoId}`; const g = grupos.get(k) ?? { perfilId: r.perfilId, recursoId: r.recursoId, min: 0, vh: r.valorHoraAplicado }; g.min += r.duracao; grupos.set(k, g); }
        linhas = [...grupos.values()].map((g) => ({ perfilId: g.perfilId, recursoId: g.recursoId, horas: Math.round(g.min / 60), valorHora: g.vh, conf: confDe(`${g.perfilId}${g.recursoId}`) }));
      }
      setOcr({ numero: fatura.numero, numeroConf: 0.97, linhas });
    } catch (e) { setErro(mensagemErro(e)); }
  }

  async function confirmarExtracao(): Promise<void> {
    if (fatura === null || ocr === undefined) return;
    setErro(undefined);
    try {
      await app.faturas.definirLinhas(fatura.id, ocr.linhas.map((l) => ({ perfilId: l.perfilId, recursoId: l.recursoId, quantidade: horasParaMin(l.horas), valorHora: l.valorHora, montante: l.horas * l.valorHora, origem: 'EXTRAIDA' as const })), app.utilizador());
      base.recarregar();
    } catch (e) { setErro(mensagemErro(e)); }
  }

  async function iniciar(): Promise<void> { if (fatura === null) return; setErro(undefined); try { await app.faturas.iniciarConferencia(fatura.id, app.utilizador()); base.recarregar(); } catch (e) { setErro(mensagemErro(e)); } }
  async function conferir(): Promise<void> { if (fatura === null) return; setErro(undefined); try { setConf(await app.faturas.conferir(fatura.id) as { linhas: LinhaConf[]; conforme: boolean }); } catch (e) { setErro(mensagemErro(e)); } }

  async function decidir(decisao: 'VALIDADA' | 'INVALIDADA', motivo?: string): Promise<void> {
    if (fatura === null) return; setErro(undefined);
    try { const r = await app.faturas.decidir(fatura.id, decisao, motivo, app.utilizador()) as { relatorio: Relatorio }; setRelatorio(r.relatorio); }
    catch (e) { setErro(mensagemErro(e)); }
  }

  function descarregarPdf(): void {
    if (relatorio === undefined || fatura === null) return;
    const doc = new jsPDF();
    doc.setFontSize(15); doc.text('CHORA+ · Relatório de evidência de conferência', 15, 20);
    doc.setFontSize(11);
    doc.text(`Fatura: ${fatura.numero}`, 15, 32);
    doc.text(`Contrato: ${contratos.find((c) => c.id === cid)?.numero ?? cid}`, 15, 39);
    doc.text(`Período: ${fatura.periodoDe} a ${fatura.periodoAte}`, 15, 46);
    doc.text(`Decisão: ${relatorio.decisao}`, 15, 53);
    if (relatorio.motivo !== undefined) doc.text(doc.splitTextToSize(`Motivo: ${relatorio.motivo}`, 180), 15, 60);
    doc.setFontSize(10);
    doc.text(doc.splitTextToSize(relatorio.frase, 180), 15, 78);
    doc.setFontSize(8); doc.text(`Gerado em ${relatorio.geradoEm}`, 15, 285);
    doc.save(`relatorio-evidencia-${fatura.numero}.pdf`);
  }

  const decidida = fatura !== null && ['VALIDADA', 'INVALIDADA', 'PAGA'].includes(fatura.estado);
  const etapa = fatura === null ? 0 : decidida ? 4 : fatura.estado === 'EM_CONFERENCIA' ? 3 : (fatura.documentos.length >= 1 ? 2 : 1);
  const emCurso = faturas.filter((f) => f.estado === 'RECEBIDA' || f.estado === 'EM_CONFERENCIA');
  const decididas = faturas.filter((f) => f.estado !== 'RECEBIDA' && f.estado !== 'EM_CONFERENCIA');

  return (
    <>
      <Cabecalho titulo="Conferência de faturas" sub="Carregar/registar a fatura · OCR · conferência determinística · decisão" acoes={
        <>
          {fatura !== null && <button className="btn" onClick={novaConferencia}>+ Nova conferência</button>}
          <select value={cid} onChange={(e) => { setContratoId(e.target.value); novaConferencia(); }}>{contratos.map((c) => <option key={c.id} value={c.id}>{c.numero}</option>)}</select>
        </>
      } />
      {erro !== undefined && <div className="erro-cx">⚠ {erro}</div>}

      {fatura === null ? (
        /* Entrada: começa pelo carregamento da fatura (upload/manual), não por seleção. */
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: 16 }}>
          <div className="cartao"><h3>Nova conferência de fatura</h3><div className="corpo">
            {!podeGerir && <div className="aviso">Só o gestor de contrato inicia conferências.</div>}
            <div className="g3">
              <div className="campo"><label>Nº da fatura *</label><input value={nova.numero} onChange={(e) => setNova({ ...nova, numero: e.target.value })} placeholder="FT-2026-010" /></div>
              <div className="campo"><label>Período de *</label><input type="date" value={nova.periodoDe} onChange={(e) => setNova({ ...nova, periodoDe: e.target.value })} /></div>
              <div className="campo"><label>Período até *</label><input type="date" value={nova.periodoAte} onChange={(e) => setNova({ ...nova, periodoAte: e.target.value })} /></div>
            </div>
            <div className="g2">
              <div className="campo"><label>Montante s/ IVA (€) *</label><input type="number" min={0} step="0.01" value={nova.montanteSemIva} onChange={(e) => setNova({ ...nova, montanteSemIva: e.target.value })} /></div>
              <div className="campo"><label>IVA (€)</label><input type="number" min={0} step="0.01" value={nova.montanteIva} onChange={(e) => setNova({ ...nova, montanteIva: e.target.value })} /></div>
            </div>
            <div className="g2">
              {TIPOS_DOC.map(({ tipo, rot }) => (
                <div key={tipo}>
                  <div className="campo" style={{ margin: 0 }}><label>{rot}</label></div>
                  <div className={`dropzone${pend[tipo] !== undefined ? ' ok' : ''}`} onClick={() => podeGerir && refs.current[`n-${tipo}`]?.click()} style={{ cursor: podeGerir ? 'pointer' : 'default' }}>
                    {pend[tipo] !== undefined ? <b>✓ {pend[tipo]?.name}</b> : <>Arraste ou clique para carregar o PDF</>}
                  </div>
                  <input ref={(el) => { refs.current[`n-${tipo}`] = el; }} type="file" accept="application/pdf" style={{ display: 'none' }} onChange={(e) => { const f = e.target.files?.[0]; if (f !== undefined) setPend((s) => ({ ...s, [tipo]: f })); e.target.value = ''; }} />
                </div>
              ))}
            </div>
            <div className="aviso" style={{ margin: '4px 0 12px' }}>Os PDF são selados pelo hash SHA-256 <code>RN-602-A</code>; a conferência exige a fatura e o relatório de horas <code>RN-602</code>. O nº pode ser lido/confirmado por OCR no passo seguinte.</div>
            <button className="btn pri" disabled={!podeGerir} onClick={() => void criarConferencia()}>Iniciar conferência</button>
          </div></div>

          <div className="cartao"><h3>Retomar / histórico</h3><table>
            <tbody>
              {emCurso.length > 0 && <tr><td colSpan={2} className="sec" style={{ fontWeight: 600 }}>Em curso</td></tr>}
              {emCurso.map((f) => <tr key={f.id} className="click" onClick={() => { setFaturaId(f.id); reset(); }}><td className="prim">{f.numero}<div className="sec">{f.periodoDe.slice(0, 7)}</div></td><td><Estado v={f.estado} /></td></tr>)}
              {decididas.length > 0 && <tr><td colSpan={2} className="sec" style={{ fontWeight: 600, paddingTop: 10 }}>Decididas</td></tr>}
              {decididas.map((f) => <tr key={f.id} className="click" onClick={() => { setFaturaId(f.id); reset(); }}><td className="prim">{f.numero}<div className="sec">{f.periodoDe.slice(0, 7)}</div></td><td><Estado v={f.estado} /></td></tr>)}
              {faturas.length === 0 && <tr><td colSpan={2} className="vazio">Sem faturas neste contrato.</td></tr>}
            </tbody>
          </table></div>
        </div>
      ) : (
        <div>
          <div className="stepper">
            {['Receção', 'Extração (OCR)', 'Conferência', 'Decisão'].map((t, i) => (
              <div key={t} className={`passo${etapa === i + 1 ? ' ativo' : etapa > i + 1 ? ' feito' : ''}`}><span className="n">{etapa > i + 1 ? '✓' : i + 1}</span>{t}</div>
            ))}
          </div>

          <div className="cartao" style={{ marginBottom: 16 }}><h3>{fatura.numero} · {fatura.periodoDe} a {fatura.periodoAte}<span style={{ marginLeft: 'auto' }}><Estado v={fatura.estado} /></span></h3><div className="corpo" style={{ fontSize: 12.5, color: 'var(--texto-suave)' }}>
            Montante s/ IVA {formatarMoeda(fatura.montanteSemIva)} · IVA {formatarMoeda(fatura.montanteIva)}
          </div></div>

          {/* Etapa 1–2: documentos + OCR (fatura RECEBIDA) */}
          {fatura.estado === 'RECEBIDA' && (
            <>
              <div className="cartao" style={{ marginBottom: 16 }}><h3>1 · Documentos</h3><div className="corpo">
                <div className="g2">
                  {TIPOS_DOC.map(({ tipo, rot }) => { const doc = fatura.documentos.find((d) => d.tipo === tipo); return (
                    <div key={tipo}>
                      <div className="campo" style={{ margin: 0 }}><label>{rot}</label></div>
                      <div className={`dropzone${doc !== undefined ? ' ok' : ''}`} onClick={() => podeGerir && refs.current[tipo]?.click()} style={{ cursor: podeGerir ? 'pointer' : 'default' }}>
                        {doc !== undefined ? <><b>✓ {doc.nomeOriginal}</b><div className="sec" style={{ marginTop: 2 }}>selado · sha256 {doc.hashSha256.slice(0, 12)}…</div></> : <>Arraste ou clique para carregar o PDF</>}
                      </div>
                      <input ref={(el) => { refs.current[tipo] = el; }} type="file" accept="application/pdf" style={{ display: 'none' }} onChange={(e) => { const f = e.target.files?.[0]; if (f !== undefined) void carregarPdf(tipo, f); e.target.value = ''; }} />
                    </div>
                  ); })}
                </div>
              </div></div>

              {podeGerir && (
                <div className="cartao"><h3>2 · Extração automática (OCR — stub)</h3><div className="corpo">
                  {ocr === undefined ? (
                    <><p className="sec" style={{ marginTop: 0 }}>Interpreta os PDF e propõe o nº da fatura e as linhas (com grau de confiança), revisíveis antes de confirmar.</p>
                    <button className="btn" onClick={() => void extrairOcr()}>Interpretar PDF por OCR</button></>
                  ) : (
                    <>
                      <div className="campo"><label>Nº da fatura (lido por OCR) <Conf v={ocr.numeroConf} /></label><input value={ocr.numero} onChange={(e) => setOcr({ ...ocr, numero: e.target.value })} /></div>
                      <table>
                        <thead><tr><th>Perfil · Recurso</th><th className="num">Horas</th><th className="num">€/hora</th><th className="num">Montante</th><th>Confiança</th></tr></thead>
                        <tbody>{ocr.linhas.map((l, i) => (
                          <tr key={i}><td className="prim">{l.perfilId ?? '—'}<div className="sec">{nomeAzure(l.recursoId ?? '')}</div></td>
                            <td className="num"><input type="number" min={0} value={l.horas} onChange={(e) => setOcr({ ...ocr, linhas: ocr.linhas.map((x, j) => j === i ? { ...x, horas: Number(e.target.value) } : x) })} style={{ width: 70, textAlign: 'right' }} /></td>
                            <td className="num">{formatarMoeda(l.valorHora)}</td><td className="num">{formatarMoeda(l.horas * l.valorHora)}</td><td><Conf v={l.conf} /></td></tr>
                        ))}{ocr.linhas.length === 0 && <tr><td colSpan={5} className="vazio">Sem linhas extraídas (sem registos aprovados no período).</td></tr>}</tbody>
                      </table>
                      <div className="aviso" style={{ margin: '10px 12px' }}>Pode corrigir as horas lidas por OCR antes de confirmar.</div>
                      <div style={{ display: 'flex', gap: 8 }}><button className="btn" onClick={() => setOcr(undefined)}>Reinterpretar</button><button className="btn pri" onClick={() => void confirmarExtracao()}>Confirmar extração</button></div>
                    </>
                  )}
                  <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--linha)' }}>
                    <button className="btn pri" disabled={fatura.documentos.length < 2 || fatura.linhas.length === 0} onClick={() => void iniciar()}>Iniciar conferência →</button>
                    {(fatura.documentos.length < 2 || fatura.linhas.length === 0) && <span className="sec" style={{ marginLeft: 10 }}>Requer os 2 PDF e as linhas confirmadas.</span>}
                  </div>
                </div></div>
              )}
            </>
          )}

          {/* Etapa 3–4: conferência + decisão (sempre manual, sem devolução) */}
          {fatura.estado === 'EM_CONFERENCIA' && (
            <div className="cartao"><h3>3 · Conferência determinística <code>RN-603</code></h3><div className="corpo">
              {conf === undefined ? (
                <><p className="sec" style={{ marginTop: 0 }}>Compara as linhas da fatura com os registos de tempo aprovados do período.</p>
                <button className="btn pri" onClick={() => void conferir()}>Conferir</button></>
              ) : (
                <>
                  <table>
                    <thead><tr><th>Perfil · Recurso</th><th className="num">Qt. fatura</th><th className="num">Qt. aprovada</th><th className="num">€ fatura</th><th className="num">€ aprovado</th><th>Resultado</th></tr></thead>
                    <tbody>{conf.linhas.map((l, i) => { const ok = l.quantidadeFatura === l.quantidadeAprovada && l.valorFatura === l.valorAprovado; return (
                      <tr key={i} style={{ background: ok ? undefined : 'var(--vermelho-b)' }}><td className="prim">{l.perfilId ?? '—'}<div className="sec">{nomeAzure(l.recursoId ?? '')}</div></td><td className="num">{formatarHoras(l.quantidadeFatura)}</td><td className="num">{formatarHoras(l.quantidadeAprovada)}</td><td className="num">{formatarMoeda(l.valorFatura)}</td><td className="num">{formatarMoeda(l.valorAprovado)}</td><td>{ok ? <Estado v="VALIDADA" /> : <Estado v="INVALIDADA" />}</td></tr>
                    ); })}</tbody>
                  </table>
                  {conf.conforme
                    ? <div style={{ margin: '10px 12px' }} className="aviso">Sem divergências: a fatura pode ser validada.</div>
                    : <div style={{ margin: '10px 12px' }} className="erro-cx">Há divergências entre a fatura e os registos aprovados <code>RN-603</code> — a validação está bloqueada.</div>}
                  <div style={{ marginTop: 6 }}>
                    <button className="btn pri" disabled={!conf.conforme} onClick={() => void decidir('VALIDADA')}>Validar</button>
                  </div>

                  <div style={{ marginTop: 16, paddingTop: 14, borderTop: '1px solid var(--linha)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', marginBottom: 6 }}><b style={{ fontSize: 13 }}>Invalidar fatura</b><button className="btn sm" style={{ marginLeft: 'auto' }} onClick={() => setMotivoInval(motivoInvalidacaoIA(conf.linhas))}>✨ Gerar motivo (IA)</button></div>
                    <p className="sec" style={{ marginTop: 0 }}>O motivo é obrigatório. Pode gerar uma proposta a partir da análise determinística e editá-la.</p>
                    <textarea rows={3} value={motivoInval} onChange={(e) => setMotivoInval(e.target.value)} placeholder="Motivo da invalidação…" style={{ width: '100%' }} />
                    <div style={{ marginTop: 8 }}><button className="btn" style={{ borderColor: 'var(--vermelho)', color: 'var(--vermelho)' }} disabled={motivoInval.trim() === ''} onClick={() => void decidir('INVALIDADA', motivoInval)}>Invalidar fatura</button></div>
                  </div>
                </>
              )}
            </div></div>
          )}

          {/* Fatura decidida: relatório de evidência */}
          {decidida && (
            relatorio !== undefined ? (
              <div className="cartao"><h3>4 · Relatório de evidência · {relatorio.decisao} <code>RN-604</code></h3><div className="corpo">
                <p className="sec" style={{ marginTop: 0 }}>Nº da fatura registado automaticamente: <b>{fatura.numero}</b>. Frase para o sistema de faturação da empresa (copiar/colar):</p>
                {relatorio.motivo !== undefined && <div className="campo" style={{ margin: '0 0 10px' }}><label>Motivo da invalidação</label><div style={{ fontSize: 13 }}>{relatorio.motivo}</div></div>}
                <div className="frase-legal">{relatorio.frase}</div>
                <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                  <button className="btn" onClick={() => void navigator.clipboard?.writeText(relatorio.frase)}>Copiar frase</button>
                  <button className="btn pri" onClick={descarregarPdf}>Descarregar PDF do relatório</button>
                </div>
              </div></div>
            ) : (
              <div className="cartao"><div className="corpo">Fatura <b>{fatura.estado.toLowerCase()}</b>.{fatura.relatorioEvidenciaId !== undefined ? ' Consulte o relatório de evidência associado.' : ''}</div></div>
            )
          )}
        </div>
      )}
    </>
  );
}
