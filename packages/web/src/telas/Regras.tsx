import { useMemo, useState, type ReactNode } from 'react';
import { CATALOGO_REGRAS } from '@chora/domain';
import { Cabecalho } from '../app/Shell.js';

/** Área derivada do código RN-xxx, para agrupar. */
function area(codigo: string): string {
  const n = Number(codigo.replace(/[^0-9]/g, '').slice(0, 1));
  return { 1: 'Contrato', 2: 'Prazos e vigência', 3: 'Modificações e complementares', 4: 'Registo de tempo', 5: 'Aprovação e consumo', 6: 'Faturação', 7: 'Afetações e habilitação' }[n] ?? 'Outras';
}

export function Regras(): ReactNode {
  const [q, setQ] = useState('');
  const regras = useMemo(() => {
    const t = q.trim().toLowerCase();
    return [...CATALOGO_REGRAS]
      .filter((r) => t === '' || `${r.codigo} ${r.descricao} ${r.base}`.toLowerCase().includes(t))
      .sort((a, b) => (a.codigo < b.codigo ? -1 : 1));
  }, [q]);

  return (
    <>
      <Cabecalho titulo="Regras" sub="Regras determinísticas que condicionam decisões e aprovações — transparentes e auditáveis" acoes={
        <input placeholder="Pesquisar regra…" value={q} onChange={(e) => setQ(e.target.value)} style={{ width: 240 }} />
      } />
      <div className="aviso" style={{ marginBottom: 12 }}>Estas regras são <b>heurísticas</b> (não dependem de IA generativa) e são a única camada que <b>bloqueia</b> ou condiciona decisões. As sugestões inteligentes (previsões, agente CCP) são indicativas e não vinculativas.</div>
      <div className="cartao"><table>
        <thead><tr><th>Código</th><th>Regra</th><th>Área</th><th>Base legal</th><th>Efeito</th><th>Exceção</th></tr></thead>
        <tbody>{regras.map((r) => (
          <tr key={r.codigo}>
            <td className="prim"><code>{r.codigo}</code></td>
            <td>{r.descricao}</td>
            <td className="sec">{area(r.codigo)}</td>
            <td className="sec">{r.base && r.base !== '—' ? r.base : '—'}</td>
            <td><span className={`pill ${r.bloqueia === false ? 'p-azul' : 'p-verm'}`}>{r.bloqueia === false ? 'Consultiva' : 'Bloqueia'}</span></td>
            <td>{r.excecaoFundamentavel ? <span className="pill p-ambar">Fundamentável</span> : '—'}</td>
          </tr>
        ))}{regras.length === 0 && <tr><td colSpan={6} className="vazio">Sem regras para a pesquisa.</td></tr>}</tbody>
      </table></div>
    </>
  );
}
