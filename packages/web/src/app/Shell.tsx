import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { decisoesPendentes } from '@chora/domain';
import { app, UTILIZADORES } from '../porta/aplicacao-local.js';
import { useMudancas } from '../comum.js';

/**
 * Navegação orientada ao TRABALHO, não à arquitetura.
 *
 * Passou de 13 destinos para 5: «Hoje» colapsa Alertas, Previsões e
 * recomendações — eram a mesma pergunta separada por quem a produzia: as opções
 * de atuação vivem hoje dentro da própria decisão, com prazo e destino. O que é
 * documentação (Regras e alertas), administração (Auditoria, Acessos) ou
 * consulta (Recursos, Previsões) vive numa gaveta, acessível mas
 * fora do caminho do trabalho diário.
 */
const NAV = [
  { grupo: 'Trabalho', itens: [
    { to: '/', rot: 'Hoje', fim: true },
    { to: '/contratos', rot: 'Contratos' },
    { to: '/registos', rot: 'Registos e aprovações' },
    { to: '/faturacao', rot: 'Faturação' },
  ] },
  { grupo: 'Análise', itens: [{ to: '/relatorios', rot: 'Relatórios' }] },
];

/** Gaveta: transparência, administração e consulta. */
const GAVETA = [
  { to: '/regras', rot: 'Regras e alertas' },
  { to: '/previsoes', rot: 'Previsões' },
  { to: '/recursos', rot: 'Recursos' },
  { to: '/auditoria', rot: 'Auditoria' },
  { to: '/acessos', rot: 'Acessos' },
];

const embebido = new URLSearchParams(location.search).get('host') === 'ado';

export function Shell({ children }: { children: ReactNode }): ReactNode {
  const [uid, setUid] = useState(app.utilizador().utilizadorId);
  const [gavetaAberta, setGavetaAberta] = useState(false);
  const [pendentes, setPendentes] = useState(0);
  const [vencidas, setVencidas] = useState(0);
  const navegar = useNavigate();
  const local = useLocation();
  const naRaiz = local.pathname === '/';

  // Contagem de decisões pendentes no menu — o sinal que traz o gestor de volta.
  const contar = useCallback(() => {
    void (async () => {
      const abertas = decisoesPendentes(await app.ctx.repos.alertas.todos());
      setPendentes(abertas.length);
      setVencidas(abertas.filter((a) => (a.diasParaLimite ?? 1) < 0).length);
    })();
  }, []);
  useEffect(contar, [contar, local.pathname, uid]);
  // Reage também a mutações feitas noutra vista (dispensa, ato registado).
  useMudancas(contar);

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
      <aside className="lateral" style={{ display: 'flex', flexDirection: 'column' }}>
        <div className="marca"><div className="logo">C+</div><div><b>CHORA+</b><span>Controlo de horas</span></div></div>
        {NAV.map((g) => (
          <div key={g.grupo}>
            <div className="grupo">{g.grupo}</div>
            {g.itens.map((i) => (
              <NavLink key={i.to} to={i.to} end={('fim' in i && i.fim) || false} className={({ isActive }) => `nav-i${isActive ? ' ativo' : ''}`}>
                {i.rot}
                {i.to === '/' && pendentes > 0 && <span className="cnt" style={vencidas > 0 ? { background: 'var(--vermelho)', color: '#fff' } : undefined}>{pendentes}</span>}
              </NavLink>
            ))}
          </div>
        ))}
        <div style={{ marginTop: 'auto', paddingTop: 14 }}>
          <button
            onClick={() => setGavetaAberta(!gavetaAberta)}
            aria-expanded={gavetaAberta}
            className="grupo"
            style={{ background: 'none', border: 'none', width: '100%', textAlign: 'left', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 7, fontFamily: 'inherit' }}
          >
            <span aria-hidden="true">⚙</span> Configuração e transparência <span style={{ marginLeft: 'auto' }}>{gavetaAberta ? '▾' : '▸'}</span>
          </button>
          {gavetaAberta && GAVETA.map((i) => (
            <NavLink key={i.to} to={i.to} className={({ isActive }) => `nav-i${isActive ? ' ativo' : ''}`}>{i.rot}</NavLink>
          ))}
        </div>
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
