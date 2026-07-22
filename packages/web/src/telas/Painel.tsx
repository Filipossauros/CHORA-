import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { app } from '../porta/aplicacao-local.js';
import { Cabecalho } from '../app/Shell.js';
import { Barra, Estado, formatarMoeda, useAsync } from '../comum.js';

export function Painel(): ReactNode {
  const navegar = useNavigate();
  const { dados } = useAsync(async () => {
    const contratos = await app.ctx.repos.contratos.todos();
    const registos = await app.ctx.repos.registosTempo.todos();
    const alertas = await app.ctx.repos.alertas.todos();
    const resumos = await Promise.all(contratos.map((c) => app.contratos.resumoExecucao(c.id) as Promise<Resumo>));
    return { contratos, registos, alertas, resumos };
  }, []);

  if (dados === undefined) return <p className="vazio">A carregar…</p>;
  const emVigor = dados.contratos.filter((c) => c.estado === 'EM_VIGOR').length;
  const porAprovar = dados.registos.filter((r) => r.estado === 'SUBMETIDO').length;
  const executado = dados.resumos.reduce((s, r) => s + r.valorExecutado, 0);
  const criticos = dados.alertas.filter((a) => a.severidade === 'CRITICO').length;

  return (
    <>
      <Cabecalho titulo="Visão geral" sub="Estado da execução dos contratos" />
      <div className="grelha-kpi">
        <div className="kpi"><div className="rot">Contratos em vigor</div><div className="val">{emVigor} <span style={{ fontSize: 14, color: 'var(--texto-suave)' }}>/ {dados.contratos.length}</span></div></div>
        <div className="kpi"><div className="rot">Registos por aprovar</div><div className="val">{porAprovar}</div></div>
        <div className="kpi"><div className="rot">Valor executado</div><div className="val">{formatarMoeda(executado)}</div></div>
        <div className="kpi"><div className="rot">Alertas críticos</div><div className="val" style={{ color: criticos > 0 ? 'var(--vermelho)' : undefined }}>{criticos}</div></div>
      </div>
      <div className="duas">
        <div className="cartao">
          <h3>Execução por contrato</h3>
          <table>
            <thead><tr><th>Contrato</th><th>Estado</th><th style={{ width: 180 }}>Valor executado / atual</th></tr></thead>
            <tbody>
              {dados.contratos.map((c) => {
                const r = dados.resumos.find((x) => x.contratoId === c.id);
                const frac = r !== undefined && r.valorAtualContrato > 0 ? r.valorExecutado / r.valorAtualContrato : 0;
                return (
                  <tr key={c.id} className="click" onClick={() => navegar(`/contratos/${c.id}`)}>
                    <td><div className="prim">{c.numero}</div><div className="sec">{c.objeto}</div></td>
                    <td><Estado v={c.estado} /></td>
                    <td><Barra fracao={frac} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="cartao">
          <h3>Alertas recentes</h3>
          <table>
            <tbody>
              {dados.alertas.slice(0, 8).map((a) => (
                <tr key={a.id}><td><div className="prim" style={{ fontSize: 13 }}>{a.titulo}</div><div className="sec">{a.detalhe}</div></td><td style={{ textAlign: 'right' }}><Estado v={a.severidade === 'CRITICO' ? 'REJEITADO' : 'AGUARDA_VISTO'} /></td></tr>
              ))}
              {dados.alertas.length === 0 && <tr><td className="vazio">Sem alertas.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

interface Resumo { contratoId: string; valorExecutado: number; valorAtualContrato: number }
