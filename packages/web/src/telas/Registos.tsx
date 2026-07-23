import { useState, type ReactNode } from 'react';
import { app, nomeAzure } from '../porta/aplicacao-local.js';
import { Cabecalho } from '../app/Shell.js';
import { Estado, formatarHoras, horasParaMin, hoje, mensagemErro, useAsync } from '../comum.js';

export function Registos(): ReactNode {
  const u = app.utilizador();
  const podeVerTodos = app.papeisAtuais().some((p) => p === 'GESTOR_CONTRATO' || p === 'GESTOR_TECNICO');
  const [erro, setErro] = useState<string>();
  const [mostrarAnulados, setMostrarAnulados] = useState(false);
  // Por omissão: hoje e 8 horas de trabalho (unidade = hora, sem minutos).
  const [form, setForm] = useState({ afetacaoId: '', data: hoje(), horas: '8', descricao: '', workItemId: '1001', tipo: '' });

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
  // Sem estado "Rascunho": o registo é submetido de imediato. Anulados escondidos por omissão.
  const registosVis = registos.filter((r) => mostrarAnulados || r.estado !== 'ANULADO');

  async function registar(): Promise<void> {
    setErro(undefined);
    const horas = Number(form.horas);
    if (!Number.isFinite(horas) || horas < 1) { setErro('Indique as horas (inteiras, ≥ 1).'); return; }
    try {
      const criado = await app.registos.criar({ afetacaoId: form.afetacaoId, workItemId: Number(form.workItemId) || 0, data: form.data, duracao: horasParaMin(horas), descricaoAtividade: form.descricao, ...(form.tipo !== '' ? { tipoDotacaoConsumida: form.tipo as never } : {}) }, app.utilizador());
      await app.registos.submeter(criado.id, app.utilizador());
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
            <div className="campo"><label>Horas (inteiras)</label><input type="number" min={1} step={1} value={form.horas} onChange={(e) => setForm({ ...form, horas: e.target.value })} /></div>
          </div>
          <div className="campo"><label>Afetação (perfil)</label><select value={form.afetacaoId} onChange={(e) => setForm({ ...form, afetacaoId: e.target.value })}><option value="">— selecionar —</option>{afetacoes.map((a) => <option key={a.id} value={a.id}>{perfis.find((p) => p.id === a.perfilId)?.nome ?? a.perfilId}</option>)}</select></div>
          {perfilSel !== undefined && (perfilSel.consomeBolsaValor || perfilSel.consomeTrabalhosComplementares) && (
            <div className="campo"><label>Tipo de dotação</label><select value={form.tipo} onChange={(e) => setForm({ ...form, tipo: e.target.value })}><option value="">Automático</option><option value="HORAS_BASE">Horas base</option>{perfilSel.consomeBolsaValor && <option value="BOLSA_VALOR">Bolsa de valor</option>}{perfilSel.consomeTrabalhosComplementares && <option value="TRABALHOS_COMPLEMENTARES">Trabalhos complementares</option>}</select></div>
          )}
          <div className="campo"><label>Work item</label><input type="number" value={form.workItemId} onChange={(e) => setForm({ ...form, workItemId: e.target.value })} /></div>
          <div className="campo"><label>Descrição da atividade</label><textarea rows={2} value={form.descricao} onChange={(e) => setForm({ ...form, descricao: e.target.value })} /></div>
          <div className="aviso" style={{ marginBottom: 10 }}>O registo é submetido de imediato (sem rascunho). Não é permitido registar tempo em datas futuras <code>RN-409</code>.</div>
          <button className="btn pri" style={{ width: '100%', justifyContent: 'center' }} disabled={form.afetacaoId === '' || form.descricao === ''} onClick={() => void registar()}>Registar e submeter</button>
        </div></div>

        <div className="cartao">
          <h3>Registos</h3>
          <div style={{ padding: '0 2px 8px' }}><label className="papel-chip" style={{ cursor: 'pointer' }}><input type="checkbox" checked={mostrarAnulados} onChange={(e) => setMostrarAnulados(e.target.checked)} /> Mostrar anulados</label></div>
          <table>
          <thead><tr><th>Data</th>{podeVerTodos && <th>Recurso</th>}<th>Duração</th><th>Atividade</th><th>Estado</th></tr></thead>
          <tbody>{registosVis.slice(0, 40).map((r) => <tr key={r.id}><td className="tabnum">{r.data}</td>{podeVerTodos && <td>{nomeAzure(r.recursoId)}</td>}<td className="num">{formatarHoras(r.duracao)}</td><td>{r.descricaoAtividade}</td><td><Estado v={r.estado} /></td></tr>)}
          {registosVis.length === 0 && <tr><td colSpan={5} className="vazio">Sem registos.</td></tr>}</tbody>
        </table></div>
      </div>
    </>
  );
}
