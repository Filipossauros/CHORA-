import { useState, type ReactNode } from 'react';
import { useParams } from 'react-router-dom';
import { app } from '../porta/aplicacao-local.js';
import { Cabecalho } from '../app/Shell.js';
import { Barra, Estado, formatarDuracao, formatarMoeda, pct, useAsync } from '../comum.js';

const TABS = ['Ficha', 'Estrutura', 'Afetações', 'Execução financeira', 'Alterações'] as const;
type Tab = (typeof TABS)[number];

export function ContratoDetalhe(): ReactNode {
  const { id = '' } = useParams();
  const [tab, setTab] = useState<Tab>('Estrutura');
  const { dados } = useAsync(async () => {
    const contrato = await app.ctx.repos.contratos.obter(id);
    const perfis = await app.ctx.repos.perfis.todos((p) => p.contratoId === id);
    const dotacoes = await app.ctx.repos.dotacoes.todos((d) => d.contratoId === id);
    const afetacoes = await app.ctx.repos.afetacoes.todos((a) => a.contratoId === id);
    const alteracoes = await app.ctx.repos.alteracoes.todos((a) => a.contratoId === id);
    const resumo = await app.contratos.resumoExecucao(id) as ResumoExec;
    return { contrato, perfis, dotacoes, afetacoes, alteracoes, resumo };
  }, [id]);

  if (dados === undefined || dados.contrato === null) return <p className="vazio">A carregar…</p>;
  const c = dados.contrato;

  return (
    <>
      <Cabecalho titulo={`${c.numero} · ${c.objeto}`} sub="Detalhe do contrato" acoes={<Estado v={c.estado} />} />
      <div className="seps">{TABS.map((t) => <button key={t} className={`sep${tab === t ? ' ativo' : ''}`} onClick={() => setTab(t)}>{t}</button>)}</div>

      {tab === 'Ficha' && (
        <div className="cartao"><div className="corpo g3">
          <Campo k="Prestador" v={c.prestador.nome} /><Campo k="NIPC" v={c.prestador.nipc} /><Campo k="Unidade" v={c.unidadeMedida} />
          <Campo k="Valor inicial do contrato" v={formatarMoeda(c.precoContratualInicial)} /><Campo k="Valor atual do contrato" v={formatarMoeda(c.precoContratualAtual)} /><Campo k="Vigência" v={`${c.dataInicioVigencia} – ${c.dataTerminoContratual}`} />
          <Campo k="Visto do TdC necessário" v={c.vistoTribunalContasNecessario ? 'Sim' : 'Não'} /><Campo k="Gestores" v={c.gestores.map((g) => g.utilizadorId).join(', ')} />
        </div></div>
      )}

      {tab === 'Estrutura' && (
        <div className="duas">
          <div className="cartao"><h3>Perfis contratuais</h3><table>
            <thead><tr><th>Perfil</th><th className="num">Horas</th><th className="num">€/hora vigente</th></tr></thead>
            <tbody>{dados.perfis.map((p) => { const ultimo = p.precos[p.precos.length - 1]; return (
              <tr key={p.id}><td><div className="prim">{p.nome}</div>{p.consomeBolsaValor && <div className="sec">consome bolsa de valor</div>}</td><td className="num">{formatarDuracao(p.quantidadePrevista)}</td><td className="num">{ultimo ? formatarMoeda(ultimo.valorHora) : '—'}</td></tr>
            ); })}{dados.perfis.length === 0 && <tr><td colSpan={3} className="vazio">Sem perfis.</td></tr>}</tbody>
          </table></div>
          <div className="cartao"><h3>Dotações</h3><table>
            <thead><tr><th>Tipo</th><th className="num">Valor</th></tr></thead>
            <tbody>{dados.dotacoes.map((d) => <tr key={d.id}><td><Estado v={d.tipo === 'HORAS_BASE' ? 'RECEBIDA' : d.tipo === 'BOLSA_VALOR' ? 'SUSPENSO' : 'AGUARDA_VISTO'} /></td><td className="num">{formatarMoeda(d.valor)}</td></tr>)}
            {dados.dotacoes.length === 0 && <tr><td colSpan={2} className="vazio">Sem dotações.</td></tr>}</tbody>
          </table></div>
        </div>
      )}

      {tab === 'Afetações' && (
        <div className="cartao"><h3>Afetações (ativa/inativa)</h3><table>
          <thead><tr><th>Recurso</th><th>Perfil</th><th>Projetos</th><th>Vigência</th><th>Estado</th></tr></thead>
          <tbody>{dados.afetacoes.map((a) => <tr key={a.id}><td>{a.recursoId}</td><td>{dados.perfis.find((p) => p.id === a.perfilId)?.nome ?? a.perfilId}</td><td>{a.projetoIds.map((p) => <span key={p} className="chip" style={{ marginRight: 4 }}>{p}</span>)}</td><td className="tabnum">{a.vigenteDe}{a.vigenteAte !== undefined ? ` – ${a.vigenteAte}` : ''}</td><td><Estado v={a.ativa ? 'Ativa' : 'Inativa'} /></td></tr>)}
          {dados.afetacoes.length === 0 && <tr><td colSpan={5} className="vazio">Sem afetações.</td></tr>}</tbody>
        </table></div>
      )}

      {tab === 'Execução financeira' && (
        <>
          <div className="grelha-kpi">
            <div className="kpi"><div className="rot">Valor inicial do contrato</div><div className="val">{formatarMoeda(dados.resumo.valorInicialContrato)}</div></div>
            <div className="kpi"><div className="rot">Valor atual do contrato</div><div className="val">{formatarMoeda(dados.resumo.valorAtualContrato)}</div></div>
            <div className="kpi"><div className="rot">Valor imputado (aprovado)</div><div className="val">{formatarMoeda(dados.resumo.valorImputadoTotal)}</div></div>
            <div className="kpi"><div className="rot">Trabalhos complementares</div><div className="val" style={{ color: dados.resumo.complementares.atingido ? 'var(--vermelho)' : undefined }}>{pct(dados.resumo.complementares.percentagem)}</div><div className="sub">{dados.resumo.complementares.atingido ? 'Limite de 50% ATINGIDO' : `Disponível ${formatarMoeda(dados.resumo.complementares.disponivel)}`}</div></div>
          </div>
          <div className="cartao"><h3>Saldos por perfil — horas e valor restantes</h3><table>
            <thead><tr><th>Perfil</th><th className="num">Horas restantes</th><th style={{ width: 130 }}>Consumo horas</th><th className="num">Valor restante</th></tr></thead>
            <tbody>{dados.resumo.saldosPerfis.map((s) => { const frac = s.minutosPrevistos > 0 ? s.minutosConsumidos / s.minutosPrevistos : 0; return (
              <tr key={s.perfilId}><td className="prim">{s.nome}</td><td className="num">{formatarDuracao(s.minutosRestantes)}<div className="sec">de {formatarDuracao(s.minutosPrevistos)}</div></td><td><Barra fracao={frac} /></td><td className="num">{formatarMoeda(s.valorRestante)}<div className="sec">de {formatarMoeda(s.valorPrevisto)}</div></td></tr>
            ); })}{dados.resumo.saldosPerfis.length === 0 && <tr><td colSpan={4} className="vazio">Sem perfis.</td></tr>}</tbody>
          </table></div>
        </>
      )}

      {tab === 'Alterações' && (
        <div className="cartao"><h3>Alterações (histórico imutável)</h3><table>
          <thead><tr><th>Data efeito</th><th>Tipo</th><th>Fundamentação</th><th className="num">Valor</th><th>Publicitação</th></tr></thead>
          <tbody>{dados.alteracoes.map((a) => <tr key={a.id}><td className="tabnum">{a.dataEfeito}</td><td>{a.tipo.replace(/_/g, ' ').toLowerCase()}</td><td>{a.fundamentacao}</td><td className="num">{a.valorAcrescido !== undefined ? formatarMoeda(a.valorAcrescido) : '—'}</td><td>{a.publicitacaoPortalBase?.efetuadaEm !== undefined ? <Estado v="VALIDADA" /> : a.publicitacaoPortalBase?.obrigatoria ? <Estado v="INVALIDADA" /> : '—'}</td></tr>)}
          {dados.alteracoes.length === 0 && <tr><td colSpan={5} className="vazio">Sem alterações.</td></tr>}</tbody>
        </table></div>
      )}
    </>
  );
}

function Campo({ k, v }: { k: string; v: string }): ReactNode {
  return <div className="campo" style={{ margin: 0 }}><label>{k}</label><div style={{ fontWeight: 600, fontSize: 13.5 }}>{v}</div></div>;
}

interface ResumoExec {
  valorInicialContrato: number; valorAtualContrato: number; valorImputadoTotal: number;
  complementares: { percentagem: number; atingido: boolean; disponivel: number };
  saldosPerfis: Array<{ perfilId: string; nome: string; minutosPrevistos: number; minutosConsumidos: number; minutosRestantes: number; valorPrevisto: number; valorRestante: number }>;
}
