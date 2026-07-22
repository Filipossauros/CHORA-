import { useState, type ReactNode } from 'react';
import { app, AZURE_USERS, nomeAzure, prestadorAzure } from '../porta/aplicacao-local.js';
import { Cabecalho } from '../app/Shell.js';
import { Estado, mensagemErro, useAsync } from '../comum.js';

const RECURSOS_AZURE = AZURE_USERS.filter((u) => u.prestador !== undefined);

export function Afetacoes(): ReactNode {
  const podeGerir = app.papeisAtuais().some((p) => p === 'GESTOR_CONTRATO' || p === 'GESTOR_TECNICO');
  const [contratoId, setContratoId] = useState('');
  const [erro, setErro] = useState<string>();
  const [form, setForm] = useState({ perfilId: '', recursoId: '' });

  const base = useAsync(async () => {
    const contratos = await app.ctx.repos.contratos.todos();
    const cid = contratoId || contratos[0]?.id || '';
    const perfis = await app.ctx.repos.perfis.todos((p) => p.contratoId === cid);
    const afetacoes = await app.ctx.repos.afetacoes.todos((a) => a.contratoId === cid);
    return { contratos, cid, perfis, afetacoes };
  }, [contratoId]);

  if (base.dados === undefined) return <p className="vazio">A carregar…</p>;
  const { contratos, cid, perfis, afetacoes } = base.dados;

  async function garantirRecurso(recursoId: string): Promise<void> {
    if ((await app.ctx.repos.recursos.obter(recursoId)) === null) {
      const contrato = contratos.find((c) => c.id === cid);
      await app.recursos.criar(recursoId, contrato?.prestador.nipc ?? '000000000', app.utilizador());
    }
  }

  async function criar(): Promise<void> {
    setErro(undefined);
    try {
      await garantirRecurso(form.recursoId); // o recurso vem do Azure; regista-se se ainda não existir
      await app.afetacoes.criar({ contratoId: cid, perfilId: form.perfilId, recursoId: form.recursoId }, app.utilizador());
      setForm({ perfilId: '', recursoId: '' });
      base.recarregar();
    } catch (e) { setErro(mensagemErro(e)); }
  }

  async function substituir(id: string): Promise<void> {
    const novo = prompt('Novo recurso (oid Azure) — mesma entidade executante:');
    if (novo === null || novo.trim() === '') return;
    setErro(undefined);
    try { await garantirRecurso(novo.trim()); await app.afetacoes.substituir(id, novo.trim(), app.utilizador()); base.recarregar(); }
    catch (e) { setErro(mensagemErro(e)); }
  }

  async function alternar(id: string, ativa: boolean): Promise<void> {
    try { await app.afetacoes.definirAtiva(id, !ativa, app.utilizador()); base.recarregar(); }
    catch (e) { setErro(mensagemErro(e)); }
  }

  return (
    <>
      <Cabecalho titulo="Afetações" sub="Afetar recursos a um contrato e perfil" acoes={
        <select value={cid} onChange={(e) => setContratoId(e.target.value)}>{contratos.map((c) => <option key={c.id} value={c.id}>{c.numero}</option>)}</select>
      } />
      {erro !== undefined && <div className="erro-cx">⚠ {erro}</div>}
      <div style={{ display: 'grid', gridTemplateColumns: podeGerir ? '1fr 340px' : '1fr', gap: 16 }}>
        <div className="cartao"><h3>Afetações do contrato · {afetacoes.filter((a) => a.ativa).length} ativas</h3><table>
          <thead><tr><th>Recurso</th><th>Perfil</th><th>Estado</th>{podeGerir && <th></th>}</tr></thead>
          <tbody>{afetacoes.map((a) => (
            <tr key={a.id}>
              <td className="prim">{nomeAzure(a.recursoId)}<div className="sec">{prestadorAzure(a.recursoId) ?? ''}</div></td>
              <td>{perfis.find((p) => p.id === a.perfilId)?.nome ?? a.perfilId}</td>
              <td><Estado v={a.ativa ? 'Ativa' : 'Inativa'} /></td>
              {podeGerir && <td style={{ whiteSpace: 'nowrap' }}><button className="btn sm" onClick={() => void alternar(a.id, a.ativa)}>{a.ativa ? 'Inativar' : 'Ativar'}</button> <button className="btn sm" onClick={() => void substituir(a.id)}>Substituir</button></td>}
            </tr>
          ))}{afetacoes.length === 0 && <tr><td colSpan={4} className="vazio">Sem afetações.</td></tr>}</tbody>
        </table></div>

        {podeGerir && (
          <div className="cartao"><h3>Nova afetação</h3><div className="corpo">
            <div className="campo"><label>Contrato</label><input value={contratos.find((c) => c.id === cid)?.numero ?? ''} disabled /></div>
            <div className="campo"><label>Perfil (do contrato)</label><select value={form.perfilId} onChange={(e) => setForm({ ...form, perfilId: e.target.value })}><option value="">— selecionar —</option>{perfis.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}</select></div>
            <div className="campo"><label>Recurso (utilizador Azure)</label><select value={form.recursoId} onChange={(e) => setForm({ ...form, recursoId: e.target.value })}><option value="">— selecionar —</option>{RECURSOS_AZURE.map((r) => <option key={r.id} value={r.id}>{r.nome} · {r.prestador}</option>)}</select></div>
            <div className="aviso" style={{ marginBottom: 12 }}>A afetação mantém-se até indicação manual de inativação ou substituição.</div>
            <button className="btn pri" style={{ width: '100%', justifyContent: 'center' }} disabled={form.perfilId === '' || form.recursoId === '' || perfis.length === 0} onClick={() => void criar()}>Criar afetação</button>
            {perfis.length === 0 && <div className="sec" style={{ marginTop: 8 }}>Este contrato ainda não tem perfis. Defina perfis no detalhe do contrato.</div>}
          </div></div>
        )}
      </div>
    </>
  );
}
