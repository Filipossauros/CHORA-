import { useEffect, useState, type ReactNode } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { ESTADOS_CONTRATO, type Afetacao, type Contrato, type EstadoContrato, type PerfilContratual, type RegistoTempo } from '@chora/domain';
import { app, AZURE_USERS, nomeAzure, prestadorAzure } from '../porta/aplicacao-local.js';
import { Cabecalho } from '../app/Shell.js';
import { Barra, Estado, centParaEuros, eurosParaCent, formatarHoras, formatarMoeda, hoje, horasParaMin, mensagemErro, pct, useAsync } from '../comum.js';
import { calcularCapacidade } from '../capacidade.js';

const RECURSOS_AZURE = AZURE_USERS.filter((u) => u.prestador !== undefined);
function rotularOperacao(op: string): string {
  if (op.startsWith('ALTERAR_ESTADO')) return 'Alteração de estado';
  if (op.startsWith('ESTADO:')) return 'Transição de estado';
  if (op.startsWith('INATIVAR')) return 'Inativação';
  const m: Record<string, string> = { CRIAR: 'Criação', ATUALIZAR: 'Atualização de dados', EXCECAO: 'Exceção fundamentada' };
  return m[op] ?? op;
}
function resumirEvento(e: { operacao: string; regraViolada?: string; depois?: unknown }): string {
  const dep = e.depois as { notaAlteracaoEstado?: string; motivoInativacao?: string } | undefined;
  if (e.operacao.startsWith('ALTERAR_ESTADO:')) return `${e.operacao.slice('ALTERAR_ESTADO:'.length).replace('->', ' → ')}${dep?.notaAlteracaoEstado !== undefined ? ` · ${dep.notaAlteracaoEstado}` : ''}`;
  if (e.operacao.startsWith('INATIVAR')) return dep?.motivoInativacao ?? 'Inativação do contrato';
  if (e.operacao === 'ATUALIZAR') return 'Dados do contrato atualizados';
  if (e.operacao === 'CRIAR') return 'Contrato criado';
  return e.regraViolada ?? '—';
}

const TABS = ['Ficha', 'Estrutura', 'Afetações', 'Execução financeira', 'Capacidade', 'Histórico de alterações'] as const;
type Tab = (typeof TABS)[number];

export function ContratoDetalhe(): ReactNode {
  const { id = '' } = useParams();
  const [params] = useSearchParams();
  const tabPedido = params.get('tab');
  const [tab, setTab] = useState<Tab>((TABS as readonly string[]).includes(tabPedido ?? '') ? (tabPedido as Tab) : 'Ficha');
  const podeGerir = app.papeisAtuais().some((p) => p === 'GESTOR_CONTRATO' || p === 'GESTOR_TECNICO');
  // O ciclo de vida do contrato (estado) é competência do gestor de contrato (RN-501).
  const ehGestorContrato = app.papeisAtuais().includes('GESTOR_CONTRATO');
  const [erro, setErro] = useState<string>();
  const [editar, setEditar] = useState(false);

  // A mesma rota /contratos/:id é reutilizada entre contratos (não remonta):
  // ao mudar de contrato, repõe o separador pedido no URL (ou a Ficha) e fecha a edição.
  useEffect(() => {
    setTab((TABS as readonly string[]).includes(tabPedido ?? '') ? (tabPedido as Tab) : 'Ficha');
    setEditar(false);
    setErro(undefined);
  }, [id, tabPedido]);

  const base = useAsync(async () => {
    const contrato = await app.ctx.repos.contratos.obter(id);
    const perfis = await app.ctx.repos.perfis.todos((p) => p.contratoId === id);
    const afetacoes = await app.ctx.repos.afetacoes.todos((a) => a.contratoId === id);
    const alteracoes = await app.ctx.repos.alteracoes.todos((a) => a.contratoId === id);
    const aprovados = await app.ctx.repos.registosTempo.todos((r) => r.contratoId === id && r.estado === 'APROVADO');
    const eventos = (await app.ctx.repos.eventosAuditoria.todos((e) => e.entidade === 'Contrato' && e.entidadeId === id)).sort((a, b) => (a.ocorridoEm < b.ocorridoEm ? 1 : -1));
    const recursos = await app.ctx.repos.recursos.todos();
    const resumo = await app.contratos.resumoExecucao(id) as ResumoExec;
    return { contrato, perfis, afetacoes, alteracoes, aprovados, eventos, recursos, resumo };
  }, [id]);

  const dados = base.dados;
  if (dados === undefined || dados.contrato === null) return <p className="vazio">A carregar…</p>;
  const c = dados.contrato;

  return (
    <>
      <Cabecalho titulo={`${c.numero} · ${c.objeto}`} sub="Detalhe do contrato (fase de execução)" acoes={<Estado v={c.estado} />} />
      {erro !== undefined && erro !== '' && <div className="erro-cx">⚠ {erro}</div>}
      <div className="seps">{TABS.filter((t) => t !== 'Capacidade' || c.tipologia === 'BOLSA_HORAS').map((t) => <button key={t} className={`sep${tab === t ? ' ativo' : ''}`} onClick={() => setTab(t)}>{t}</button>)}</div>

      {tab === 'Ficha' && (editar ? <FichaEdicao contrato={c} podeAlterarEstado={ehGestorContrato} onGravado={() => { setEditar(false); base.recarregar(); }} onErro={setErro} /> : (
        <div className="cartao">
          {podeGerir && <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '10px 12px 0' }}><button className="btn" onClick={() => { setEditar(true); setErro(undefined); }}>Alterar dados</button></div>}
          <div className="corpo g3">
          <Campo k="Prestador" v={c.prestador.nome} /><Campo k="NIPC" v={c.prestador.nipc} /><Campo k="Tipologia" v={c.tipologia === 'CHAVE_NA_MAO' ? 'Chave-na-mão' : 'Bolsa de horas'} />
          <Campo k="Nº procedimento de origem" v={c.numeroProcedimento ?? '—'} /><Campo k="Tipo de procedimento" v={(c.tipoProcedimento ?? '—').replace(/_/g, ' ').toLowerCase()} /><Campo k="Nº do lote" v={c.numeroLote !== undefined ? String(c.numeroLote) : '—'} />
          <Campo k="Valor inicial do contrato" v={formatarMoeda(c.precoContratualInicial)} /><Campo k="Valor atual do contrato" v={formatarMoeda(c.precoContratualAtual)} /><Campo k="Vigência" v={`${c.dataInicioVigencia} – ${c.dataTerminoContratual}`} />
          <Campo k="Visto prévio do TdC necessário" v={c.vistoTribunalContasNecessario ? 'Sim' : 'Não'} /><Campo k="Data de obtenção do visto do TdC" v={c.dataVistoTribunalContas ?? '—'} /><Campo k="Nº portaria de extensão de encargos" v={c.numeroPortariaExtensaoEncargos ?? '—'} />
          <Campo k="Gestor do contrato" v={c.gestores.map((g) => nomeAzure(g.utilizadorId)).join(', ')} />
          {c.motivoInativacao !== undefined && <Campo k="Motivo de inativação" v={c.motivoInativacao} />}
          {c.notaAlteracaoEstado !== undefined && <Campo k="Nota da última alteração de estado" v={c.notaAlteracaoEstado} />}
        </div></div>
      ))}

      {tab === 'Estrutura' && (
        <div style={{ display: 'grid', gridTemplateColumns: podeGerir && c.tipologia === 'BOLSA_HORAS' ? '1fr 320px' : '1fr', gap: 16 }}>
          <div className="cartao"><h3>Perfis contratuais{c.tipologia === 'BOLSA_HORAS' ? ' (bolsa de horas)' : ''}</h3><table>
            <thead><tr><th>Perfil</th><th className="num">Horas</th><th className="num">€/hora vigente</th></tr></thead>
            <tbody>{dados.perfis.map((p) => { const ultimo = p.precos[p.precos.length - 1]; return (
              <tr key={p.id}><td><div className="prim">{p.nome}</div>{p.consomeBolsaValor && <div className="sec">consome bolsa de valor</div>}</td><td className="num">{formatarHoras(p.quantidadePrevista)}</td><td className="num">{ultimo ? formatarMoeda(ultimo.valorHora) : '—'}</td></tr>
            ); })}{dados.perfis.length === 0 && <tr><td colSpan={3} className="vazio">{c.tipologia === 'CHAVE_NA_MAO' ? 'Contrato chave-na-mão: sem perfis contratuais.' : 'Sem perfis.'}</td></tr>}</tbody>
          </table></div>
          {podeGerir && c.tipologia === 'BOLSA_HORAS' && <NovoPerfil contrato={c} onCriado={() => base.recarregar()} onErro={setErro} />}
        </div>
      )}

      {tab === 'Afetações' && (
        <GestaoAfetacoes contrato={c} perfis={dados.perfis} afetacoes={dados.afetacoes} podeGerir={podeGerir} onMudou={() => base.recarregar()} onErro={setErro} />
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

      {tab === 'Capacidade' && c.tipologia === 'BOLSA_HORAS' && <Capacidade contrato={c} perfis={dados.perfis} afetacoes={dados.afetacoes} aprovados={dados.aprovados} />}

      {tab === 'Histórico de alterações' && (
        <>
          <div className="cartao" style={{ marginBottom: 16 }}><h3>Registo de alterações (auditoria do contrato)</h3><table>
            <thead><tr><th>Quando</th><th>Operação</th><th>Detalhe</th><th>Autor</th></tr></thead>
            <tbody>{dados.eventos.map((e) => <tr key={e.id}><td className="tabnum">{e.ocorridoEm.replace('T', ' ').slice(0, 16)}</td><td>{rotularOperacao(e.operacao)}</td><td className="sec">{resumirEvento(e)}</td><td>{nomeAzure(e.utilizadorId)}</td></tr>)}
            {dados.eventos.length === 0 && <tr><td colSpan={4} className="vazio">Sem alterações registadas.</td></tr>}</tbody>
          </table></div>
          <div className="cartao"><h3>Alterações contratuais formais (complementares, suspensões)</h3><table>
            <thead><tr><th>Data efeito</th><th>Tipo</th><th>Fundamentação</th><th className="num">Valor</th><th>Publicitação</th></tr></thead>
            <tbody>{dados.alteracoes.map((a) => <tr key={a.id}><td className="tabnum">{a.dataEfeito}</td><td>{a.tipo.replace(/_/g, ' ').toLowerCase()}</td><td>{a.fundamentacao}</td><td className="num">{a.valorAcrescido !== undefined ? formatarMoeda(a.valorAcrescido) : '—'}</td><td>{a.publicitacaoPortalBase?.efetuadaEm !== undefined ? <Estado v="VALIDADA" /> : a.publicitacaoPortalBase?.obrigatoria ? <Estado v="INVALIDADA" /> : '—'}</td></tr>)}
            {dados.alteracoes.length === 0 && <tr><td colSpan={5} className="vazio">Sem alterações contratuais formais.</td></tr>}</tbody>
          </table></div>
        </>
      )}
    </>
  );
}

const ROT_ESTADO: Record<EstadoContrato, string> = {
  EM_PREPARACAO: 'Em preparação', AGUARDA_VISTO: 'Aguarda visto TdC', EM_VIGOR: 'Em vigor',
  SUSPENSO: 'Suspenso', TERMINADO: 'Terminado', RESOLVIDO: 'Resolvido', CADUCADO: 'Caducado', REVOGADO: 'Revogado',
};
const ESTADOS_TERMINAIS: EstadoContrato[] = ['TERMINADO', 'RESOLVIDO', 'CADUCADO', 'REVOGADO'];

/** Formulário de alteração dos dados do contrato + alteração livre de estado. */
function FichaEdicao({ contrato, podeAlterarEstado, onGravado, onErro }: { contrato: Contrato; podeAlterarEstado: boolean; onGravado: () => void; onErro: (m?: string) => void }): ReactNode {
  const [f, setF] = useState({
    objeto: contrato.objeto,
    // valor em euros como texto para permitir apagar a célula (não fica "0" preso)
    precoContratualAtual: centParaEuros(contrato.precoContratualAtual),
    dataTerminoContratual: contrato.dataTerminoContratual,
    vistoTribunalContasNecessario: contrato.vistoTribunalContasNecessario,
    dataVistoTribunalContas: contrato.dataVistoTribunalContas ?? '',
    dataPrevistaVistoTribunalContas: contrato.dataPrevistaVistoTribunalContas ?? '',
    numeroPortariaExtensaoEncargos: contrato.numeroPortariaExtensaoEncargos ?? '',
  });
  const [novoEstado, setNovoEstado] = useState<EstadoContrato>(contrato.estado);
  const [nota, setNota] = useState('');

  async function guardar(): Promise<void> {
    onErro();
    if (f.precoContratualAtual.trim() === '') { onErro('O valor atual do contrato não pode ficar vazio.'); return; }
    const valor = eurosParaCent(f.precoContratualAtual);
    if (valor < 0) { onErro('O valor atual do contrato tem de ser um número não negativo.'); return; }
    try {
      await app.contratos.atualizar(contrato.id, {
        objeto: f.objeto,
        precoContratualAtual: valor,
        dataTerminoContratual: f.dataTerminoContratual,
        vistoTribunalContasNecessario: f.vistoTribunalContasNecessario,
        ...(f.dataVistoTribunalContas !== '' ? { dataVistoTribunalContas: f.dataVistoTribunalContas } : {}),
        ...(f.dataPrevistaVistoTribunalContas !== '' ? { dataPrevistaVistoTribunalContas: f.dataPrevistaVistoTribunalContas } : {}),
        ...(f.numeroPortariaExtensaoEncargos !== '' ? { numeroPortariaExtensaoEncargos: f.numeroPortariaExtensaoEncargos } : {}),
      }, app.utilizador());
      onGravado();
    } catch (e) { onErro(mensagemErro(e)); }
  }

  async function alterarEstado(): Promise<void> {
    onErro();
    // Confirmação ao entrar num estado terminal ou ao reverter a partir dele.
    const envolveTerminal = ESTADOS_TERMINAIS.includes(novoEstado) || ESTADOS_TERMINAIS.includes(contrato.estado);
    if (envolveTerminal && !window.confirm(`Vai alterar o estado de "${ROT_ESTADO[contrato.estado]}" para "${ROT_ESTADO[novoEstado]}". Esta é uma operação sensível (estado terminal). Confirmar?`)) return;
    // O bloqueio de EM_VIGOR sem visto assegurado é aplicado no serviço (erro visível).
    try {
      await app.contratos.alterarEstado(contrato.id, novoEstado, nota, app.utilizador());
      onGravado();
    } catch (e) { onErro(mensagemErro(e)); }
  }

  return (
    <div className="duas">
      <div className="cartao"><h3>Alterar dados do contrato</h3><div className="corpo">
        <div className="campo"><label>Objeto</label><input value={f.objeto} onChange={(e) => setF({ ...f, objeto: e.target.value })} /></div>
        <div className="g2">
          <div className="campo"><label>Valor atual do contrato (€)</label><input type="number" min={0} step="0.01" value={f.precoContratualAtual} onChange={(e) => setF({ ...f, precoContratualAtual: e.target.value })} placeholder="ex.: 100000" /></div>
          <div className="campo"><label>Data de término do contrato</label><input type="date" value={f.dataTerminoContratual} onChange={(e) => setF({ ...f, dataTerminoContratual: e.target.value })} /></div>
        </div>
        <div className="campo"><label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13 }}><input type="checkbox" checked={f.vistoTribunalContasNecessario} onChange={(e) => setF({ ...f, vistoTribunalContasNecessario: e.target.checked })} /> Visto prévio do Tribunal de Contas necessário</label></div>
        <div className="g2">
          <div className="campo"><label>Data de obtenção do visto do TdC</label><input type="date" value={f.dataVistoTribunalContas} onChange={(e) => setF({ ...f, dataVistoTribunalContas: e.target.value })} disabled={!f.vistoTribunalContasNecessario} /></div>
          <div className="campo"><label>Data prevista de obtenção do visto</label><input type="date" value={f.dataPrevistaVistoTribunalContas} onChange={(e) => setF({ ...f, dataPrevistaVistoTribunalContas: e.target.value })} disabled={!f.vistoTribunalContasNecessario} /></div>
        </div>
        <div className="campo"><label>Nº portaria de extensão de encargos</label><input value={f.numeroPortariaExtensaoEncargos} onChange={(e) => setF({ ...f, numeroPortariaExtensaoEncargos: e.target.value })} /></div>
        <button className="btn pri" onClick={() => void guardar()}>Guardar alterações</button>
      </div></div>
      <div className="cartao"><h3>Alterar estado do contrato</h3><div className="corpo">
        {podeAlterarEstado ? (
          <>
            <div className="aviso" style={{ marginBottom: 12 }}>Permite corrigir/reverter o estado (incluindo reativar de suspenso ou terminado). A alteração fica registada na auditoria e a nota visível na ficha.</div>
            <div className="campo"><label>Estado atual</label><div style={{ marginTop: 2 }}><Estado v={contrato.estado} /></div></div>
            <div className="campo"><label>Novo estado</label><select value={novoEstado} onChange={(e) => setNovoEstado(e.target.value as EstadoContrato)}>{ESTADOS_CONTRATO.map((s) => <option key={s} value={s}>{ROT_ESTADO[s]}</option>)}</select></div>
            <div className="campo"><label>Nota / motivo (obrigatório)</label><textarea rows={3} value={nota} onChange={(e) => setNota(e.target.value)} /></div>
            <button className="btn" disabled={nota.trim() === '' || novoEstado === contrato.estado} onClick={() => void alterarEstado()}>Aplicar novo estado</button>
          </>
        ) : (
          <div className="sec">A alteração do estado do contrato é competência do <b>Gestor de Contrato</b> (RN-501). Estado atual: <Estado v={contrato.estado} /></div>
        )}
      </div></div>
    </div>
  );
}

/** Criação manual de um perfil contratual (bolsa de horas) no detalhe. */
function NovoPerfil({ contrato, onCriado, onErro }: { contrato: Contrato; onCriado: () => void; onErro: (m?: string) => void }): ReactNode {
  const [p, setP] = useState({ nome: '', horas: '', valorHora: '' });
  async function criar(): Promise<void> {
    onErro();
    const horas = Number(p.horas); const valorHoraCent = eurosParaCent(p.valorHora);
    if (p.nome.trim() === '' || !Number.isFinite(horas) || horas <= 0 || valorHoraCent <= 0) {
      onErro('Indique nome, horas (> 0) e valor/hora (€ > 0) do perfil.'); return;
    }
    try {
      await app.estrutura.criarPerfil(contrato.id, { nome: p.nome.trim(), quantidadePrevista: horasParaMin(horas), consomeBolsaValor: false, consomeTrabalhosComplementares: false, perfilDeGestao: false, valorHora: valorHoraCent, vigenteDe: contrato.dataInicioVigencia }, app.utilizador());
      setP({ nome: '', horas: '', valorHora: '' });
      onCriado();
    } catch (e) { onErro(mensagemErro(e)); }
  }
  return (
    <div className="cartao"><h3>Novo perfil</h3><div className="corpo">
      <div className="campo"><label>Nome do perfil</label><input value={p.nome} onChange={(e) => setP({ ...p, nome: e.target.value })} placeholder="ex.: Programador Sénior" /></div>
      <div className="campo"><label>Horas contratadas</label><input type="number" min={1} value={p.horas} onChange={(e) => setP({ ...p, horas: e.target.value })} /></div>
      <div className="campo"><label>Valor/hora (€)</label><input type="number" min={0} step="0.01" value={p.valorHora} onChange={(e) => setP({ ...p, valorHora: e.target.value })} /></div>
      <div className="aviso" style={{ marginBottom: 10 }}>O total dos perfis não pode exceder o valor do contrato <code>RN-105</code>.</div>
      <button className="btn pri" style={{ width: '100%', justifyContent: 'center' }} onClick={() => void criar()}>Criar perfil</button>
    </div></div>
  );
}

function Campo({ k, v }: { k: string; v: string }): ReactNode {
  return <div className="campo" style={{ margin: 0 }}><label>{k}</label><div style={{ fontWeight: 600, fontSize: 13.5 }}>{v}</div></div>;
}

/**
 * Gestão de afetações do contrato (movida do antigo menu Afetações para o
 * separador do detalhe). Afetar recurso a um perfil, substituir e ativar/inativar.
 */
function GestaoAfetacoes({ contrato, perfis, afetacoes, podeGerir, onMudou, onErro }: { contrato: Contrato; perfis: PerfilContratual[]; afetacoes: Afetacao[]; podeGerir: boolean; onMudou: () => void; onErro: (m?: string) => void }): ReactNode {
  const [form, setForm] = useState({ perfilId: '', recursoId: '' });

  async function garantirRecurso(recursoId: string): Promise<void> {
    if ((await app.ctx.repos.recursos.obter(recursoId)) === null) {
      await app.recursos.criar(recursoId, contrato.prestador.nipc || '000000000', app.utilizador());
    }
  }
  async function criar(): Promise<void> {
    onErro();
    try {
      await garantirRecurso(form.recursoId);
      await app.afetacoes.criar({ contratoId: contrato.id, perfilId: form.perfilId, recursoId: form.recursoId }, app.utilizador());
      setForm({ perfilId: '', recursoId: '' });
      onMudou();
    } catch (e) { onErro(mensagemErro(e)); }
  }
  async function substituir(id: string): Promise<void> {
    const novo = prompt('Substituir por (utilizador Azure — oid), mesma entidade executante:');
    if (novo === null || novo.trim() === '') return;
    onErro();
    try { await garantirRecurso(novo.trim()); await app.afetacoes.substituir(id, novo.trim(), app.utilizador()); onMudou(); }
    catch (e) { onErro(mensagemErro(e)); }
  }
  async function alternar(id: string, ativa: boolean): Promise<void> {
    onErro();
    try { await app.afetacoes.definirAtiva(id, !ativa, app.utilizador()); onMudou(); }
    catch (e) { onErro(mensagemErro(e)); }
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: podeGerir ? '1fr 340px' : '1fr', gap: 16 }}>
      <div className="cartao"><h3>Afetações do contrato · {afetacoes.filter((a) => a.ativa).length} ativas</h3><table>
        <thead><tr><th>Recurso</th><th>Perfil</th><th>Estado</th>{podeGerir && <th></th>}</tr></thead>
        <tbody>{afetacoes.map((a) => (
          <tr key={a.id}>
            <td className="prim">{nomeAzure(a.recursoId)}<div className="sec">{prestadorAzure(a.recursoId) ?? ''}</div></td>
            <td>{perfis.find((p) => p.id === a.perfilId)?.nome ?? a.perfilId}</td>
            <td><Estado v={a.ativa ? 'Ativa' : 'Inativa'} /></td>
            {podeGerir && <td style={{ whiteSpace: 'nowrap' }}><button className="btn sm" onClick={() => void alternar(a.id, a.ativa)}>{a.ativa ? 'Inativar' : 'Ativar'}</button> <button className="btn sm" onClick={() => void substituir(a.id)}>Substituir</button></td>}
          </tr>
        ))}{afetacoes.length === 0 && <tr><td colSpan={podeGerir ? 4 : 3} className="vazio">Sem afetações.</td></tr>}</tbody>
      </table></div>
      {podeGerir && (
        <div className="cartao"><h3>Nova afetação</h3><div className="corpo">
          <div className="campo"><label>Perfil (do contrato)</label><select value={form.perfilId} onChange={(e) => setForm({ ...form, perfilId: e.target.value })}><option value="">— selecionar —</option>{perfis.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}</select></div>
          <div className="campo"><label>Recurso (utilizador Azure)</label><select value={form.recursoId} onChange={(e) => setForm({ ...form, recursoId: e.target.value })}><option value="">— selecionar —</option>{RECURSOS_AZURE.map((r) => <option key={r.id} value={r.id}>{r.nome} · {r.prestador}</option>)}</select></div>
          <div className="aviso" style={{ marginBottom: 12 }}>A afetação mantém-se até indicação manual de inativação ou substituição.</div>
          <button className="btn pri" style={{ width: '100%', justifyContent: 'center' }} disabled={form.perfilId === '' || form.recursoId === '' || perfis.length === 0} onClick={() => void criar()}>Criar afetação</button>
          {perfis.length === 0 && <div className="sec" style={{ marginTop: 8 }}>Este contrato ainda não tem perfis. Defina perfis no separador Estrutura.</div>}
        </div></div>
      )}
    </div>
  );
}

/**
 * Dashboard de capacidade (só bolsa de horas). A partir das horas contratadas por
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
