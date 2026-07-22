import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { app } from '../porta/aplicacao-local.js';
import { Cabecalho } from '../app/Shell.js';
import { Barra, Estado, formatarMoeda, hoje, useAsync } from '../comum.js';
import { calcularCapacidade } from '../capacidade.js';

export function Painel(): ReactNode {
  const navegar = useNavigate();
  const { dados } = useAsync(async () => {
    const contratos = await app.ctx.repos.contratos.todos();
    const registos = await app.ctx.repos.registosTempo.todos();
    const alertas = await app.ctx.repos.alertas.todos();
    const perfis = await app.ctx.repos.perfis.todos();
    const afetacoes = await app.ctx.repos.afetacoes.todos();
    const resumos = await Promise.all(contratos.map((c) => app.contratos.resumoExecucao(c.id) as Promise<Resumo>));
    // Capacidade dos contratos chave-na-mão em vigor (afetação-alvo vs. afetos).
    const hojeStr = hoje();
    const capacidades = contratos
      .filter((c) => c.tipologia === 'CHAVE_NA_MAO' && c.estado === 'EM_VIGOR')
      .map((c) => ({
        contrato: c,
        cap: calcularCapacidade(
          c.dataTerminoContratual, hojeStr,
          perfis.filter((p) => p.contratoId === c.id),
          afetacoes.filter((a) => a.contratoId === c.id),
          registos.filter((r) => r.contratoId === c.id && r.estado === 'APROVADO'),
        ),
      }));
    return { contratos, registos, alertas, resumos, capacidades };
  }, []);

  if (dados === undefined) return <p className="vazio">A carregar…</p>;
  const emVigor = dados.contratos.filter((c) => c.estado === 'EM_VIGOR').length;
  const porAprovar = dados.registos.filter((r) => r.estado === 'SUBMETIDO').length;
  const executado = dados.resumos.reduce((s, r) => s + r.valorExecutado, 0);
  const criticos = dados.alertas.filter((a) => a.severidade === 'CRITICO').length;
  const totalFaltaCM = dados.capacidades.reduce((s, x) => s + x.cap.totalFalta, 0);

  return (
    <>
      <Cabecalho titulo="Visão geral" sub="Estado da execução dos contratos" />
      <div className="grelha-kpi">
        <div className="kpi"><div className="rot">Contratos em vigor</div><div className="val">{emVigor} <span style={{ fontSize: 14, color: 'var(--texto-suave)' }}>/ {dados.contratos.length}</span></div></div>
        <div className="kpi"><div className="rot">Registos por aprovar</div><div className="val">{porAprovar}</div></div>
        <div className="kpi"><div className="rot">Valor executado</div><div className="val">{formatarMoeda(executado)}</div></div>
        <div className="kpi"><div className="rot">Alertas críticos</div><div className="val" style={{ color: criticos > 0 ? 'var(--vermelho)' : undefined }}>{criticos}</div></div>
        {dados.capacidades.length > 0 && <div className="kpi"><div className="rot">Pessoas em falta (chave-na-mão)</div><div className="val" style={{ color: totalFaltaCM > 0 ? 'var(--ambar)' : 'var(--verde)' }}>{totalFaltaCM}</div><div className="sub">face à afetação-alvo</div></div>}
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
      {dados.capacidades.length > 0 && (
        <div className="cartao" style={{ marginTop: 16 }}>
          <h3>Capacidade — contratos chave-na-mão</h3>
          <table>
            <thead><tr><th>Contrato</th><th className="num">Dias úteis restantes</th><th className="num">Pessoas afetas</th><th className="num">Afetação-alvo</th><th className="num">Pessoas em falta</th></tr></thead>
            <tbody>
              {dados.capacidades.map(({ contrato, cap }) => (
                <tr key={contrato.id} className="click" onClick={() => navegar(`/contratos/${contrato.id}`)}>
                  <td><div className="prim">{contrato.numero}</div><div className="sec">{contrato.objeto}</div></td>
                  <td className="num">{cap.dias}</td>
                  <td className="num">{cap.totalAfetas}</td>
                  <td className="num">{cap.algumInfinito ? '—' : cap.totalAlvo}</td>
                  <td className="num" style={{ color: cap.totalFalta > 0 ? 'var(--ambar)' : undefined, fontWeight: 600 }}>{cap.algumInfinito ? '—' : cap.totalFalta}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="aviso" style={{ margin: 12 }}>Afetação-alvo = horas restantes por perfil ÷ (8 h × dias úteis até ao término), à data de hoje. Alvo teórico (8 h/dia, 5 dias/semana; sem feriados/férias).</div>
        </div>
      )}
    </>
  );
}

interface Resumo { contratoId: string; valorExecutado: number; valorAtualContrato: number }
