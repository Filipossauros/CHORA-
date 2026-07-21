import { useState, type ReactNode } from 'react';
import { app } from '../porta/aplicacao-local.js';
import { Cabecalho } from '../app/Shell.js';
import { Barra, formatarDuracao, formatarMoeda, useAsync } from '../comum.js';

export function Relatorios(): ReactNode {
  const [contratoId, setContratoId] = useState('');
  const base = useAsync(async () => {
    const contratos = await app.ctx.repos.contratos.todos();
    const cid = contratoId || contratos[0]?.id || '';
    const resumo = await app.contratos.resumoExecucao(cid) as { saldosPerfis: Array<{ perfilId: string; nome: string; minutosPrevistos: number; minutosConsumidos: number; valorConsumido: number; valorPrevisto: number }> };
    return { contratos, cid, resumo };
  }, [contratoId]);

  if (base.dados === undefined) return <p className="vazio">A carregar…</p>;
  const { contratos, cid, resumo } = base.dados;

  return (
    <>
      <Cabecalho titulo="Relatórios" sub="Horas por perfil · execução financeira" acoes={
        <select value={cid} onChange={(e) => setContratoId(e.target.value)}>{contratos.map((c) => <option key={c.id} value={c.id}>{c.numero}</option>)}</select>
      } />
      <div className="cartao"><h3>Horas consumidas por perfil</h3><table>
        <thead><tr><th>Perfil</th><th className="num">Consumidas / previstas</th><th style={{ width: 160 }}>Consumo</th><th className="num">Valor consumido</th></tr></thead>
        <tbody>{resumo.saldosPerfis.map((s) => { const frac = s.minutosPrevistos > 0 ? s.minutosConsumidos / s.minutosPrevistos : 0; return (
          <tr key={s.perfilId}><td className="prim">{s.nome}</td><td className="num">{formatarDuracao(s.minutosConsumidos)} / {formatarDuracao(s.minutosPrevistos)}</td><td><Barra fracao={frac} /></td><td className="num">{formatarMoeda(s.valorConsumido)}</td></tr>
        ); })}{resumo.saldosPerfis.length === 0 && <tr><td colSpan={4} className="vazio">Sem dados.</td></tr>}</tbody>
      </table></div>
    </>
  );
}
