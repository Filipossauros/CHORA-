import { useState, type ReactNode } from 'react';
import { app } from '../porta/aplicacao-local.js';
import { Cabecalho } from '../app/Shell.js';
import { formatarMoeda, mensagemErro, useAsync } from '../comum.js';

export function Procedimentos(): ReactNode {
  const podeGerir = app.papeisAtuais().some((p) => p === 'GESTOR_CONTRATO' || p === 'GESTOR_TECNICO');
  const [erro, setErro] = useState<string>();
  const [f, setF] = useState({ numero: '', descricao: '', tipo: 'CONCURSO_PUBLICO', precoBase: 0 });
  const base = useAsync(async () => {
    const procedimentos = await app.ctx.repos.procedimentos.todos();
    const lotes = await app.ctx.repos.lotes.todos();
    const contratos = await app.ctx.repos.contratos.todos();
    return { procedimentos, lotes, contratos };
  }, []);

  async function criar(): Promise<void> {
    setErro(undefined);
    try { await app.procedimentos.criar({ numero: f.numero, descricao: f.descricao, tipo: f.tipo as never, ...(f.precoBase > 0 ? { precoBase: f.precoBase } : {}) }, app.utilizador()); setF({ numero: '', descricao: '', tipo: 'CONCURSO_PUBLICO', precoBase: 0 }); base.recarregar(); }
    catch (e) { setErro(mensagemErro(e)); }
  }

  if (base.dados === undefined) return <p className="vazio">A carregar…</p>;
  const { procedimentos, lotes, contratos } = base.dados;
  return (
    <>
      <Cabecalho titulo="Procedimentos" sub="Concursos, ajustes diretos e acordos-quadro" />
      {erro !== undefined && <div className="erro-cx">⚠ {erro}</div>}
      {podeGerir && <div className="cartao"><h3>Criar procedimento</h3><div className="corpo">
        <div className="g3">
          <div className="campo"><label>Nº *</label><input value={f.numero} onChange={(e) => setF({ ...f, numero: e.target.value })} /></div>
          <div className="campo"><label>Tipo *</label><select value={f.tipo} onChange={(e) => setF({ ...f, tipo: e.target.value })}><option value="CONCURSO_PUBLICO">Concurso público</option><option value="AJUSTE_DIRETO">Ajuste direto</option><option value="CONSULTA_PREVIA">Consulta prévia</option><option value="ACORDO_QUADRO">Acordo-quadro</option></select></div>
          <div className="campo"><label>Preço base (cêntimos)</label><input type="number" value={f.precoBase} onChange={(e) => setF({ ...f, precoBase: Number(e.target.value) })} /></div>
        </div>
        <div className="campo"><label>Descrição *</label><input value={f.descricao} onChange={(e) => setF({ ...f, descricao: e.target.value })} /></div>
        <button className="btn pri" disabled={f.numero === '' || f.descricao === ''} onClick={() => void criar()}>Gravar procedimento</button>
      </div></div>}
      <div className="cartao"><h3>Procedimentos</h3><table>
        <thead><tr><th>Nº</th><th>Descrição</th><th>Tipo</th><th className="num">Lotes</th><th className="num">Contratos</th><th className="num">Preço base</th></tr></thead>
        <tbody>{procedimentos.map((p) => { const ls = lotes.filter((l) => l.procedimentoId === p.id); const cs = contratos.filter((c) => ls.some((l) => l.id === c.loteId)); return (
          <tr key={p.id}><td className="prim tabnum">{p.numero}</td><td>{p.descricao}</td><td>{p.tipo.replace(/_/g, ' ').toLowerCase()}</td><td className="num">{ls.length}</td><td className="num">{cs.length}</td><td className="num">{p.precoBase !== undefined ? formatarMoeda(p.precoBase) : '—'}</td></tr>
        ); })}{procedimentos.length === 0 && <tr><td colSpan={6} className="vazio">Sem procedimentos.</td></tr>}</tbody>
      </table></div>
    </>
  );
}
