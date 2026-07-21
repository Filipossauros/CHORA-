import { useState, type ReactNode } from 'react';
import { app, UTILIZADORES } from '../porta/aplicacao-local.js';
import { Cabecalho } from '../app/Shell.js';
import { mensagemErro, useAsync } from '../comum.js';

const PAPEIS = [
  { v: 'GESTOR_CONTRATO', r: 'Gestor de Contrato' },
  { v: 'GESTOR_TECNICO', r: 'Gestor Técnico' },
  { v: 'ELEMENTO_EQUIPA_TECNICA', r: 'Elemento' },
];

export function Acessos(): ReactNode {
  const podeGerir = app.papeisAtuais().includes('GESTOR_CONTRATO');
  const [erro, setErro] = useState<string>();
  const [f, setF] = useState({ utilizadorId: '', papel: 'ELEMENTO_EQUIPA_TECNICA', entidade: '' });
  const base = useAsync(() => app.ctx.repos.acessos.todos(), []);

  if (!podeGerir) return (<><Cabecalho titulo="Gestão de acessos" /><div className="aviso">Só o Gestor de Contrato gere acessos <code>RN-501</code>.</div></>);

  async function conceder(): Promise<void> {
    setErro(undefined);
    try { await app.acessos.conceder(f.utilizadorId, [f.papel as never], f.entidade || undefined, undefined, app.utilizador()); setF({ utilizadorId: '', papel: 'ELEMENTO_EQUIPA_TECNICA', entidade: '' }); base.recarregar(); }
    catch (e) { setErro(mensagemErro(e)); }
  }

  return (
    <>
      <Cabecalho titulo="Gestão de acessos" sub="O ADO autentica; o CHORA+ guarda apenas o papel — sem login novo" />
      {erro !== undefined && <div className="erro-cx">⚠ {erro}</div>}
      <div className="ok-cx" style={{ marginBottom: 14 }}>🔒 O Azure DevOps autentica (identidade e token). O CHORA+ apenas guarda o papel de cada utilizador. Só o Gestor de Contrato altera esta tabela <code>RN-501</code>.</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 16 }}>
        <div className="cartao"><h3>Acessos</h3><table>
          <thead><tr><th>Utilizador</th><th>Papel</th><th>Entidade</th></tr></thead>
          <tbody>{(base.dados ?? []).map((a) => <tr key={a.id}><td className="prim">{a.utilizadorId}</td><td>{a.papeis.map((p) => PAPEIS.find((x) => x.v === p)?.r ?? p).join(', ')}</td><td>{a.entidade ?? '—'}</td></tr>)}
          {base.dados?.length === 0 && <tr><td colSpan={3} className="vazio">Sem acessos configurados.</td></tr>}</tbody>
        </table></div>
        <div className="cartao"><h3>Conceder acesso</h3><div className="corpo">
          <div className="campo"><label>Utilizador (oid)</label><input list="uts" value={f.utilizadorId} onChange={(e) => setF({ ...f, utilizadorId: e.target.value })} placeholder="oid-…" /><datalist id="uts">{UTILIZADORES.map((u) => <option key={u.id} value={u.id}>{u.nome}</option>)}</datalist></div>
          <div className="campo"><label>Papel</label><select value={f.papel} onChange={(e) => setF({ ...f, papel: e.target.value })}>{PAPEIS.map((p) => <option key={p.v} value={p.v}>{p.r}</option>)}</select></div>
          <div className="campo"><label>Entidade (opcional)</label><input value={f.entidade} onChange={(e) => setF({ ...f, entidade: e.target.value })} /></div>
          <button className="btn pri" disabled={f.utilizadorId === ''} onClick={() => void conceder()}>Conceder</button>
        </div></div>
      </div>
    </>
  );
}
