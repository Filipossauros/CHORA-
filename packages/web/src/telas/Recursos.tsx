import { useState, type ReactNode } from 'react';
import { app } from '../porta/aplicacao-local.js';
import { Cabecalho } from '../app/Shell.js';
import { Estado, mensagemErro, useAsync } from '../comum.js';

export function Recursos(): ReactNode {
  const podeGerir = app.papeisAtuais().some((p) => p === 'GESTOR_CONTRATO' || p === 'GESTOR_TECNICO');
  const [erro, setErro] = useState<string>();
  const [f, setF] = useState({ id: '', nipc: '' });
  const base = useAsync(() => app.ctx.repos.recursos.todos(), []);

  async function criar(): Promise<void> {
    setErro(undefined);
    try { await app.recursos.criar(f.id, f.nipc, app.utilizador()); setF({ id: '', nipc: '' }); base.recarregar(); }
    catch (e) { setErro(mensagemErro(e)); }
  }

  return (
    <>
      <Cabecalho titulo="Recursos" sub="Colaboradores externos (o nome não é persistido — secção 9.4)" />
      {erro !== undefined && <div className="erro-cx">⚠ {erro}</div>}
      <div style={{ display: 'grid', gridTemplateColumns: podeGerir ? '1fr 320px' : '1fr', gap: 16 }}>
        <div className="cartao"><h3>Recursos</h3><table>
          <thead><tr><th>oid do Entra ID</th><th>Entidade executante (NIPC)</th><th>Estado</th></tr></thead>
          <tbody>{(base.dados ?? []).map((r) => <tr key={r.id}><td className="prim">{r.id}</td><td>{r.entidadeExecutanteNipc}</td><td><Estado v={r.ativo ? 'Ativa' : 'Inativa'} /></td></tr>)}
          {base.dados?.length === 0 && <tr><td colSpan={3} className="vazio">Sem recursos.</td></tr>}</tbody>
        </table></div>
        {podeGerir && <div className="cartao"><h3>Novo recurso</h3><div className="corpo">
          <div className="campo"><label>oid do Entra ID</label><input value={f.id} onChange={(e) => setF({ ...f, id: e.target.value })} placeholder="oid-recurso-10" /></div>
          <div className="campo"><label>NIPC da entidade executante</label><input value={f.nipc} onChange={(e) => setF({ ...f, nipc: e.target.value })} /></div>
          <button className="btn pri" disabled={f.id === '' || f.nipc === ''} onClick={() => void criar()}>Criar recurso</button>
        </div></div>}
      </div>
    </>
  );
}
