import { useState, type ReactNode } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { app, UTILIZADORES } from '../porta/aplicacao-local.js';

const NAV = [
  { grupo: 'Painel', itens: [{ to: '/', rot: 'Visão geral', fim: true }] },
  { grupo: 'Gestão', itens: [
    { to: '/contratos', rot: 'Contratos' },
  ] },
  { grupo: 'Operação', itens: [{ to: '/registos', rot: 'Registos de tempo' }, { to: '/aprovacoes', rot: 'Aprovações' }] },
  { grupo: 'Financeiro', itens: [{ to: '/faturacao', rot: 'Faturação' }] },
  { grupo: 'Análise', itens: [
    { to: '/recursos', rot: 'Recursos' },
    { to: '/relatorios', rot: 'Relatórios' }, { to: '/previsoes', rot: 'Previsões' },
    { to: '/alertas', rot: 'Alertas' }, { to: '/recomendacoes', rot: 'Recomendações' },
    { to: '/regras', rot: 'Regras' },
    { to: '/auditoria', rot: 'Auditoria' }, { to: '/acessos', rot: 'Acessos' },
  ] },
];

const embebido = new URLSearchParams(location.search).get('host') === 'ado';

export function Shell({ children }: { children: ReactNode }): ReactNode {
  const [uid, setUid] = useState(app.utilizador().utilizadorId);
  const navegar = useNavigate();
  const local = useLocation();
  const naRaiz = local.pathname === '/';

  function trocarUtilizador(id: string): void {
    app.setUtilizador(id);
    setUid(id); // muda a key do conteúdo → remonta a vista e recarrega os dados
  }

  function alternarTema(): void {
    const raiz = document.documentElement;
    const atual = raiz.getAttribute('data-theme') ?? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    raiz.setAttribute('data-theme', atual === 'dark' ? 'light' : 'dark');
  }

  const iniciais = (UTILIZADORES.find((u) => u.id === uid)?.nome ?? 'GC').split(' ').map((p) => p[0]).slice(0, 2).join('');

  return (
    <div className={`app${embebido ? ' embebido' : ''}`}>
      <aside className="lateral">
        <div className="marca"><div className="logo">C+</div><div><b>CHORA+</b><span>Controlo de horas</span></div></div>
        {NAV.map((g) => (
          <div key={g.grupo}>
            <div className="grupo">{g.grupo}</div>
            {g.itens.map((i) => (
              <NavLink key={i.to} to={i.to} end={('fim' in i && i.fim) || false} className={({ isActive }) => `nav-i${isActive ? ' ativo' : ''}`}>{i.rot}</NavLink>
            ))}
          </div>
        ))}
      </aside>
      <div className="principal">
        <div className="conteudo" key={uid} style={{ paddingTop: 30 }}>
          {!naRaiz && <div style={{ marginBottom: 14 }}><button className="btn sm" onClick={() => navegar(-1)} title="Voltar ao ecrã anterior">← Voltar</button></div>}
          {children}
        </div>
      </div>
      {/* Barra de sessão fixa no topo (renderizada por portal simplificado) */}
      <div style={{ position: 'fixed', top: 10, right: 18, display: 'flex', gap: 10, zIndex: 20, alignItems: 'center' }}>
        <button className="btn sm" onClick={alternarTema} title="Alternar tema">◑</button>
        <button className="btn sm" onClick={() => void app.reporSeed()} title="Repor dados de demonstração">Repor seed</button>
        <label className="papel-chip">
          <select value={uid} onChange={(e) => trocarUtilizador(e.target.value)} style={{ border: 'none', background: 'transparent', padding: 0 }}>
            {UTILIZADORES.map((u) => <option key={u.id} value={u.id}>{u.nome}</option>)}
          </select>
          <span className="av">{iniciais}</span>
        </label>
      </div>
    </div>
  );
}

/** Cabeçalho de página (título + subtítulo + ações à direita). */
export function Cabecalho({ titulo, sub, acoes }: { titulo: string; sub?: string; acoes?: ReactNode }): ReactNode {
  return (
    <div style={{ display: 'flex', alignItems: 'center', marginBottom: 16, gap: 12 }}>
      <div><h1 style={{ margin: 0, fontSize: 19 }}>{titulo}</h1>{sub !== undefined && <p style={{ margin: '3px 0 0', fontSize: 12, color: 'var(--texto-suave)' }}>{sub}</p>}</div>
      <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>{acoes}</div>
    </div>
  );
}
