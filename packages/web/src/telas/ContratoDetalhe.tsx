import { useState, type ReactNode } from 'react';
import { useParams } from 'react-router-dom';
import type { Afetacao, Contrato, EstadoContrato, PerfilContratual, RegistoTempo } from '@chora/domain';
import { app, nomeAzure } from '../porta/aplicacao-local.js';
import { Cabecalho } from '../app/Shell.js';
import { Barra, Estado, formatarHoras, formatarMoeda, hoje, mensagemErro, pct, useAsync } from '../comum.js';
import { calcularCapacidade } from '../capacidade.js';

const TABS = ['Ficha', 'Estrutura', 'Afetações', 'Execução financeira', 'Capacidade', 'Alterações'] as const;
type Tab = (typeof TABS)[number];

const ESTADOS_INATIVACAO: EstadoContrato[] = ['SUSPENSO', 'TERMINADO', 'RESOLVIDO', 'CADUCADO', 'REVOGADO'];

export function ContratoDetalhe(): ReactNode {
  const { id = '' } = useParams();
  const [tab, setTab] = useState<Tab>('Ficha');
  const podeGerir = app.papeisAtuais().some((p) => p === 'GESTOR_CONTRATO' || p === 'GESTOR_TECNICO');
  const [erro, setErro] = useState<string>();
  const [editar, setEditar] = useState(false);

  const base = useAsync(async () => {
    const contrato = await app.ctx.repos.contratos.obter(id);
    const perfis = await app.ctx.repos.perfis.todos((p) => p.contratoId === id);
    const afetacoes = await app.ctx.repos.afetacoes.todos((a) => a.contratoId === id);
    const alteracoes = await app.ctx.repos.alteracoes.todos((a) => a.contratoId === id);
    const aprovados = await app.ctx.repos.registosTempo.todos((r) => r.contratoId === id && r.estado === 'APROVADO');
    const resumo = await app.contratos.resumoExecucao(id) as ResumoExec;
    return { contrato, perfis, afetacoes, alteracoes, aprovados, resumo };
  }, [id]);

  const dados = base.dados;
  if (dados === undefined || dados.contrato === null) return <p className="vazio">A carregar…</p>;
  const c = dados.contrato;

  return (
    <>
      <Cabecalho titulo={`${c.numero} · ${c.objeto}`} sub="Detalhe do contrato (fase de execução)" acoes={<Estado v={c.estado} />} />
      {erro !== undefined && <div className="erro-cx">⚠ {erro}</div>}
      <div className="seps">{TABS.filter((t) => t !== 'Capacidade' || c.tipologia === 'CHAVE_NA_MAO').map((t) => <button key={t} className={`sep${tab === t ? ' ativo' : ''}`} onClick={() => setTab(t)}>{t}</button>)}</div>

      {tab === 'Ficha' && (editar ? <FichaEdicao contrato={c} onGravado={() => { setEditar(false); base.recarregar(); }} onErro={setErro} /> : (
        <div className="cartao">
          {podeGerir && c.estado === 'EM_VIGOR' && <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '10px 12px 0' }}><button className="btn" onClick={() => { setEditar(true); setErro(undefined); }}>Alterar dados</button></div>}
          <div className="corpo g3">
          <Campo k="Prestador" v={c.prestador.nome} /><Campo k="NIPC" v={c.prestador.nipc} /><Campo k="Tipologia" v={c.tipologia === 'CHAVE_NA_MAO' ? 'Chave-na-mão' : 'Bolsa de horas'} />
          <Campo k="Nº procedimento de origem" v={c.numeroProcedimento ?? '—'} /><Campo k="Tipo de procedimento" v={(c.tipoProcedimento ?? '—').replace(/_/g, ' ').toLowerCase()} /><Campo k="Nº do lote" v={c.numeroLote !== undefined ? String(c.numeroLote) : '—'} />
          <Campo k="Valor inicial do contrato" v={formatarMoeda(c.precoContratualInicial)} /><Campo k="Valor atual do contrato" v={formatarMoeda(c.precoContratualAtual)} /><Campo k="Vigência" v={`${c.dataInicioVigencia} – ${c.dataTerminoContratual}`} />
          <Campo k="Visto prévio do TdC necessário" v={c.vistoTribunalContasNecessario ? 'Sim' : 'Não'} /><Campo k="Data de obtenção do visto" v={c.dataVistoTribunalContas ?? '—'} /><Campo k="Nº portaria de extensão de encargos" v={c.numeroPortariaExtensaoEncargos ?? '—'} />
          <Campo k="Gestor do contrato" v={c.gestores.map((g) => nomeAzure(g.utilizadorId)).join(', ')} />
          {c.motivoInativacao !== undefined && <Campo k="Motivo de inativação" v={c.motivoInativacao} />}
        </div></div>
      ))}

      {tab === 'Estrutura' && (
        <div className="cartao"><h3>Perfis contratuais{c.tipologia === 'CHAVE_NA_MAO' ? ' (chave-na-mão)' : ''}</h3><table>
          <thead><tr><th>Perfil</th><th className="num">Horas</th><th className="num">€/hora vigente</th></tr></thead>
          <tbody>{dados.perfis.map((p) => { const ultimo = p.precos[p.precos.length - 1]; return (
            <tr key={p.id}><td><div className="prim">{p.nome}</div>{p.consomeBolsaValor && <div className="sec">consome bolsa de valor</div>}</td><td className="num">{formatarHoras(p.quantidadePrevista)}</td><td className="num">{ultimo ? formatarMoeda(ultimo.valorHora) : '—'}</td></tr>
          ); })}{dados.perfis.length === 0 && <tr><td colSpan={3} className="vazio">Sem perfis.</td></tr>}</tbody>
        </table></div>
      )}

      {tab === 'Afetações' && (
        <div className="cartao"><h3>Afetações (ativa/inativa)</h3><table>
          <thead><tr><th>Recurso</th><th>Perfil</th><th>Estado</th></tr></thead>
          <tbody>{dados.afetacoes.map((a) => <tr key={a.id}><td>{nomeAzure(a.recursoId)}</td><td>{dados.perfis.find((p) => p.id === a.perfilId)?.nome ?? a.perfilId}</td><td><Estado v={a.ativa ? 'Ativa' : 'Inativa'} /></td></tr>)}
          {dados.afetacoes.length === 0 && <tr><td colSpan={3} className="vazio">Sem afetações.</td></tr>}</tbody>
        </table></div>
      )}

      {tab === 'Execução financeira' && (
        <>
          <div className="grelha-kpi">
            <div className="kpi"><div className="rot">Valor inicial do contrato</div><div className="val">{formatarMoeda(dados.resumo.valorInicialContrato)}</div></div>
            <div className="kpi"><div className="rot">Valor atual do contrato</div><div className="val">{formatarMoeda(dados.resumo.valorAtualContrato)}</div></div>
            <div className="kpi"><div className="rot">Valor executado</div><div className="val">{formatarMoeda(dados.resumo.valorExecutado)}</div></div>
            <div className="kpi"><div className="rot">Valor disponível</div><div className="val" style={{ color: dados.resumo.valorDisponivel <= dados.resumo.valorAtualContrato * 0.4 ? 'var(--ambar)' : undefined }}>{formatarMoeda(dados.resumo.valorDisponivel)}</div><div className="sub">{pct(dados.resumo.valorAtualContrato > 0 ? dados.resumo.valorDisponivel / dados.resumo.valorAtualContrato : 0)} do valor atual</div></div>
          </div>
          <div className="cartao" style={{ marginBottom: 16 }}><h3>Trabalhos complementares (limite legal 50% — RN-301)</h3><div className="corpo">
            <Barra fracao={dados.resumo.complementares.percentagem} />
            <div className="sec" style={{ marginTop: 6 }}>{dados.resumo.complementares.atingido ? 'Limite de 50% ATINGIDO' : `Máximo admissível disponível: ${formatarMoeda(dados.resumo.complementares.disponivel)}`}</div>
          </div></div>
          <div className="cartao"><h3>Saldos por perfil — horas e valor restantes</h3><table>
            <thead><tr><th>Perfil</th><th className="num">Horas restantes</th><th style={{ width: 130 }}>Consumo horas</th><th className="num">Valor restante</th></tr></thead>
            <tbody>{dados.resumo.saldosPerfis.map((s) => { const frac = s.minutosPrevistos > 0 ? s.minutosConsumidos / s.minutosPrevistos : 0; return (
              <tr key={s.perfilId}><td className="prim">{s.nome}</td><td className="num">{formatarHoras(s.minutosRestantes)}<div className="sec">de {formatarHoras(s.minutosPrevistos)}</div></td><td><Barra fracao={frac} /></td><td className="num">{formatarMoeda(s.valorRestante)}<div className="sec">de {formatarMoeda(s.valorPrevisto)}</div></td></tr>
            ); })}{dados.resumo.saldosPerfis.length === 0 && <tr><td colSpan={4} className="vazio">Sem perfis.</td></tr>}</tbody>
          </table></div>
        </>
      )}

      {tab === 'Capacidade' && <Capacidade contrato={c} perfis={dados.perfis} afetacoes={dados.afetacoes} aprovados={dados.aprovados} />}

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

/** Formulário de alteração dos dados do contrato + inativação com motivo. */
function FichaEdicao({ contrato, onGravado, onErro }: { contrato: import('@chora/domain').Contrato; onGravado: () => void; onErro: (m: string) => void }): ReactNode {
  const [f, setF] = useState({
    objeto: contrato.objeto,
    precoContratualAtual: contrato.precoContratualAtual,
    dataTerminoContratual: contrato.dataTerminoContratual,
    vistoTribunalContasNecessario: contrato.vistoTribunalContasNecessario,
    dataVistoTribunalContas: contrato.dataVistoTribunalContas ?? '',
    numeroPortariaExtensaoEncargos: contrato.numeroPortariaExtensaoEncargos ?? '',
  });
  const [inativarEstado, setInativarEstado] = useState<EstadoContrato>('TERMINADO');
  const [motivo, setMotivo] = useState('');

  async function guardar(): Promise<void> {
    onErro('');
    try {
      await app.contratos.atualizar(contrato.id, {
        objeto: f.objeto,
        precoContratualAtual: f.precoContratualAtual,
        dataTerminoContratual: f.dataTerminoContratual,
        vistoTribunalContasNecessario: f.vistoTribunalContasNecessario,
        ...(f.dataVistoTribunalContas !== '' ? { dataVistoTribunalContas: f.dataVistoTribunalContas } : {}),
        ...(f.numeroPortariaExtensaoEncargos !== '' ? { numeroPortariaExtensaoEncargos: f.numeroPortariaExtensaoEncargos } : {}),
      }, app.utilizador());
      onGravado();
    } catch (e) { onErro(mensagemErro(e)); }
  }

  async function inativar(): Promise<void> {
    onErro('');
    try {
      await app.contratos.inativar(contrato.id, inativarEstado, motivo, app.utilizador());
      onGravado();
    } catch (e) { onErro(mensagemErro(e)); }
  }

  return (
    <div className="duas">
      <div className="cartao"><h3>Alterar dados do contrato</h3><div className="corpo">
        <div className="campo"><label>Objeto</label><input value={f.objeto} onChange={(e) => setF({ ...f, objeto: e.target.value })} /></div>
        <div className="g2">
          <div className="campo"><label>Valor atual do contrato (cêntimos)</label><input type="number" value={f.precoContratualAtual} onChange={(e) => setF({ ...f, precoContratualAtual: Number(e.target.value) })} /></div>
          <div className="campo"><label>Término do contrato</label><input type="date" value={f.dataTerminoContratual} onChange={(e) => setF({ ...f, dataTerminoContratual: e.target.value })} /></div>
        </div>
        <div className="campo"><label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13 }}><input type="checkbox" checked={f.vistoTribunalContasNecessario} onChange={(e) => setF({ ...f, vistoTribunalContasNecessario: e.target.checked })} /> Visto prévio do Tribunal de Contas necessário</label></div>
        <div className="g2">
          <div className="campo"><label>Data de obtenção do visto</label><input type="date" value={f.dataVistoTribunalContas} onChange={(e) => setF({ ...f, dataVistoTribunalContas: e.target.value })} /></div>
          <div className="campo"><label>Nº portaria de extensão de encargos</label><input value={f.numeroPortariaExtensaoEncargos} onChange={(e) => setF({ ...f, numeroPortariaExtensaoEncargos: e.target.value })} /></div>
        </div>
        <button className="btn pri" onClick={() => void guardar()}>Guardar alterações</button>
      </div></div>
      <div className="cartao"><h3>Inativar contrato</h3><div className="corpo">
        <div className="aviso" style={{ marginBottom: 12 }}>A inativação regista o estado terminal e o motivo. É uma operação de execução (não pré-contratual).</div>
        <div className="campo"><label>Estado terminal</label><select value={inativarEstado} onChange={(e) => setInativarEstado(e.target.value as EstadoContrato)}>{ESTADOS_INATIVACAO.map((s) => <option key={s} value={s}>{s.charAt(0) + s.slice(1).toLowerCase()}</option>)}</select></div>
        <div className="campo"><label>Motivo (obrigatório)</label><textarea rows={3} value={motivo} onChange={(e) => setMotivo(e.target.value)} /></div>
        <button className="btn" style={{ color: 'var(--vermelho)' }} disabled={motivo.trim() === ''} onClick={() => void inativar()}>Inativar contrato</button>
      </div></div>
    </div>
  );
}

function Campo({ k, v }: { k: string; v: string }): ReactNode {
  return <div className="campo" style={{ margin: 0 }}><label>{k}</label><div style={{ fontWeight: 600, fontSize: 13.5 }}>{v}</div></div>;
}

/**
 * Dashboard de capacidade (só chave-na-mão). A partir das horas contratadas por
 * perfil, das horas já consumidas e dos dias úteis que faltam até ao término,
 * estima a afetação-alvo (pessoas a tempo inteiro, 8 h/dia × 5 dias/semana) e
 * quantas pessoas ainda faltam afetar face a esse alvo. É um alvo teórico: não
 * desconta feriados, férias, faltas nem ramp-up.
 */
function Capacidade({ contrato, perfis, afetacoes, aprovados }: { contrato: Contrato; perfis: PerfilContratual[]; afetacoes: Afetacao[]; aprovados: RegistoTempo[] }): ReactNode {
  const hojeStr = hoje();
  const { dias, capacidadePessoaH, linhas, totalFalta, algumInfinito } = calcularCapacidade(contrato.dataTerminoContratual, hojeStr, perfis, afetacoes, aprovados);

  return (
    <>
      <div className="grelha-kpi">
        <div className="kpi"><div className="rot">Data de referência</div><div className="val" style={{ fontSize: 18 }}>{hojeStr}</div><div className="sub">momento da visualização</div></div>
        <div className="kpi"><div className="rot">Dias úteis até ao término</div><div className="val">{dias}</div><div className="sub">seg–sex até {contrato.dataTerminoContratual}</div></div>
        <div className="kpi"><div className="rot">Capacidade por pessoa</div><div className="val">{formatarHoras(capacidadePessoaH * 60)}</div><div className="sub">8 h/dia no período restante</div></div>
        <div className="kpi"><div className="rot">Pessoas em falta (total)</div><div className="val" style={{ color: totalFalta > 0 ? 'var(--ambar)' : 'var(--verde)' }}>{algumInfinito ? '—' : totalFalta}</div><div className="sub">{totalFalta > 0 ? 'abaixo do alvo' : 'afetação suficiente'}</div></div>
      </div>
      {dias <= 0 && <div className="aviso" style={{ marginBottom: 16 }}>Não há dias úteis até ao término (prazo esgotado ou término no passado): a afetação-alvo não é calculável.</div>}
      <div className="cartao"><h3>Afetação-alvo por perfil</h3><table>
        <thead><tr><th>Perfil</th><th className="num">Horas restantes</th><th className="num">Afetação-alvo (FTE)</th><th className="num">Pessoas afetas</th><th className="num">Pessoas em falta</th></tr></thead>
        <tbody>{linhas.map((l) => (
          <tr key={l.perfilId}>
            <td className="prim">{l.nome}</td>
            <td className="num">{formatarHoras(l.restantesH * 60)}</td>
            <td className="num">{Number.isFinite(l.alvo) ? `${l.alvo.toFixed(2)} → ${l.alvoTeto}` : '—'}</td>
            <td className="num">{l.afetas}</td>
            <td className="num" style={{ color: Number.isFinite(l.emFalta) && l.emFalta > 0 ? 'var(--ambar)' : undefined, fontWeight: 600 }}>{Number.isFinite(l.emFalta) ? l.emFalta : '—'}</td>
          </tr>
        ))}{linhas.length === 0 && <tr><td colSpan={5} className="vazio">Sem perfis.</td></tr>}</tbody>
      </table>
      <div className="aviso" style={{ margin: 12 }}>Afetação-alvo = horas restantes ÷ (8 h × dias úteis até ao término). Assume 8 h/dia, 5 dias/semana; alvo teórico, sem feriados/férias.</div>
      </div>
    </>
  );
}

interface ResumoExec {
  valorInicialContrato: number; valorAtualContrato: number; valorExecutado: number; valorDisponivel: number;
  complementares: { percentagem: number; atingido: boolean; disponivel: number };
  saldosPerfis: Array<{ perfilId: string; nome: string; minutosPrevistos: number; minutosConsumidos: number; minutosRestantes: number; valorPrevisto: number; valorRestante: number }>;
}
