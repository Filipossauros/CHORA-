import { useState, type ReactNode } from 'react';
import { app } from '../porta/aplicacao-local.js';
import { Cabecalho } from '../app/Shell.js';
import { Estado, formatarDuracao, mensagemErro, useAsync } from '../comum.js';

export function Aprovacoes(): ReactNode {
  const podeAprovar = app.podeAprovar();
  const [estado, setEstado] = useState('SUBMETIDO');
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [resultados, setResultados] = useState<Array<{ id: string; ok: boolean; regra?: string; detalhe?: string }>>([]);
  const [erro, setErro] = useState<string>();

  const base = useAsync(async () => {
    const u = app.utilizador();
    const podeVerTodos = podeAprovar;
    const registos = await app.ctx.repos.registosTempo.todos((r) => r.estado === estado && (podeVerTodos || r.recursoId === u.utilizadorId));
    const perfis = await app.ctx.repos.perfis.todos();
    return { registos, perfis };
  }, [estado]);

  if (base.dados === undefined) return <p className="vazio">A carregar…</p>;
  const { registos, perfis } = base.dados;

  function alternar(id: string): void { setSel((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; }); }

  async function aprovar(): Promise<void> {
    setErro(undefined);
    try { const r = await app.registos.aprovar([...sel], app.utilizador()); setResultados(r); setSel(new Set()); base.recarregar(); }
    catch (e) { setErro(mensagemErro(e)); }
  }
  async function rejeitar(): Promise<void> {
    const motivo = prompt('Motivo da rejeição:'); if (motivo === null || motivo.trim() === '') return;
    try { const r = await app.registos.rejeitar([...sel], motivo, app.utilizador()); setResultados(r); setSel(new Set()); base.recarregar(); }
    catch (e) { setErro(mensagemErro(e)); }
  }

  return (
    <>
      <Cabecalho titulo="Aprovações" sub="Registos de tempo por decidir" acoes={podeAprovar ? <>
        <button className="btn" disabled={sel.size === 0} onClick={() => void rejeitar()}>Rejeitar ({sel.size})</button>
        <button className="btn pri" disabled={sel.size === 0} onClick={() => void aprovar()}>Aprovar ({sel.size})</button>
      </> : undefined} />
      {!podeAprovar && <div className="aviso" style={{ marginBottom: 12 }}>O seu papel só permite ver os próprios registos <code>RN-407</code>; as ações de aprovação não estão disponíveis <code>RN-501</code>.</div>}
      {erro !== undefined && <div className="erro-cx">⚠ {erro}</div>}
      <div className="barra-acoes"><label>Estado <select value={estado} onChange={(e) => setEstado(e.target.value)}><option>SUBMETIDO</option><option>APROVADO</option><option>REJEITADO</option><option>RASCUNHO</option></select></label></div>

      {resultados.length > 0 && <div className="cartao"><div className="corpo" style={{ fontSize: 13 }}>{resultados.map((r) => <div key={r.id} style={{ color: r.ok ? 'var(--verde)' : 'var(--vermelho)' }}>{r.id}: {r.ok ? 'aprovado' : `falhou ${r.regra ?? ''} — ${r.detalhe ?? ''}`}</div>)}</div></div>}

      <div className="cartao"><table>
        <thead><tr>{podeAprovar && <th style={{ width: 30 }}></th>}<th>Data</th><th>Recurso</th><th>Perfil</th><th>Atividade</th><th className="num">Duração</th><th>Estado</th></tr></thead>
        <tbody>{registos.map((r) => <tr key={r.id}>{podeAprovar && <td><input type="checkbox" checked={sel.has(r.id)} onChange={() => alternar(r.id)} /></td>}<td className="tabnum">{r.data}</td><td>{r.recursoId}</td><td>{perfis.find((p) => p.id === r.perfilId)?.nome ?? r.perfilId}</td><td>{r.descricaoAtividade}</td><td className="num">{formatarDuracao(r.duracao)}</td><td><Estado v={r.estado} /></td></tr>)}
        {registos.length === 0 && <tr><td colSpan={7} className="vazio">Sem registos neste estado.</td></tr>}</tbody>
      </table></div>
    </>
  );
}
