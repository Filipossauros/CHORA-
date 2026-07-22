import { useState, type ReactNode } from 'react';
import { app } from '../porta/aplicacao-local.js';
import { Cabecalho } from '../app/Shell.js';
import { Estado, formatarHoras, horasParaMin, hoje, mensagemErro, useAsync } from '../comum.js';

export function Registos(): ReactNode {
  const u = app.utilizador();
  const podeVerTodos = app.papeisAtuais().some((p) => p === 'GESTOR_CONTRATO' || p === 'GESTOR_TECNICO');
  const [erro, setErro] = useState<string>();
  // Por omissão: hoje e 8 horas de trabalho (unidade = hora, sem minutos).
  const [form, setForm] = useState({ afetacaoId: '', data: hoje(), horas: 8, descricao: '', workItemId: 1001, tipo: '' });

  const base = useAsync(async () => {
    const afetacoes = await app.ctx.repos.afetacoes.todos((a) => a.ativa && (podeVerTodos || a.recursoId === u.utilizadorId));
    const registos = (await app.ctx.repos.registosTempo.todos((r) => podeVerTodos || r.recursoId === u.utilizadorId)).sort((a, b) => (a.data < b.data ? 1 : -1));
    const perfis = await app.ctx.repos.perfis.todos();
    return { afetacoes, registos, perfis };
  }, []);

  if (base.dados === undefined) return <p className="vazio">A carregar…</p>;
  const { afetacoes, registos, perfis } = base.dados;
  const afSel = afetacoes.find((a) => a.id === form.afetacaoId);
  const perfilSel = perfis.find((p) => p.id === afSel?.perfilId);

  async function registar(submeter: boolean): Promise<void> {
    setErro(undefined);
    try {
      const criado = await app.registos.criar({ afetacaoId: form.afetacaoId, workItemId: form.workItemId, data: form.data, duracao: horasParaMin(form.horas), descricaoAtividade: form.descricao, ...(form.tipo !== '' ? { tipoDotacaoConsumida: form.tipo as never } : {}) }, app.utilizador());
      if (submeter) await app.registos.submeter(criado.id, app.utilizador());
      setForm({ ...form, descricao: '' });
      base.recarregar();
    } catch (e) { setErro(mensagemErro(e)); }
  }

  return (
    <>
      <Cabecalho titulo="Registos de tempo" sub={podeVerTodos ? 'Todos os registos' : 'Os meus registos'} />
      {erro !== undefined && <div className="erro-cx">⚠ {erro}</div>}
      <div style={{ display: 'grid', gridTemplateColumns: '360px 1fr', gap: 16 }}>
        <div className="cartao"><h3>Registar tempo</h3><div className="corpo">
          <div className="g2">
            <div className="campo"><label>Data</label><input type="date" max={hoje()} value={form.data} onChange={(e) => setForm({ ...form, data: e.target.value })} /></div>
            <div className="campo"><label>Horas (inteiras)</label><input type="number" min={1} step={1} value={form.horas} onChange={(e) => setForm({ ...form, horas: Number(e.target.value) })} /></div>
          </div>
          <div className="campo"><label>Afetação (perfil)</label><select value={form.afetacaoId} onChange={(e) => setForm({ ...form, afetacaoId: e.target.value })}><option value="">— selecionar —</option>{afetacoes.map((a) => <option key={a.id} value={a.id}>{perfis.find((p) => p.id === a.perfilId)?.nome ?? a.perfilId}</option>)}</select></div>
          {perfilSel !== undefined && (perfilSel.consomeBolsaValor || perfilSel.consomeTrabalhosComplementares) && (
            <div className="campo"><label>Tipo de dotação</label><select value={form.tipo} onChange={(e) => setForm({ ...form, tipo: e.target.value })}><option value="">Automático</option><option value="HORAS_BASE">Horas base</option>{perfilSel.consomeBolsaValor && <option value="BOLSA_VALOR">Bolsa de valor</option>}{perfilSel.consomeTrabalhosComplementares && <option value="TRABALHOS_COMPLEMENTARES">Trabalhos complementares</option>}</select></div>
          )}
          <div className="campo"><label>Work item</label><input type="number" value={form.workItemId} onChange={(e) => setForm({ ...form, workItemId: Number(e.target.value) })} /></div>
          <div className="campo"><label>Descrição da atividade</label><textarea rows={2} value={form.descricao} onChange={(e) => setForm({ ...form, descricao: e.target.value })} /></div>
          <div className="aviso" style={{ marginBottom: 10 }}>Não é permitido registar tempo em datas futuras <code>RN-409</code>.</div>
          <div style={{ display: 'flex', gap: 8 }}><button className="btn pri" style={{ flex: 1, justifyContent: 'center' }} disabled={form.afetacaoId === '' || form.descricao === ''} onClick={() => void registar(false)}>Registar</button><button className="btn" disabled={form.afetacaoId === '' || form.descricao === ''} onClick={() => void registar(true)}>Registar e submeter</button></div>
        </div></div>

        <div className="cartao"><h3>Registos</h3><table>
          <thead><tr><th>Data</th>{podeVerTodos && <th>Recurso</th>}<th>Duração</th><th>Atividade</th><th>Estado</th></tr></thead>
          <tbody>{registos.slice(0, 40).map((r) => <tr key={r.id}><td className="tabnum">{r.data}</td>{podeVerTodos && <td>{r.recursoId}</td>}<td className="num">{formatarHoras(r.duracao)}</td><td>{r.descricaoAtividade}</td><td><Estado v={r.estado} /></td></tr>)}
          {registos.length === 0 && <tr><td colSpan={5} className="vazio">Sem registos.</td></tr>}</tbody>
        </table></div>
      </div>
    </>
  );
}
