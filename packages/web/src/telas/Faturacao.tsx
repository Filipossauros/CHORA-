import { useState, type ReactNode } from 'react';
import { jsPDF } from 'jspdf';
import { app } from '../porta/aplicacao-local.js';
import { Cabecalho } from '../app/Shell.js';
import { Estado, formatarDuracao, formatarMoeda, mensagemErro, useAsync } from '../comum.js';

interface LinhaConf { perfilId?: string; recursoId?: string; quantidadeFatura: number; quantidadeAprovada: number; valorFatura: number; valorAprovado: number }
interface Relatorio { decisao: string; motivo?: string; frase: string; geradoEm: string }

export function Faturacao(): ReactNode {
  const podeGerir = app.papeisAtuais().includes('GESTOR_CONTRATO');
  const [contratoId, setContratoId] = useState('');
  const [faturaId, setFaturaId] = useState('');
  const [conf, setConf] = useState<{ linhas: LinhaConf[]; conforme: boolean }>();
  const [relatorio, setRelatorio] = useState<Relatorio>();
  const [erro, setErro] = useState<string>();

  const base = useAsync(async () => {
    const contratos = await app.ctx.repos.contratos.todos();
    const cid = contratoId || contratos[0]?.id || '';
    const faturas = await app.ctx.repos.faturas.todos((f) => f.contratoId === cid);
    const fatura = faturaId !== '' ? await app.ctx.repos.faturas.obter(faturaId) : null;
    return { contratos, cid, faturas, fatura };
  }, [contratoId, faturaId, relatorio]);

  if (base.dados === undefined) return <p className="vazio">A carregar…</p>;
  const { contratos, cid, faturas, fatura } = base.dados;

  async function extrairOcr(): Promise<void> {
    if (fatura === null) return;
    setErro(undefined);
    try {
      // Stub IFaturaValidator.extrairLinhas: propõe linhas a partir dos registos aprovados do período.
      const aprovados = await app.ctx.repos.registosTempo.todos((r) => r.contratoId === cid && r.estado === 'APROVADO' && r.data >= fatura.periodoDe && r.data <= fatura.periodoAte);
      const grupos = new Map<string, { perfilId: string; recursoId: string; q: number; v: number; vh: number }>();
      for (const r of aprovados) { const k = `${r.perfilId}|${r.recursoId}`; const g = grupos.get(k) ?? { perfilId: r.perfilId, recursoId: r.recursoId, q: 0, v: 0, vh: r.valorHoraAplicado }; g.q += r.duracao; g.v += r.valorImputado; grupos.set(k, g); }
      const linhas = [...grupos.values()].map((g) => ({ perfilId: g.perfilId, recursoId: g.recursoId, quantidade: g.q, valorHora: g.vh, montante: g.v, origem: 'EXTRAIDA' as const }));
      await app.faturas.definirLinhas(fatura.id, linhas, app.utilizador());
      base.recarregar();
    } catch (e) { setErro(mensagemErro(e)); }
  }

  async function iniciar(): Promise<void> { if (fatura === null) return; setErro(undefined); try { await app.faturas.iniciarConferencia(fatura.id, app.utilizador()); base.recarregar(); } catch (e) { setErro(mensagemErro(e)); } }
  async function conferir(): Promise<void> { if (fatura === null) return; setErro(undefined); try { setConf(await app.faturas.conferir(fatura.id) as never); } catch (e) { setErro(mensagemErro(e)); } }

  async function decidir(decisao: 'VALIDADA' | 'INVALIDADA'): Promise<void> {
    if (fatura === null) return; setErro(undefined);
    let motivo: string | undefined;
    if (decisao === 'INVALIDADA') { const m = prompt('Motivo da invalidação:'); if (m === null || m.trim() === '') return; motivo = m; }
    try { const r = await app.faturas.decidir(fatura.id, decisao, motivo, app.utilizador()) as { relatorio: Relatorio }; setRelatorio(r.relatorio); }
    catch (e) { setErro(mensagemErro(e)); }
  }

  function descarregarPdf(): void {
    if (relatorio === undefined || fatura === null) return;
    const doc = new jsPDF();
    doc.setFontSize(15); doc.text('CHORA+ · Relatório de evidência de conferência', 15, 20);
    doc.setFontSize(11);
    doc.text(`Fatura: ${fatura.numero}`, 15, 32);
    doc.text(`Contrato: ${cid}`, 15, 39);
    doc.text(`Período: ${fatura.periodoDe} a ${fatura.periodoAte}`, 15, 46);
    doc.text(`Decisão: ${relatorio.decisao}`, 15, 53);
    if (relatorio.motivo !== undefined) doc.text(`Motivo: ${relatorio.motivo}`, 15, 60);
    doc.setFontSize(10);
    const linhas = doc.splitTextToSize(relatorio.frase, 180);
    doc.text(linhas, 15, 72);
    doc.setFontSize(8); doc.text(`Gerado em ${relatorio.geradoEm}`, 15, 285);
    doc.save(`relatorio-evidencia-${fatura.numero}.pdf`);
  }

  return (
    <>
      <Cabecalho titulo="Faturação" sub="Compromissos, faturas e conferência determinística" acoes={
        <select value={cid} onChange={(e) => { setContratoId(e.target.value); setFaturaId(''); setConf(undefined); setRelatorio(undefined); }}>{contratos.map((c) => <option key={c.id} value={c.id}>{c.numero}</option>)}</select>
      } />
      {erro !== undefined && <div className="erro-cx">⚠ {erro}</div>}
      <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: 16 }}>
        <div className="cartao"><h3>Faturas</h3><table>
          <thead><tr><th>Nº</th><th>Estado</th></tr></thead>
          <tbody>{faturas.map((f) => <tr key={f.id} className="click" onClick={() => { setFaturaId(f.id); setConf(undefined); setRelatorio(undefined); }} style={{ background: f.id === faturaId ? 'var(--superficie-2)' : undefined }}><td className="prim">{f.numero}<div className="sec">{f.periodoDe.slice(0, 7)}</div></td><td><Estado v={f.estado} /></td></tr>)}
          {faturas.length === 0 && <tr><td colSpan={2} className="vazio">Sem faturas.</td></tr>}</tbody>
        </table></div>

        <div>
          {fatura === null ? <div className="cartao"><div className="vazio">Selecione uma fatura.</div></div> : (
            <>
              <div className="cartao"><h3>{fatura.numero} · {fatura.periodoDe} a {fatura.periodoAte} <span style={{ marginLeft: 'auto' }}><Estado v={fatura.estado} /></span></h3><div className="corpo">
                <div style={{ display: 'flex', gap: 16, marginBottom: 12, fontSize: 12.5 }}>
                  <span>Documentos: {['FATURA', 'RELATORIO_HORAS_FORNECEDOR'].map((t) => <span key={t} className="chip" style={{ marginRight: 4, background: fatura.documentos.some((d) => d.tipo === t) ? undefined : 'var(--vermelho-b)', color: fatura.documentos.some((d) => d.tipo === t) ? undefined : 'var(--vermelho)' }}>{t === 'FATURA' ? 'Fatura' : 'Relatório horas'} {fatura.documentos.some((d) => d.tipo === t) ? '✓' : '✗'}</span>)}</span>
                </div>
                {podeGerir && fatura.estado === 'RECEBIDA' && <div style={{ display: 'flex', gap: 8 }}><button className="btn" onClick={() => void extrairOcr()}>Extrair linhas por OCR (stub)</button><button className="btn pri" onClick={() => void iniciar()}>Iniciar conferência</button></div>}
                {podeGerir && fatura.estado === 'EM_CONFERENCIA' && <div style={{ display: 'flex', gap: 8 }}><button className="btn pri" onClick={() => void conferir()}>Conferir</button><button className="btn" style={{ borderColor: 'var(--vermelho)', color: 'var(--vermelho)' }} onClick={() => void decidir('INVALIDADA')}>Invalidar</button><button className="btn pri" disabled={conf !== undefined && !conf.conforme} onClick={() => void decidir('VALIDADA')}>Validar</button></div>}
              </div></div>

              {conf !== undefined && (
                <div className="cartao"><h3>Conferência determinística <code>RN-603</code></h3><table>
                  <thead><tr><th>Perfil / Recurso</th><th className="num">Qt. fatura</th><th className="num">Qt. aprovada</th><th className="num">€ fatura</th><th className="num">€ aprovado</th><th>Resultado</th></tr></thead>
                  <tbody>{conf.linhas.map((l, i) => { const ok = l.quantidadeFatura === l.quantidadeAprovada && l.valorFatura === l.valorAprovado; return (
                    <tr key={i} style={{ background: ok ? undefined : 'var(--vermelho-b)' }}><td>{l.perfilId ?? '—'}<div className="sec">{l.recursoId}</div></td><td className="num">{formatarDuracao(l.quantidadeFatura)}</td><td className="num">{formatarDuracao(l.quantidadeAprovada)}</td><td className="num">{formatarMoeda(l.valorFatura)}</td><td className="num">{formatarMoeda(l.valorAprovado)}</td><td>{ok ? <Estado v="VALIDADA" /> : <Estado v="INVALIDADA" />}</td></tr>
                  ); })}</tbody>
                </table>{!conf.conforme && <div className="corpo"><div className="erro-cx">Há divergências — a validação está bloqueada até resolução <code>RN-603</code>.</div></div>}</div>
              )}

              {relatorio !== undefined && (
                <div className="cartao"><h3>Relatório de evidência · {relatorio.decisao} <code>RN-604</code></h3><div className="corpo">
                  <p style={{ fontSize: 12, color: 'var(--texto-suave)', marginTop: 0 }}>Frase para o sistema de faturação da empresa (copiar/colar):</p>
                  <div className="frase-legal">{relatorio.frase}</div>
                  <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                    <button className="btn" onClick={() => void navigator.clipboard?.writeText(relatorio.frase)}>Copiar frase</button>
                    <button className="btn pri" onClick={descarregarPdf}>Descarregar PDF do relatório</button>
                  </div>
                </div></div>
              )}
            </>
          )}
        </div>
      </div>
    </>
  );
}
