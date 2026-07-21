import { useState, type ReactNode } from 'react';
import { app } from '../porta/aplicacao-local.js';
import { Cabecalho } from '../app/Shell.js';
import { Estado, hoje, mensagemErro, useAsync } from '../comum.js';

export function Afetacoes(): ReactNode {
  const podeGerir = app.papeisAtuais().some((p) => p === 'GESTOR_CONTRATO' || p === 'GESTOR_TECNICO');
  const [contratoId, setContratoId] = useState('');
  const [erro, setErro] = useState<string>();
  const [form, setForm] = useState({ perfilId: '', recursoId: '', projetoIds: '', vigenteDe: hoje() });

  const base = useAsync(async () => {
    const contratos = await app.ctx.repos.contratos.todos();
    const cid = contratoId || contratos[0]?.id || '';
    const perfis = await app.ctx.repos.perfis.todos((p) => p.contratoId === cid);
    const recursos = await app.ctx.repos.recursos.todos();
    const afetacoes = await app.ctx.repos.afetacoes.todos((a) => a.contratoId === cid);
    return { contratos, cid, perfis, recursos, afetacoes };
  }, [contratoId]);

  if (base.dados === undefined) return <p className="vazio">A carregar…</p>;
  const { contratos, cid, perfis, recursos, afetacoes } = base.dados;

  async function criar(): Promise<void> {
    setErro(undefined);
    try {
      await app.afetacoes.criar({ contratoId: cid, perfilId: form.perfilId, recursoId: form.recursoId, projetoIds: form.projetoIds.split(',').map((s) => s.trim()).filter(Boolean), vigenteDe: form.vigenteDe }, app.utilizador());
      setForm({ perfilId: '', recursoId: '', projetoIds: '', vigenteDe: hoje() });
      base.recarregar();
    } catch (e) { setErro(mensagemErro(e)); }
  }

  async function substituir(id: string): Promise<void> {
    const novo = prompt('Novo recurso (oid) — mesma entidade executante:');
    if (novo === null || novo.trim() === '') return;
    const de = prompt('Vigência da sucessora (YYYY-MM-DD):', hoje()) ?? hoje();
    setErro(undefined);
    try { await app.afetacoes.substituir(id, novo.trim(), de, app.utilizador()); base.recarregar(); }
    catch (e) { setErro(mensagemErro(e)); }
  }

  async function alternar(id: string, ativa: boolean): Promise<void> {
    try { await app.afetacoes.atualizar(id, { ativa: !ativa }, app.utilizador()); base.recarregar(); }
    catch (e) { setErro(mensagemErro(e)); }
  }

  return (
    <>
      <Cabecalho titulo="Afetações" sub="Afetar recursos a contratos, perfis e projetos" acoes={
        <select value={cid} onChange={(e) => setContratoId(e.target.value)}>{contratos.map((c) => <option key={c.id} value={c.id}>{c.numero}</option>)}</select>
      } />
      {erro !== undefined && <div className="erro-cx">⚠ {erro}</div>}
      <div style={{ display: 'grid', gridTemplateColumns: podeGerir ? '1fr 340px' : '1fr', gap: 16 }}>
        <div className="cartao"><h3>Afetações do contrato · {afetacoes.filter((a) => a.ativa).length} ativas</h3><table>
          <thead><tr><th>Recurso</th><th>Perfil</th><th>Projetos</th><th>Vigência</th><th>Estado</th>{podeGerir && <th></th>}</tr></thead>
          <tbody>{afetacoes.map((a) => (
            <tr key={a.id}>
              <td className="prim">{a.recursoId}</td><td>{perfis.find((p) => p.id === a.perfilId)?.nome ?? a.perfilId}</td>
              <td>{a.projetoIds.map((p) => <span key={p} className="chip" style={{ marginRight: 4 }}>{p}</span>)}</td>
              <td className="tabnum">{a.vigenteDe}{a.vigenteAte !== undefined ? ` – ${a.vigenteAte}` : ''}</td>
              <td><Estado v={a.ativa ? 'Ativa' : 'Inativa'} /></td>
              {podeGerir && <td style={{ whiteSpace: 'nowrap' }}><button className="btn sm" onClick={() => void alternar(a.id, a.ativa)}>{a.ativa ? 'Inativar' : 'Ativar'}</button> <button className="btn sm" onClick={() => void substituir(a.id)}>Substituir</button></td>}
            </tr>
          ))}{afetacoes.length === 0 && <tr><td colSpan={6} className="vazio">Sem afetações.</td></tr>}</tbody>
        </table></div>

        {podeGerir && (
          <div className="cartao"><h3>Nova afetação</h3><div className="corpo">
            <div className="campo"><label>Perfil contratual</label><select value={form.perfilId} onChange={(e) => setForm({ ...form, perfilId: e.target.value })}><option value="">— selecionar —</option>{perfis.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}</select></div>
            <div className="campo"><label>Recurso</label><select value={form.recursoId} onChange={(e) => setForm({ ...form, recursoId: e.target.value })}><option value="">— selecionar —</option>{recursos.map((r) => <option key={r.id} value={r.id}>{r.id} · {r.entidadeExecutanteNipc}</option>)}</select></div>
            <div className="campo"><label>Projetos (separados por vírgula)</label><input value={form.projetoIds} onChange={(e) => setForm({ ...form, projetoIds: e.target.value })} placeholder="proj-P1, proj-P2" /></div>
            <div className="campo"><label>Vigência desde</label><input type="date" value={form.vigenteDe} onChange={(e) => setForm({ ...form, vigenteDe: e.target.value })} /></div>
            <div className="aviso" style={{ marginBottom: 12 }}>Perfil e entidade executante têm de coincidir na substituição <code>RN-701</code>.</div>
            <button className="btn pri" style={{ width: '100%', justifyContent: 'center' }} disabled={form.perfilId === '' || form.recursoId === ''} onClick={() => void criar()}>Criar afetação</button>
          </div></div>
        )}
      </div>
    </>
  );
}
