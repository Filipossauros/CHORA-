import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { decisoesPendentes, type PapelAplicacional } from '@chora/domain';
import { CATALOGO_CENARIOS } from '@chora/api/nucleo';
import { app, UTILIZADORES } from '../porta/aplicacao-local.js';
import { useMudancas } from '../comum.js';

/**
 * Navegação orientada ao TRABALHO, não à arquitetura.
 *
 * TRÊS destinos de trabalho. Eram onze — cinco no menu e seis na gaveta — e a
 * conta não era de arrumação: eram ecrãs a mais para uma aplicação que ainda
 * não faz bem o essencial. A conferência de faturas, os relatórios e a
 * orçamentação ficaram EM ESPERA: saiu a interface, ficaram os serviços, as
 * regras e os testes. O assistente saiu pela mesma razão, e volta quando o que
 * está debaixo dele for indispensável.
 *
 * Os relatórios não foram uma escolha difícil: metade do ecrã eram as perguntas
 * compostas no assistente, e a outra metade — consumo de um contrato, faturação
 * do ano — pertence à ficha do contrato e à faturação. Sem o assistente, o ecrã
 * dissolvia-se sozinho.
 *
 * O que é documentação (Regras e alertas), administração (Auditoria, Acessos) ou
 * consulta (Recursos) continua numa gaveta, acessível mas fora do caminho do
 * trabalho diário.
 */
/**
 * Quem entra em cada destino. A lateral aparece a toda a gente — é a moldura da
 * aplicação, e sem ela o ecrã fica a pairar — mas mostra a cada um só o que lhe
 * compete: o validador vê a validação de horas, o elemento vê o registo de
 * horas, e mais nada.
 *
 * Isto é a UI. Quem recusa a sério são os serviços, que verificam o papel antes
 * de qualquer efeito: forçar a rota pela consola mostra a recusa, não os dados.
 */
export type Acesso = 'admin' | 'gestao' | 'aprovacao' | 'registo';
const QUEM: Record<Acesso, ReadonlyArray<PapelAplicacional>> = {
  admin: ['ADMINISTRADOR'],
  gestao: ['ADMINISTRADOR', 'GESTOR_CONTRATO'],
  aprovacao: ['ADMINISTRADOR', 'GESTOR_CONTRATO', 'VALIDADOR'],
  registo: ['ADMINISTRADOR', 'GESTOR_CONTRATO', 'VALIDADOR', 'ELEMENTO_EQUIPA_TECNICA'],
};

const NAV = [
  { grupo: 'Trabalho', itens: [
    { to: '/', rot: 'Hoje', fim: true, acesso: 'gestao' as Acesso, ic: 'M3 9.6 12 3l9 6.6V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1V9.6Z' },
    { to: '/contratos', rot: 'Contratos', acesso: 'gestao' as Acesso, ic: 'M6 3h9l4 4v14a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1ZM14 3v5h5' },
    { to: '/registos', rot: 'Registos e aprovações', acesso: 'registo' as Acesso, ic: 'M4 5.5A1.5 1.5 0 0 1 5.5 4h13A1.5 1.5 0 0 1 20 5.5v13a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 18.5v-13ZM8.5 12.5l2.4 2.4 4.6-5' },
  ] },
];

/** Gaveta: transparência, administração e consulta. */
const GAVETA = [
  { to: '/regras', rot: 'Regras e alertas', ic: 'M18 8a6 6 0 1 0-12 0c0 7-3 8-3 8h18s-3-1-3-8ZM10.3 21a2 2 0 0 0 3.4 0' },
  { to: '/recursos', rot: 'Recursos', ic: 'M12.4 8a3.4 3.4 0 1 1-6.8 0 3.4 3.4 0 0 1 6.8 0ZM2.8 20c0-3.4 2.8-5.2 6.2-5.2s6.2 1.8 6.2 5.2M16.4 5.6a3.4 3.4 0 0 1 0 5M21.2 20c0-2.7-1.1-4.2-2.8-4.8' },
  { to: '/auditoria', rot: 'Auditoria', ic: 'M7 3h10a2 2 0 0 1 2 2v16l-7-3.4L5 21V5a2 2 0 0 1 2-2Z' },
  { to: '/acessos', rot: 'Acessos', ic: 'M4 12.5A2.5 2.5 0 0 1 6.5 10h11a2.5 2.5 0 0 1 2.5 2.5v6a2.5 2.5 0 0 1-2.5 2.5h-11A2.5 2.5 0 0 1 4 18.5v-6ZM8.4 10V7a3.6 3.6 0 0 1 7.2 0v3' },
  { to: '/dados', rot: 'Dados de demonstração', ic: 'M19.5 6c0 1.8-3.4 3.2-7.5 3.2S4.5 7.8 4.5 6 7.9 2.8 12 2.8 19.5 4.2 19.5 6ZM4.5 6v12c0 1.8 3.4 3.2 7.5 3.2s7.5-1.4 7.5-3.2V6M4.5 12c0 1.8 3.4 3.2 7.5 3.2s7.5-1.4 7.5-3.2' },
];

/**
 * O destino operacional chama-se — e aponta para — coisas diferentes conforme
 * quem olha: o gestor tem os dois passos do fluxo, o validador só decide, o
 * elemento só regista. Um item de menu que promete o que o ecrã não dá é pior
 * do que um menu curto; e apontar para a rota errada deixava-o por acender,
 * porque quem valida entra em `/aprovacoes` e não em `/registos`.
 */
function destinoOperacao(gere: boolean, aprova: boolean): { to: string; rot: string } {
  if (gere) return { to: '/registos', rot: 'Registos e aprovações' };
  if (aprova) return { to: '/aprovacoes', rot: 'Aprovações' };
  return { to: '/registos', rot: 'Registos de tempo' };
}

/** Ícone de traço do menu e dos botões. */
function Ic({ d, tam = 18, largura = 1.9, classe }: { d: string; tam?: number; largura?: number; classe?: string }): ReactNode {
  return (
    <svg className={classe} width={tam} height={tam} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={largura} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={d} />
    </svg>
  );
}

/**
 * Nome curto do cenário para a barra de sessão. Estar a demonstrar e não saber
 * em que dados se está é metade do problema.
 */
const NOME_CENARIO: Record<string, string> = Object.fromEntries(
  CATALOGO_CENARIOS.map((c) => [c.id, c.id === 'cobertura' ? 'Dados: cobertura' : `Dados: ${c.nome.toLowerCase()}`]),
);

const embebido = new URLSearchParams(location.search).get('host') === 'ado';

/**
 * A sessão é lida pelo cabeçalho de cada página, mas quem a troca é a casca —
 * porque trocar de utilizador remonta o conteúdo. O contexto liga os dois sem
 * obrigar cada ecrã a passar o estado à mão.
 */
const CtxSessao = createContext<{ uid: string; trocar: (id: string) => void }>({ uid: '', trocar: () => {} });

/** Verdadeiro se algum dos papéis abre este destino. */
export function temAcesso(papeis: ReadonlyArray<PapelAplicacional>, acesso: Acesso): boolean {
  return papeis.some((p) => QUEM[acesso].includes(p));
}

export function Shell({ children }: { children: ReactNode }): ReactNode {
  const [uid, setUid] = useState(app.utilizador().utilizadorId);
  const [gavetaAberta, setGavetaAberta] = useState(false);
  const [pendentes, setPendentes] = useState(0);
  const [vencidas, setVencidas] = useState(0);
  const navegar = useNavigate();
  const local = useLocation();
  const naRaiz = local.pathname === '/';
  const papeis = app.papeisAtuais();
  const gere = app.podeGerir();
  const aprova = app.podeAprovar();

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

  return (
    <CtxSessao.Provider value={{ uid, trocar: trocarUtilizador }}>
      <div className={`app${embebido ? ' embebido' : ''}`}>
        <aside className="lateral">
          <div className="marca"><div className="logo">C+</div><div><b>CHORA+</b><span>Controlo de horas</span></div></div>
          {/* Um grupo sem destinos visíveis é um título sobre o vazio: não se desenha. */}
          {NAV.map((g) => ({ ...g, itens: g.itens.filter((i) => temAcesso(papeis, i.acesso)) }))
            .filter((g) => g.itens.length > 0).map((g) => (
            <div key={g.grupo}>
              <div className="grupo">{g.grupo}</div>
              {g.itens.map((i) => {
                const d = i.to === '/registos' ? destinoOperacao(gere, aprova) : { to: i.to, rot: i.rot };
                return (
                  <NavLink key={i.to} to={d.to} end={('fim' in i && i.fim) || false} className={({ isActive }) => `nav-i${isActive ? ' ativo' : ''}`}>
                    <Ic d={i.ic} classe="ic" />
                    {d.rot}
                    {i.to === '/' && pendentes > 0 && (
                      <span className="cnt" style={vencidas > 0 ? undefined : { background: 'var(--marca-3)' }}>{pendentes}</span>
                    )}
                  </NavLink>
                );
              })}
            </div>
          ))}
          {gere && <div>
            <button
              onClick={() => setGavetaAberta(!gavetaAberta)}
              aria-expanded={gavetaAberta}
              className="grupo"
              style={{ background: 'none', border: 'none', width: '100%', textAlign: 'left', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 7, fontFamily: 'inherit' }}
            >
              Configurações e outros
              <span style={{ marginLeft: 'auto' }}><Ic d={gavetaAberta ? 'm6 9 6 6 6-6' : 'm9 6 6 6-6 6'} tam={13} largura={2.4} /></span>
            </button>
            {gavetaAberta && GAVETA.map((i) => (
              <NavLink key={i.to} to={i.to} className={({ isActive }) => `nav-i${isActive ? ' ativo' : ''}`}>
                <Ic d={i.ic} classe="ic" />{i.rot}
              </NavLink>
            ))}
          </div>}

          <div className="fim" />
          <div className="quem">
            <b>{UTILIZADORES.find((u) => u.id === uid)?.nome ?? '—'}</b>
            Sessão iniciada
          </div>
        </aside>

        <div className="principal">
          <div className="conteudo" key={uid}>
            {gere && !naRaiz && <div style={{ marginBottom: 14 }}><button className="btn sm" onClick={() => navegar(-1)} title="Voltar ao ecrã anterior">← Voltar</button></div>}
            {children}
          </div>
        </div>
      </div>
    </CtxSessao.Provider>
  );
}

/** Barra de sessão: que dados estão carregados, e com que papel se está a ver. */
function BarraSessao(): ReactNode {
  const { uid, trocar } = useContext(CtxSessao);
  const navegar = useNavigate();
  const nome = UTILIZADORES.find((u) => u.id === uid)?.nome ?? 'Gestor de Contrato';
  const iniciais = nome.split(' ').map((p) => p[0]).slice(0, 2).join('');
  /*
    Trocar de conjunto de dados e trocar de papel são controlos de demonstração,
    e são de quem gere. A quem só regista ou só valida, o seletor de papel seria
    uma porta para o que lhe está vedado — e o botão dos dados levá-lo-ia a uma
    recusa, porque o ecrã dos dados também não é seu.
  */
  const gere = app.podeGerir();

  function alternarTema(): void {
    const raiz = document.documentElement;
    const atual = raiz.getAttribute('data-theme') ?? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    raiz.setAttribute('data-theme', atual === 'dark' ? 'light' : 'dark');
  }

  return (
    <>
      <button className="btn ico" onClick={alternarTema} title="Alternar tema">
        <Ic d="M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9-9v18" tam={17} largura={1.8} />
      </button>
      {gere && (
        <button className="btn" onClick={() => navegar('/dados')} title="Que conjunto de dados está carregado — e como trocar">
          <Ic d="M19 6c0 1.7-3.1 3-7 3s-7-1.3-7-3 3.1-3 7-3 7 1.3 7 3ZM5 6v12c0 1.7 3.1 3 7 3s7-1.3 7-3V6" tam={15} largura={1.8} />
          {NOME_CENARIO[app.cenarioAtual()] ?? 'Dados'}
        </button>
      )}
      <label className="papel-chip">
        {gere ? (
          <select value={uid} onChange={(e) => trocar(e.target.value)} style={{ border: 'none', background: 'transparent', padding: 0, boxShadow: 'none' }}>
            {UTILIZADORES.map((u) => <option key={u.id} value={u.id}>{u.nome}</option>)}
          </select>
        ) : <span>{nome}</span>}
        <span className="av">{iniciais}</span>
      </label>
      {/* Havendo entrada tem de haver saída, e no sítio onde se vê quem entrou. */}
      <button className="btn ico" title="Terminar sessão" onClick={() => { app.terminarSessao(); location.reload(); }}>
        <Ic d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3M10 16l-4-4 4-4M6 12h11" tam={17} largura={1.8} />
      </button>
    </>
  );
}

/**
 * Cabeçalho de página: título à esquerda, sessão à direita e as ações do ecrã
 * por baixo dela. A sessão vive aqui e não numa barra flutuante porque flutuar
 * sobre o conteúdo é tapá-lo — e era exatamente o que fazia sobre as ações.
 */
export function Cabecalho({ titulo, sub, acoes, migalha }: {
  titulo: string; sub?: string; acoes?: ReactNode; migalha?: ReactNode;
}): ReactNode {
  return (
    <header className="cabeca">
      <div>
        {migalha}
        <h1>{titulo}</h1>
        {sub !== undefined && <div className="sub">{sub}</div>}
      </div>
      <div className="dir">
        <div className="linha1"><BarraSessao /></div>
        {acoes !== undefined && <div className="linha1">{acoes}</div>}
      </div>
    </header>
  );
}
