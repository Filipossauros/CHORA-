import { useMemo, useState, type ReactNode } from 'react';
import { CATALOGO_REGRAS, CATALOGO_ALERTAS } from '@chora/domain';
import { Cabecalho } from '../app/Shell.js';
import { Severidade } from '../comum.js';

/** Área derivada do código RN-xxx, para agrupar. */
function area(codigo: string): string {
  const n = Number(codigo.replace(/[^0-9]/g, '').slice(0, 1));
  return { 1: 'Contrato', 2: 'Prazos e vigência', 3: 'Modificações e complementares', 4: 'Registo de tempo', 5: 'Aprovação e consumo', 6: 'Faturação', 7: 'Afetações e habilitação' }[n] ?? 'Outras';
}

export function Regras(): ReactNode {
  const [q, setQ] = useState('');
  const [aba, setAba] = useState<'negocio' | 'alertas'>('negocio');
  const t = q.trim().toLowerCase();

  const regras = useMemo(() => [...CATALOGO_REGRAS]
    .filter((r) => t === '' || `${r.codigo} ${r.descricao} ${r.base}`.toLowerCase().includes(t))
    .sort((a, b) => (a.codigo < b.codigo ? -1 : 1)), [t]);

  const alertas = useMemo(() => [...CATALOGO_ALERTAS]
    .filter((a) => t === '' || `${a.codigo} ${a.titulo} ${a.descricao} ${a.regraRelacionada ?? ''} ${a.base ?? ''}`.toLowerCase().includes(t))
    .sort((a, b) => (a.codigo < b.codigo ? -1 : 1)), [t]);

  return (
    <>
      <Cabecalho titulo="Regras" sub="Regras determinísticas que condicionam decisões e alertas — transparentes e auditáveis" acoes={
        <input placeholder="Pesquisar…" value={q} onChange={(e) => setQ(e.target.value)} style={{ width: 240 }} />
      } />
      <div className="aviso" style={{ marginBottom: 12 }}>As <b>regras de negócio</b> (RN-xxx) são a única camada que <b>bloqueia</b> ou condiciona decisões. As <b>regras de alertas</b> (AL-xxx) sinalizam preocupações de execução — são sempre consultivas. As sugestões inteligentes (previsões, agente CCP) são indicativas e não vinculativas.</div>

      <div className="abas" style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        <button className={`btn sm ${aba === 'negocio' ? 'pri' : ''}`} onClick={() => setAba('negocio')}>Regras de negócio ({regras.length})</button>
        <button className={`btn sm ${aba === 'alertas' ? 'pri' : ''}`} onClick={() => setAba('alertas')}>Regras de alertas ({alertas.length})</button>
      </div>

      {aba === 'negocio' ? (
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
      ) : (
        <div className="cartao"><table>
          <thead><tr><th>Código</th><th>Alerta</th><th>Condição</th><th>Severidade base</th><th>Regra ligada</th><th>Base legal</th></tr></thead>
          <tbody>{alertas.map((a) => (
            <tr key={a.codigo}>
              <td className="prim"><code>{a.codigo}</code></td>
              <td>{a.titulo}</td>
              <td className="sec">{a.descricao}</td>
              <td><Severidade v={a.severidadeBase} /></td>
              <td className="sec">{a.regraRelacionada !== undefined ? <code>{a.regraRelacionada}</code> : '—'}</td>
              <td className="sec">{a.base ?? '—'}</td>
            </tr>
          ))}{alertas.length === 0 && <tr><td colSpan={6} className="vazio">Sem alertas para a pesquisa.</td></tr>}</tbody>
        </table></div>
      )}
    </>
  );
}
